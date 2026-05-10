import type { Waypoint, VibeClass, NeighborhoodLite } from "@/lib/urban-explorer/types";
import type { PersonaConfig, RankedWaypoint } from "@/lib/personas/types";
import { getPersona } from "@/lib/personas";

/**
 * Isomorphic scoring helpers.
 *
 * CRITICAL: this file has ZERO server-only imports. It runs both in
 * Server Components (initial render) AND in Client Components (on persona
 * change). Do NOT add `import "server-only"` here or import from
 * `firebaseAdmin`.
 */

/** Detour clamp — sub-5min detours are noise. See recommend.ts. */
const MIN_DETOUR_CLAMP_MINUTES = 5;

/** Number of top-scored waypoints returned per city to the UI. */
export const TOP_WAYPOINTS_PER_CITY = 5;

export type ScoringTier = "primary" | "secondary" | "other";

/** Lean city metadata shipped to the client so scoring can run there.
 *  Carries lat/lng so the client can build CandidateMarker / TripStop without
 *  re-querying the Urban Explorer city table (Council ISC-S7-ARCH-1). */
export interface CityContext {
  id: string;
  name: string;
  vibeClass: VibeClass | null;
  detourMinutes: number;
  lat: number;
  lng: number;
}

/** Lean waypoint row shipped to the client. Keeps payload small. */
export interface LiteWaypoint {
  id: string;
  cityId: string;
  name: string;
  type: Waypoint["type"];
  trendingScore: number;
  neighborhoodId: string | null;
}

/** Per-city neighborhood fetch state. Key absence in the Record ≡ not requested. */
export type NeighborhoodLoadState =
  | { kind: "empty" }
  | { kind: "loaded"; data: NeighborhoodLite[] }
  | { kind: "failed" };

export type WaypointFetchFailure = {
  kind: "waypoints" | "neighborhoods";
  cityId?: string;
  reason: string;
};

export type WaypointFetchResult =
  | {
      status: "fresh";
      cities: CityContext[];
      waypoints: LiteWaypoint[];
      neighborhoods: Record<string, NeighborhoodLoadState>;
    }
  | {
      status: "degraded";
      cities: CityContext[];
      waypoints: LiteWaypoint[];
      neighborhoods: Record<string, NeighborhoodLoadState>;
      failures: WaypointFetchFailure[];
    };

export function tierForType(
  type: Waypoint["type"],
  persona: PersonaConfig
): ScoringTier {
  if (persona.primaryTypes.includes(type)) return "primary";
  if (persona.secondaryTypes.includes(type)) return "secondary";
  return "other";
}

/**
 * Scoring multiplier for a waypoint's tier relative to a persona.
 *
 * The ratio between tiers controls how strongly persona preference affects
 * ranking versus raw trendingScore. The `other` tier intentionally returns a
 * non-zero floor (0.2) so that non-matching items still appear in ranked lists
 * (e.g. NeighborhoodPanel). A floor of 0 would cause those items to score 0
 * and silently disappear.
 */
export function typeWeight(tier: ScoringTier): number {
  switch (tier) {
    case "primary":
      return 1.0;
    case "secondary":
      return 0.5;
    default:
      return 0.2;
  }
}

function vibeBonus(
  cityVibeClass: VibeClass | null,
  persona: PersonaConfig
): number {
  if (cityVibeClass === null) return 1.0;
  return persona.preferredVibes.includes(cityVibeClass) ? 1.2 : 1.0;
}

/**
 * trending * typeWeight * vibeBonus / max(detour, 5).
 * Clamped at 5 minutes to avoid score inflation for cities the route
 * already passes through (where Routes API returns sub-minute detours).
 */
export function scoreWaypoint(
  waypoint: LiteWaypoint,
  cityVibeClass: VibeClass | null,
  persona: PersonaConfig,
  detourMinutes: number
): { score: number; tier: ScoringTier } {
  const tier = tierForType(waypoint.type, persona);
  const weight = typeWeight(tier);
  const vibe = vibeBonus(cityVibeClass, persona);
  const clampedDetour = Math.max(detourMinutes, MIN_DETOUR_CLAMP_MINUTES);
  const score = (waypoint.trendingScore * weight * vibe) / clampedDetour;
  return { score, tier };
}

/**
 * Score a neighborhood for persona-aware sorting in the drill-down panel.
 *
 * trending_score × max(typeWeight of contained waypoints). The max avoids
 * bias toward dense neighborhoods — one perfect-match waypoint is as good
 * as many. Falls back to typeWeight("other") = 0.2 so neighborhoods with no
 * waypoints (not yet fetched or genuinely empty) stay visible but rank last.
 */
export function scoreNeighborhood(
  trendingScore: number,
  waypoints: LiteWaypoint[],
  persona: PersonaConfig
): number {
  const floor = typeWeight("other");
  const bestWeight = waypoints.reduce((best, w) => {
    return Math.max(best, typeWeight(tierForType(w.type, persona)));
  }, floor);
  return trendingScore * bestWeight;
}

export interface RankedCityGroup {
  cityId: string;
  cityName: string;
  detourMinutes: number;
  rows: RankedWaypoint[];
}

/**
 * Build ranked waypoints grouped by city for a given persona. Cities are
 * sorted by detour ascending (nearest first). Within each city, the top
 * TOP_WAYPOINTS_PER_CITY waypoints by score are kept. Pure and
 * isomorphic — safe to call in Server or Client Components.
 */
export function buildRankedGroups(
  fetchResult: WaypointFetchResult,
  personaId: unknown
): RankedCityGroup[] {
  const persona = getPersona(personaId);

  // Pre-group waypoints by cityId in a single pass. O(W) instead of
  // O(C*W) — addresses simplify efficiency finding #2.
  const waypointsByCity = new Map<string, LiteWaypoint[]>();
  for (const w of fetchResult.waypoints) {
    const list = waypointsByCity.get(w.cityId);
    if (list) list.push(w);
    else waypointsByCity.set(w.cityId, [w]);
  }

  const citiesByDetour = [...fetchResult.cities].sort(
    (a, b) => a.detourMinutes - b.detourMinutes
  );

  const groups: RankedCityGroup[] = [];

  for (const city of citiesByDetour) {
    const cityWaypoints = waypointsByCity.get(city.id) ?? [];

    const rows = cityWaypoints
      .map((w): RankedWaypoint => {
        const { score, tier } = scoreWaypoint(
          w,
          city.vibeClass,
          persona,
          city.detourMinutes
        );
        return {
          waypointId: w.id,
          cityId: city.id,
          cityName: city.name,
          cityVibeClass: city.vibeClass,
          name: w.name,
          type: w.type,
          trendingScore: w.trendingScore,
          detourMinutes: city.detourMinutes,
          score,
          tier,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_WAYPOINTS_PER_CITY);

    groups.push({
      cityId: city.id,
      cityName: city.name,
      detourMinutes: city.detourMinutes,
      rows,
    });
  }

  return groups;
}
