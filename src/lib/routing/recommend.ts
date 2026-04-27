import "server-only";
import { z } from "zod/v4";
import { urbanExplorerDb } from "@/lib/firebaseAdmin";
import {
  WaypointSchema,
  NeighborhoodLiteSchema,
  MAX_NEIGHBORHOODS_PER_CITY,
  localizedText,
} from "@/lib/urban-explorer/cityAtlas";
import type { NeighborhoodLite } from "@/lib/urban-explorer/types";
import type { VibeClass } from "@/lib/urban-explorer/types";
import type { ValidatedCandidate } from "./candidates";
import { cacheGet, cacheSet, waypointsCacheKey, neighborhoodsCacheKey } from "./cache";
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

// ---------- Schema ----------

const LiteWaypointShape = WaypointSchema.pick({
  name: true,
  type: true,
  city_id: true,
  trending_score: true,
}).extend({
  // Optional — projection now requests it but legacy docs may not carry it.
  neighborhood_id: z.string().optional(),
});

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
 */
async function fetchNeighborhoods(cityId: string): Promise<{
  loadState: NeighborhoodLoadState;
  failure?: WaypointFetchFailure;
}> {
  if (!CITY_ID_REGEX.test(cityId)) {
    return {
      loadState: { kind: "failed" },
      failure: { kind: "neighborhoods", cityId, reason: "invalid cityId format" },
    };
  }

  const cacheKey = neighborhoodsCacheKey(cityId);
  const cached = cacheGet<NeighborhoodLite[]>(cacheKey);
  if (cached) {
    return {
      loadState:
        cached.length === 0
          ? { kind: "empty" }
          : { kind: "loaded", data: cached },
    };
  }

  try {
    const snapshot = await urbanExplorerDb
      .collection("vibe_neighborhoods")
      .where("city_id", "==", cityId)
      .select("name.en", "summary.en", "trending_score")
      .limit(MAX_NEIGHBORHOODS_PER_CITY)
      .get();

    const raw: NeighborhoodLite[] = [];
    for (const doc of snapshot.docs) {
      const parsed = NeighborhoodLiteSchema.safeParse({ id: doc.id, ...doc.data() });
      if (!parsed.success) {
        console.warn(
          `[recommend] neighborhood parse fail cityId=${cityId} neighborhoodId=${doc.id}`,
          parsed.error
        );
        continue;
      }
      raw.push(parsed.data);
    }

    const deduped = dedupeNeighborhoods(raw, cityId);
    cacheSet(cacheKey, deduped);

    return {
      loadState:
        deduped.length === 0
          ? { kind: "empty" }
          : { kind: "loaded", data: deduped },
    };
  } catch (err) {
    console.error(
      `[recommend] vibe_neighborhoods query failed cityId=${cityId}:`,
      err
    );
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

async function fetchWaypointsCore(
  activeCandidates: ValidatedCandidate[],
  cityById: Map<string, ValidatedCandidate>,
  uniqueCityIds: string[]
): Promise<{ payload: WaypointsCorePayload; failure?: WaypointFetchFailure }> {
  const cacheKey = waypointsCacheKey(uniqueCityIds);
  const cached = cacheGet<WaypointsCorePayload>(cacheKey);

  if (cached) {
    const patchedCities = cached.cities.map((city) => {
      const cand = cityById.get(city.id);
      return cand ? { ...city, detourMinutes: cand.roundTripDetourMinutes } : city;
    });
    return { payload: { cities: patchedCities, waypoints: cached.waypoints } };
  }

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

  const waypoints: LiteWaypoint[] = [];
  let droppedByParse = 0;

  try {
    // Nested field projection — dot-notation supported in firebase-admin@11+.
    // `neighborhood_id` added for S8 panel grouping (Step 5).
    const snapshot = await urbanExplorerDb
      .collection("vibe_waypoints")
      .where("city_id", "in", uniqueCityIds)
      .select("name.en", "type", "city_id", "trending_score", "neighborhood_id")
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
        neighborhoodId: parsed.data.neighborhood_id ?? null,
      });
    }

    if (droppedByParse > 0) {
      console.warn(
        `[recommend] dropped ${droppedByParse} waypoints that failed WaypointSchema validation`
      );
    }

    const payload: WaypointsCorePayload = { cities, waypoints };
    cacheSet(cacheKey, payload);
    return { payload };
  } catch (err) {
    console.error("[recommend] vibe_waypoints query failed:", err);
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
  candidates: ValidatedCandidate[],
  selectedCityId?: string
): Promise<WaypointFetchResult> {
  const activeCandidates = candidates.slice(0, MAX_WAYPOINT_CITIES);

  if (activeCandidates.length === 0) {
    return { status: "fresh", cities: [], waypoints: [], neighborhoods: {} };
  }

  const cityById = new Map<string, ValidatedCandidate>();
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

  const [waypointsResult, neighborhoodsResult] = await Promise.all([
    fetchWaypointsCore(activeCandidates, cityById, uniqueCityIds),
    resolvedCityId !== undefined
      ? fetchNeighborhoods(resolvedCityId)
      : Promise.resolve(null),
  ]);

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
