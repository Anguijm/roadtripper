import "server-only";
import { urbanExplorerDb } from "@/lib/firebaseAdmin";
import { WaypointSchema } from "@/lib/urban-explorer/types";
import type { VibeClass } from "@/lib/urban-explorer/types";
import type { ValidatedCandidate } from "./candidates";
import { cacheGet, cacheSet, waypointsCacheKey } from "./cache";
import type {
  CityContext,
  LiteWaypoint,
  WaypointFetchResult,
} from "./scoring";

/**
 * Session 5 — Server-side waypoint fetcher.
 *
 * Pure server module. Imports firebaseAdmin. Client components MUST NOT
 * import from this file — they should import from ./scoring instead.
 *
 * Architecture (from council synthesis):
 *   1. Server fetches a PERSONA-INDEPENDENT bag of waypoints for the top
 *      candidate cities, cached by sorted city-id tuple.
 *   2. Results are shipped raw to the client via /plan page.
 *   3. Client re-scores on every persona change (zero re-fetch).
 */

// ---------- Constants ----------

/** Max cities we fetch waypoints for. Lower than MAX_CANDIDATES_FOR_DRIVE_TIME
 * (25) to keep the client payload under ~150KB. Council Arch F1.
 * Must stay <= Firestore's 30-value IN-query limit so the query remains a
 * single round trip. */
const MAX_WAYPOINT_CITIES = 10;

/** Overall limit applied to the single IN query — 30 waypoints per city
 * worth of slack, bounded by MAX_WAYPOINT_CITIES. */
const MAX_WAYPOINTS_FETCHED = MAX_WAYPOINT_CITIES * 30;

/**
 * Fetch waypoints for a set of candidate cities using the urbanexplorer
 * Admin SDK. Because we cap to MAX_WAYPOINT_CITIES (<= Firestore IN
 * limit), this is always a single query — no chunking required. On
 * failure we log and return an empty, degraded result so /plan still
 * renders.
 */
export async function fetchWaypointsForCandidates(
  candidates: ValidatedCandidate[]
): Promise<WaypointFetchResult> {
  // Candidates come from getAllCities() which already strips archived
  // rows; no secondary filter needed. They're also sorted by detour asc,
  // so slicing gives us the nearest cities.
  const activeCandidates = candidates.slice(0, MAX_WAYPOINT_CITIES);

  if (activeCandidates.length === 0) {
    return { cities: [], waypoints: [], degraded: false };
  }

  // Dedupe via Map keyed by city id
  const cityById = new Map<string, ValidatedCandidate>();
  for (const c of activeCandidates) cityById.set(c.city.id, c);

  const uniqueCityIds = [...cityById.keys()];

  // Cache hit? Cities still need their detour patched because detour
  // depends on the budget, which is NOT part of the cache key.
  const cacheKey = waypointsCacheKey(uniqueCityIds);
  const cached = cacheGet<WaypointFetchResult>(cacheKey);
  if (cached) {
    const patchedCities = cached.cities.map((city) => {
      const cand = cityById.get(city.id);
      return cand
        ? { ...city, detourMinutes: cand.roundTripDetourMinutes }
        : city;
    });
    return { ...cached, cities: patchedCities };
  }

  // City context list (ships to client for scoring + map markers)
  const cities: CityContext[] = uniqueCityIds.map((id) => {
    const cand = cityById.get(id)!;
    return {
      id: cand.city.id,
      name: cand.city.name,
      vibeClass: (cand.city.vibeClass ?? null) as VibeClass | null,
      detourMinutes: cand.roundTripDetourMinutes,
      lat: cand.city.lat,
      lng: cand.city.lng,
    };
  });

  // Minimal Zod shape — cheaper than full WaypointSchema since we only
  // fetch a projection.
  const LiteWaypointShape = WaypointSchema.pick({
    name: true,
    type: true,
    city_id: true,
    trending_score: true,
  });

  const waypoints: LiteWaypoint[] = [];
  let degraded = false;
  let droppedByParse = 0;

  try {
    // Nested field projection — `name.en` drops the other 7 locales so
    // payload stays tight. Firestore Admin SDK supports dot-notation in
    // select() as of firebase-admin@11.
    const snapshot = await urbanExplorerDb
      .collection("vibe_waypoints")
      .where("city_id", "in", uniqueCityIds)
      .select("name.en", "type", "city_id", "trending_score")
      .limit(MAX_WAYPOINTS_FETCHED)
      .get();

    for (const doc of snapshot.docs) {
      const parsed = LiteWaypointShape.safeParse(doc.data());
      if (!parsed.success) {
        droppedByParse++;
        continue;
      }
      waypoints.push({
        id: doc.id,
        cityId: parsed.data.city_id,
        name: parsed.data.name.en,
        type: parsed.data.type,
        trendingScore: parsed.data.trending_score,
      });
    }
  } catch (err) {
    console.error("[recommend] vibe_waypoints query failed:", err);
    degraded = true;
  }

  if (droppedByParse > 0) {
    console.warn(
      `[recommend] dropped ${droppedByParse} waypoints that failed WaypointSchema validation`
    );
  }

  const result: WaypointFetchResult = { cities, waypoints, degraded };
  cacheSet(cacheKey, result);
  return result;
}
