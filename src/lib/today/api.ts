import "server-only";

import { planToday, type TodayPlan, type TodayReach } from "@/lib/today/plan";
import { DEFAULT_HOURS, HOURS_PRESETS } from "@/lib/today/presets";
import { fetchWaypointsForCandidates, MAX_WAYPOINT_CITIES } from "@/lib/routing/recommend";
import { buildRankedGroupsWith, type WaypointFetchResult } from "@/lib/routing/scoring";
import { waypointProfileForMoods } from "@/lib/personas/moodProfile";
import { MOODS, type MoodId } from "@/lib/roadside/tags";
import { kindWord } from "@/lib/plan/words";
import { rowBadges } from "@/lib/plan/badges";
import { waypointCoords } from "@/lib/atlas/queries";
import type { LatLng } from "@/lib/plan/types";
import type { RadialCandidate } from "@/lib/routing/radial";

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

/**
 * The car's day lengths: the /today page's presets plus 10 and 12 (the car
 * session's request, 2026-11-14: John drives 10 to 12 hours some days). The
 * web page's chips stay HOURS_PRESETS.
 */
export const CAR_HOURS = [...HOURS_PRESETS, 10, 12] as const;
/**
 * `hours=any`: no limit, echoed as `hours: null`. A word, not 0, because a
 * blank value reads as 0 (Number("")) and must stay the default.
 */
export const NO_LIMIT = "any";

/** The car's hours: one of CAR_HOURS, null for NO_LIMIT, anything else (blank and missing included) the /today page's default, 5. */
export function carHoursFrom(raw: string | null): number | null {
  const s = (raw ?? "").trim();
  if (s === NO_LIMIT) return null;
  const n = Number(s);
  return (CAR_HOURS as readonly number[]).includes(n) ? n : DEFAULT_HOURS;
}

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
  /** One way, whole minutes: from `here`'s town on the calibrated drive graph, or between towns from your position, estimated. */
  driveMinutes: number;
  /** True when driveMinutes is a straight-line estimate, say "about": between towns (`here.snapped` false), and towns past the drive graph's 650 km on a long day (v1 addition, 2026-11-14). */
  estimated: boolean;
  /** The atlas's country ("Canada"); compare with `here.country` to label a town across a border (v1 addition, U52). */
  country: string;
  places: TodayApiPlace[];
}

/**
 * Where the answer stands. `snapped` (v1 addition, 2026-11-14): true when you
 * are within 40 km of the town and its drive graph minutes are used; false
 * between towns, when the town is only the nearest one (`distanceKm` says how
 * far, up to 650 km), it can be a row itself, and every minute is an estimate
 * from your position. Shared by /api/today and /api/today/toward.
 */
export type TodayHere = { cityId: string; name: string; lat: number; lng: number; distanceKm: number; country: string; snapped: boolean };
type Here = TodayHere;

export function hereOf(here: NonNullable<TodayPlan["here"]>, reach: TodayReach): TodayHere {
  return {
    cityId: here.city.id,
    name: here.city.name,
    lat: here.city.lat,
    lng: here.city.lng,
    distanceKm: Math.round(here.distanceKm * 10) / 10,
    country: here.city.country,
    snapped: reach !== "between",
  };
}

export type TodayApiResponse =
  | {
      version: 1;
      status: "ok";
      generatedAt: string;
      origin: LatLng;
      here: Here;
      /** As asked, or the default; null for no limit (`hours=any`). */
      hours: number | null;
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
  | { ok: true; origin: LatLng; hours: number | null; moods: MoodId[] }
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
  return { ok: true, origin: { lat, lng }, hours: carHoursFrom(q.get("hours")), moods };
}

/** The answer for a parsed query; `now` is injectable for tests. */
export async function todayAnswer(origin: LatLng, hours: number | null, moods: MoodId[], now: Date = new Date()): Promise<TodayApiResponse> {
  const generatedAt = now.toISOString();
  // Between towns too (the car's request, 2026-11-14): the car is on the
  // road, so "no nearby towns" 60 km out of one is no answer at all. And
  // past the graph's 650 km, for the car's longer days.
  const plan = planToday(origin, hours ?? Infinity, { betweenTowns: true, beyondGraph: true });
  if (plan.reach === "no-city" || !plan.here) return { version: 1, status: "no-city", generatedAt };
  const here = hereOf(plan.here, plan.reach);
  if (plan.reach === "no-graph") return { version: 1, status: "no-graph", generatedAt, here };

  const fetchResult = await waypointsOrDegraded(plan.reachable, "[api/today]");
  const placesByTown = rankedPlaces(fetchResult, moods);
  const byId = new Map(plan.reachable.map((r) => [r.city.id, r]));

  const towns: TodayApiTown[] = [...placesByTown].flatMap(([cityId, { cityName, places }]) => {
    const r = byId.get(cityId);
    if (!r) return [];
    const { city } = r;
    return [{ id: cityId, name: cityName, lat: city.lat, lng: city.lng, driveMinutes: Math.round(r.oneWayDriveMinutes), estimated: r.estimated, country: city.country ?? "", places }];
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

/**
 * The waypoints for these towns, as the /today page reads them. A pipeline
 * that throws still answers: the towns come back with no places and the
 * result says "degraded", so the caller can say the places are incomplete.
 * Shared by /api/today and /api/today/toward.
 */
export async function waypointsOrDegraded(candidates: readonly RadialCandidate[], logTag: string): Promise<WaypointFetchResult> {
  try {
    return await fetchWaypointsForCandidates([...candidates]);
  } catch (err) {
    console.error(`${logTag} waypoint pipeline threw:`, err instanceof Error ? err.constructor.name : "unknown");
    return {
      status: "degraded",
      cities: candidates.slice(0, MAX_WAYPOINT_CITIES).map((r) => ({
        id: r.city.id, name: r.city.name, vibeClass: null, detourMinutes: r.oneWayDriveMinutes * 2, lat: r.city.lat, lng: r.city.lng,
      })),
      waypoints: [],
      neighborhoods: {},
      failures: [{ kind: "waypoints", reason: err instanceof Error ? err.message : "unknown" }],
    };
  }
}

/**
 * Each town's places, ranked by the chosen moods with their badges, in the
 * ranking's town order: the five the /today page shows, as the car reads
 * them. Shared by /api/today and /api/today/toward.
 */
export function rankedPlaces(fetchResult: WaypointFetchResult, moods: readonly MoodId[]): Map<string, { cityName: string; places: TodayApiPlace[] }> {
  const groups = buildRankedGroupsWith(fetchResult, waypointProfileForMoods([...moods]));
  const coords = waypointCoords(groups.flatMap((g) => g.rows.map((r) => r.waypointId)));
  const out = new Map<string, { cityName: string; places: TodayApiPlace[] }>();
  for (const g of groups) {
    const badges = rowBadges(g.rows, false);
    const places = g.rows.flatMap((r): TodayApiPlace[] => {
      const at = coords.get(r.waypointId);
      if (!at) return [];
      return [{ id: r.waypointId, name: r.name, lat: at.lat, lng: at.lng, kind: kindWord(r.type), line: r.description ?? null, badge: badges.get(r.waypointId) ?? null }];
    });
    out.set(g.cityId, { cityName: g.cityName, places });
  }
  return out;
}
