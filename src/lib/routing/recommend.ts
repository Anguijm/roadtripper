import "server-only";
import {
  MAX_NEIGHBORHOODS_PER_CITY,
  localizedText,
} from "@/lib/urban-explorer/cityAtlas";
import { waypointsForCities, neighborhoodsForCity } from "@/lib/atlas/queries";
import type { NeighborhoodLite } from "@/lib/urban-explorer/types";
import type { VibeClass } from "@/lib/urban-explorer/types";
import type { RadialCandidate } from "./radial";
import type {
  CityContext,
  LiteWaypoint,
  WaypointFetchResult,
  NeighborhoodLoadState,
  WaypointFetchFailure,
} from "./scoring";

/**
 * Session 5 — Server-side waypoint fetcher.
 * Session 8b — Adds neighborhood fetch + Promise.all orchestration.
 *
 * Pure server module. Imports firebaseAdmin. Client components MUST NOT
 * import from this file — they should import from ./scoring instead.
 */

// ---------- Constants ----------

const MAX_WAYPOINT_CITIES = 10;
const MAX_WAYPOINTS_FETCHED = MAX_WAYPOINT_CITIES * 30;

/** SEC-3: only ever fetch neighborhoods for one city per request. */
const MAX_NEIGHBORHOOD_CITIES = 1;

/** SEC boundary: cityId passed to fetchNeighborhoods must match this. */
const CITY_ID_REGEX = /^[a-z0-9-]+$/;

// ---------- Neighborhood helpers ----------

function normalizeNeighborhoodName(name: string, cityId: string): string {
  let n = name.toLowerCase();
  // Strip city-id prefix ("las-vegas-strip" → "strip")
  if (n.startsWith(cityId + "-")) n = n.slice(cityId.length + 1);
  // Strip city-name prefix ("las vegas strip" → "strip")
  const cityName = cityId.replace(/-/g, " ");
  if (n.startsWith(cityName + " ")) n = n.slice(cityName.length + 1);
  // Collapse leading "the"
  if (n.startsWith("the ") || n.startsWith("the-")) n = n.slice(4);
  return n.trim();
}

function dedupeNeighborhoods(
  neighborhoods: NeighborhoodLite[],
  cityId: string
): NeighborhoodLite[] {
  const byNorm = new Map<string, NeighborhoodLite>();
  for (const n of neighborhoods) {
    const key = normalizeNeighborhoodName(localizedText(n.name), cityId);
    const existing = byNorm.get(key);
    if (existing) {
      const keepNew =
        n.trending_score > existing.trending_score ||
        (n.trending_score === existing.trending_score &&
          n.id.length < existing.id.length);
      console.warn(
        `[recommend] neighborhood dedupe cityId=${cityId} key="${key}": ${existing.id} vs ${n.id}, keeping ${keepNew ? n.id : existing.id}`
      );
      if (keepNew) byNorm.set(key, n);
    } else {
      byNorm.set(key, n);
    }
  }
  return [...byNorm.values()];
}

/**
 * Fetch and cache NeighborhoodLite[] for a single city. SEC-3 caps callers
 * to MAX_NEIGHBORHOOD_CITIES = 1. Validates cityId at this boundary.
 *
 * @server-only — this function opens the local atlas via better-sqlite3.
 * It MUST NOT be imported from any client component or barrel file that is
 * bundled for the browser. Only call it from Server Actions or Server Components.
 */
export async function fetchNeighborhoods(cityId: string): Promise<{
  loadState: NeighborhoodLoadState;
  failure?: WaypointFetchFailure;
}> {
  if (!CITY_ID_REGEX.test(cityId)) {
    return {
      loadState: { kind: "failed" },
      failure: { kind: "neighborhoods", cityId, reason: "invalid cityId format" },
    };
  }

  try {
    const deduped = dedupeNeighborhoods(
      neighborhoodsForCity(cityId, MAX_NEIGHBORHOODS_PER_CITY),
      cityId
    );
    return {
      loadState:
        deduped.length === 0 ? { kind: "empty" } : { kind: "loaded", data: deduped },
    };
  } catch (err) {
    console.error(`[recommend] atlas neighborhood read failed cityId=${cityId}:`, err);
    return {
      loadState: { kind: "failed" },
      failure: {
        kind: "neighborhoods",
        cityId,
        reason: err instanceof Error ? err.message : "unknown",
      },
    };
  }
}

// ---------- Waypoints core ----------

interface WaypointsCorePayload {
  cities: CityContext[];
  waypoints: LiteWaypoint[];
}

