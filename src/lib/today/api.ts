import "server-only";

import { planToday } from "@/lib/today/plan";
import { hoursFrom } from "@/lib/today/presets";
import { fetchWaypointsForCandidates, MAX_WAYPOINT_CITIES } from "@/lib/routing/recommend";
import { buildRankedGroupsWith, type WaypointFetchResult } from "@/lib/routing/scoring";
import { waypointProfileForMoods } from "@/lib/personas/moodProfile";
import { MOODS, type MoodId } from "@/lib/roadside/tags";
import { kindWord } from "@/lib/plan/words";
import { rowBadges } from "@/lib/plan/badges";
import { waypointCoords } from "@/lib/atlas/queries";
import type { LatLng } from "@/lib/plan/types";

/**
 * GET /api/today for the car app (docs/car-api.md, agreed with the
 * roadtripper-car session 2026-11-10): today's towns and places from a
 * point, the hours you will drive and up to two moods, computed exactly as
 * the /today page computes them. Atlas reads only; no Routes API call.
 *
 * The response is a discriminated union on `status` (CLAUDE.md: never
 * `T | null` for mutually exclusive states). "version" bumps only on a
 * breaking change.
 */
export const TODAY_API_VERSION = 1;

export interface TodayApiPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** The web app's plain word for its kind: "Culture", "Landmark", "Food"... */
  kind: string;
  /** One or two sentences, or null. Untrusted model text: plain text only. */
  line: string | null;
  badge: "pick" | "good" | null;
}

export interface TodayApiTown {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** One way from `here`, on the calibrated drive graph, whole minutes. */
  driveMinutes: number;
  /** The atlas's country ("Canada"); compare with `here.country` to label a town across a border (v1 addition, U52). */
  country: string;
  places: TodayApiPlace[];
}

type Here = { cityId: string; name: string; lat: number; lng: number; distanceKm: number; country: string };

export type TodayApiResponse =
  | {
      version: 1;
      status: "ok";
      generatedAt: string;
      origin: LatLng;
      here: Here;
      hours: number;
      moods: MoodId[];
      placesComplete: boolean;
      towns: TodayApiTown[];
    }
  | { version: 1; status: "no-city"; generatedAt: string }
  | { version: 1; status: "no-graph"; generatedAt: string; here: Here }
  | { version: 1; status: "bad-request"; message: string }
  | { version: 1; status: "rate-limited"; retryAfterSeconds: number }
  | { version: 1; status: "error"; message: string };

export type TodayQuery =
  | { ok: true; origin: LatLng; hours: number; moods: MoodId[] }
  | { ok: false; message: string };

/**
 * The query, strictly. lat and lng are required. hours falls back to the
 * /today page's default (5) when missing or not one of its choices, and the
 * answer echoes it (the car app checks). A mood the app does not know, or
 * more than two, is a 400: both sides hold the same eight ids, so drift
 * should be loud (agreed with the car session).
 */
export function parseTodayQuery(q: URLSearchParams): TodayQuery {
  // Trimmed first: Number(" ") is 0, so a blank value would otherwise pass
  // as the equator or the meridian (PR #164 council).
  const latRaw = (q.get("lat") ?? "").trim();
  const lngRaw = (q.get("lng") ?? "").trim();
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (latRaw === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, message: "lat must be a number between -90 and 90" };
  }
  if (lngRaw === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, message: "lng must be a number between -180 and 180" };
  }
  const raw = (q.get("moods") ?? "").split(",").map((m) => m.trim()).filter((m) => m !== "");
  const unknown = raw.find((m) => !(MOODS as readonly string[]).includes(m));
  if (unknown !== undefined) {
    return { ok: false, message: `unknown mood "${unknown.slice(0, 40)}"; moods are ${MOODS.join(", ")}` };
  }
  const moods = [...new Set(raw)] as MoodId[];
  // Two, because the web app's chips take two (U6: a third tap drops the
  // oldest) and the ranking profile unions at most two moods' kinds; the
  // car app offers the same choice.
  if (moods.length > 2) return { ok: false, message: "at most two moods" };
  return { ok: true, origin: { lat, lng }, hours: hoursFrom(q.get("hours") ?? undefined), moods };
}

/** The answer for a parsed query; `now` is injectable for tests. */
export async function todayAnswer(origin: LatLng, hours: number, moods: MoodId[], now: Date = new Date()): Promise<TodayApiResponse> {
  const generatedAt = now.toISOString();
  const plan = planToday(origin, hours);
  if (plan.reach === "no-city" || !plan.here) return { version: 1, status: "no-city", generatedAt };
  const here: Here = {
    cityId: plan.here.city.id,
    name: plan.here.city.name,
    lat: plan.here.city.lat,
    lng: plan.here.city.lng,
    distanceKm: Math.round(plan.here.distanceKm * 10) / 10,
    country: plan.here.city.country,
  };
  if (plan.reach === "no-graph") return { version: 1, status: "no-graph", generatedAt, here };

  // As the /today page does: a pipeline that throws still answers with the
  // towns from the graph, and says the places are incomplete.
  let fetchResult: WaypointFetchResult;
  try {
    fetchResult = await fetchWaypointsForCandidates(plan.reachable);
  } catch (err) {
    console.error("[api/today] waypoint pipeline threw:", err instanceof Error ? err.constructor.name : "unknown");
    fetchResult = {
      status: "degraded",
      cities: plan.reachable.slice(0, MAX_WAYPOINT_CITIES).map((r) => ({
        id: r.city.id, name: r.city.name, vibeClass: null, detourMinutes: r.oneWayDriveMinutes * 2, lat: r.city.lat, lng: r.city.lng,
      })),
      waypoints: [],
      neighborhoods: {},
      failures: [{ kind: "waypoints", reason: err instanceof Error ? err.message : "unknown" }],
    };
  }
  const groups = buildRankedGroupsWith(fetchResult, waypointProfileForMoods(moods));
  const oneWay = new Map(plan.reachable.map((r) => [r.city.id, r.oneWayDriveMinutes]));
  const cityById = new Map(plan.reachable.map((r) => [r.city.id, r.city]));
  const coords = waypointCoords(groups.flatMap((g) => g.rows.map((r) => r.waypointId)));

  const towns: TodayApiTown[] = groups.flatMap((g) => {
    const city = cityById.get(g.cityId);
    const minutes = oneWay.get(g.cityId);
    if (!city || minutes === undefined) return [];
    const badges = rowBadges(g.rows, false);
    const places = g.rows.flatMap((r): TodayApiPlace[] => {
      const at = coords.get(r.waypointId);
      if (!at) return [];
      return [{ id: r.waypointId, name: r.name, lat: at.lat, lng: at.lng, kind: kindWord(r.type), line: r.description ?? null, badge: badges.get(r.waypointId) ?? null }];
    });
    return [{ id: g.cityId, name: g.cityName, lat: city.lat, lng: city.lng, driveMinutes: Math.round(minutes), country: city.country ?? "", places }];
  });

  return {
    version: 1,
    status: "ok",
    generatedAt,
    origin,
    here,
    hours,
    moods,
    placesComplete: fetchResult.status === "fresh",
    towns,
  };
}