function fetchWaypointsCore(
  _activeCandidates: RadialCandidate[],
  cityById: Map<string, RadialCandidate>,
  uniqueCityIds: string[]
): { payload: WaypointsCorePayload; failure?: WaypointFetchFailure } {
  const cities: CityContext[] = uniqueCityIds.map((id) => {
    const cand = cityById.get(id)!;
    return {
      id: cand.city.id,
      name: cand.city.name,
      vibeClass: (cand.city.vibeClass ?? null) as VibeClass | null,
      // Doubled: detourMinutes retains round-trip semantics for scoring/display compat.
      detourMinutes: cand.oneWayDriveMinutes * 2,
      lat: cand.city.lat,
      lng: cand.city.lng,
    };
  });

  try {
    // The Firestore version was capped at 10 cities by the `in` operator and at
    // MAX_WAYPOINTS_FETCHED rows overall. SQLite has neither limit, so the only
    // bound left is MAX_WAYPOINT_CITIES applied by the caller.
    //
    // No cache here on purpose. This read is a local indexed lookup measured at
    // well under a millisecond, so an in-process cache would spend memory and
    // add a staleness class of bug to save nothing.
    const waypoints: LiteWaypoint[] = waypointsForCities(uniqueCityIds).map((w) => ({
      id: w.id,
      cityId: w.cityId,
      name: w.name,
      type: w.type,
      trendingScore: w.trendingScore,
      neighborhoodId: w.neighborhoodId,
    }));
    return { payload: { cities, waypoints } };
  } catch (err) {
    console.error("[recommend] atlas waypoint read failed:", err);
    return {
      payload: { cities, waypoints: [] },
      failure: {
        kind: "waypoints",
        reason: err instanceof Error ? err.message : "unknown",
      },
    };
  }
}

// ---------- Orchestrator ----------

/**
 * Fetch waypoints for a set of candidate cities and, optionally, neighborhoods
 * for a single selected stop city. The two fetches run in parallel via
 * Promise.all (PROD-4 latency requirement). Returns a discriminated union —
 * `status: "degraded"` when any sub-fetch failed; `failures` identifies which.
 *
 * SEC-3: `selectedCityId` is bounded to MAX_NEIGHBORHOOD_CITIES = 1.
 * Extras (if ever passed) are logged and dropped.
 */
export async function fetchWaypointsForCandidates(
  candidates: RadialCandidate[],
  selectedCityId?: string
): Promise<WaypointFetchResult> {
  const activeCandidates = candidates.slice(0, MAX_WAYPOINT_CITIES);

  if (activeCandidates.length === 0) {
    return { status: "fresh", cities: [], waypoints: [], neighborhoods: {} };
  }

  const cityById = new Map<string, RadialCandidate>();
  for (const c of activeCandidates) cityById.set(c.city.id, c);
  const uniqueCityIds = [...cityById.keys()];

  // Validate SEC-3: cap to MAX_NEIGHBORHOOD_CITIES
  let resolvedCityId: string | undefined = selectedCityId;
  if (selectedCityId !== undefined && MAX_NEIGHBORHOOD_CITIES < 1) {
    console.warn(
      `[recommend] SEC-3: selectedCityId provided but MAX_NEIGHBORHOOD_CITIES=${MAX_NEIGHBORHOOD_CITIES}; dropping`
    );
    resolvedCityId = undefined;
  }

  // fetchWaypointsCore is synchronous now that it reads the local atlas, so
  // there is nothing left to parallelise against the neighborhood read.
  const waypointsResult = fetchWaypointsCore(activeCandidates, cityById, uniqueCityIds);
  const neighborhoodsResult =
    resolvedCityId !== undefined ? await fetchNeighborhoods(resolvedCityId) : null;

  const { payload } = waypointsResult;
  const failures: WaypointFetchFailure[] = [];

  if (waypointsResult.failure) failures.push(waypointsResult.failure);

  const neighborhoods: Record<string, NeighborhoodLoadState> = {};
  if (neighborhoodsResult !== null) {
    if (resolvedCityId) {
      neighborhoods[resolvedCityId] = neighborhoodsResult.loadState;
      if (neighborhoodsResult.failure) failures.push(neighborhoodsResult.failure);
    }
  }

  if (failures.length > 0) {
    return {
      status: "degraded",
      cities: payload.cities,
      waypoints: payload.waypoints,
      neighborhoods,
      failures,
    };
  }

  return {
    status: "fresh",
    cities: payload.cities,
    waypoints: payload.waypoints,
    neighborhoods,
  };
}
