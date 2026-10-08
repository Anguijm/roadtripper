import "server-only";
import { getAllCities } from "@/lib/urban-explorer/cities";
import { snapToCity, driveTimesFrom, hasDriveGraphFor } from "@/lib/atlas/queries";
import type { City } from "@/lib/urban-explorer/types";
import { cacheGet, cacheSet, radialCacheKey } from "./cache";
import { haversineKm, type LatLng } from "./polyline";
import { makesProgress, isOutOfTheWay, MAX_DETOUR_RATIO_WITH_SLACK } from "./progress";

// bearingDeg moved to ./progress (pure, client-safe); re-exported so existing
// imports keep working.
export { bearingDeg } from "./progress";

export interface RadialCandidate {
  city: City;
  // One-way drive time from the current hop origin to this city. Not doubled —
  // in the radial model the city IS the next destination, so there is no return leg.
  oneWayDriveMinutes: number;
  /**
   * Past the on-the-way detour limit (U17) and within the slack one (U21):
   * the sheet offers it only to a dated trip with a day to spare, after
   * every on-the-way town. Absent is on the way.
   */
  outOfTheWay?: boolean;
}

interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  condition?: string;
  duration?: string;
}

async function fetchDriveTimes(
  origin: LatLng,
  cities: City[]
): Promise<Map<string, number>> {
  if (cities.length === 0) return new Map();

  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_KEY not set");

  const response = await fetch(
    "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,condition",
      },
      body: JSON.stringify({
        origins: [
          {
            waypoint: {
              location: {
                latLng: { latitude: origin.lat, longitude: origin.lng },
              },
            },
          },
        ],
        destinations: cities.map((c) => ({
          waypoint: {
            location: {
              latLng: { latitude: c.lat, longitude: c.lng },
            },
          },
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Route matrix API returned ${response.status}`);
  }

  const data = (await response.json()) as RouteMatrixElement[] | { error?: unknown };
  if (!Array.isArray(data)) {
    throw new Error("Route matrix API returned unexpected shape");
  }

  const result = new Map<string, number>();
  for (const el of data) {
    if (
      el.originIndex === 0 &&
      el.condition === "ROUTE_EXISTS" &&
      el.duration &&
      el.destinationIndex < cities.length
    ) {
      const minutes = parseFloat(el.duration.replace("s", "")) / 60;
      if (Number.isFinite(minutes)) {
        result.set(cities[el.destinationIndex].id, minutes);
      }
    }
  }
  return result;
}

// Expand the in-memory filter threshold by this amount on each retry.
// No extra API calls — all retries reuse the same fetchDriveTimes response.
// 15 min chosen because it's a meaningful short-hop increment (one gas-stop
// worth of extra drive time) while keeping worst-case overshoot to 30 min.
const RETRY_INCREMENT_MINUTES = 15;
// Cap at 2 retries: initial + 15 min + 30 min = maxMinutes + 30 worst-case.
const MAX_RETRIES = 2;
// Hard cap on API elements per call. At $0.005/element, 50 cities = $0.25/call
// vs ~$0.65/call for the full semicircle (~130 cities). Nearest cities by
// haversine are selected first so the most reachable candidates are prioritised.
const MAX_RADIAL_FAN_OUT = 50;

/**
 * Find candidate cities reachable from `origin` within `maxMinutes` drive,
 * filtered to a 180° semicircle aimed toward `destination`.
 *
 * ONE Routes API matrix call (1×N cities) per cache miss. Zero-results retry
 * expands the in-memory threshold by 15-min increments (max 2), so the
 * entire retry sequence never triggers additional API calls.
 */
/**
 * Cities reachable from `origin` within `maxMinutes`, filtered to the half of
 * the compass aimed at `destination`.
 *
 * Reads the precomputed drive-time graph when it can, and only calls the Routes
 * API when it cannot. That ordering is the point: a graph hit costs nothing,
 * returns in microseconds, and works with no signal, which on a road trip is
 * when the app is actually open.
 *
 * The graph is keyed by city, so an arbitrary origin is snapped to the nearest
 * atlas city within SNAP_RADIUS_KM. In practice the origin is either a city the
 * user typed or the last stop they added, so it usually snaps to itself. When
 * nothing is close enough, or the graph has no rows for that city, this falls
 * through to the live matrix rather than silently returning nothing.
 */
export async function findCitiesInRadius(
  origin: LatLng,
  destination: LatLng,
  maxMinutes: number
): Promise<RadialCandidate[]> {
  // The key carries the destination itself, not an eight-way heading: two
  // trips from one origin to different destinations keep different cities.
  const cacheKey = radialCacheKey(origin.lat, origin.lng, maxMinutes, destination);

  const cached = cacheGet<RadialCandidate[]>(cacheKey);
  if (cached) return cached;

  const allCities = await getAllCities();
  // Ahead means progress: closer to the destination than we are now, and
  // not past it. See ./progress for why the old 180-degree fan went.
  // The slack limit (U21): towns out of the way are fetched too and
  // tagged, and the sheet decides whether the trip has room for them.
  const ahead = allCities.filter((c) => makesProgress(c, origin, destination, MAX_DETOUR_RATIO_WITH_SLACK));

  const tag = (cs: RadialCandidate[]) => tagOutOfTheWay(cs, origin, destination);

  const fromGraph = candidatesFromGraph(origin, ahead, maxMinutes);
  if (fromGraph.kind === "hit") {
    const tagged = tag(fromGraph.candidates);
    cacheSet(cacheKey, tagged);
    return tagged;
  }

  // Fallback: no usable graph row for this origin. Costs money and needs a
  // network, which is exactly what the graph exists to avoid, so it is worth
  // knowing when it happens.
  console.warn(
    `[radial] no drive-graph coverage near ${origin.lat.toFixed(3)},${origin.lng.toFixed(3)} — falling back to the Routes API`
  );

  // Sort by haversine then cap — keeps API cost bounded while prioritising
  // the most geographically proximate (and therefore most likely reachable) cities.
  // On-the-way towns first, so an out-of-the-way one never displaces one
  // from the capped set (U21).
  const capped = [...ahead]
    .sort((a, b) => Number(isOutOfTheWay(a, origin, destination)) - Number(isOutOfTheWay(b, origin, destination)) || haversineKm(origin, a) - haversineKm(origin, b))
    .slice(0, MAX_RADIAL_FAN_OUT);

  const driveTimes = await fetchDriveTimes(origin, capped);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const threshold = maxMinutes + attempt * RETRY_INCREMENT_MINUTES;
    const candidates: RadialCandidate[] = [];
    for (const city of capped) {
      const oneWayDriveMinutes = driveTimes.get(city.id);
      if (oneWayDriveMinutes !== undefined && oneWayDriveMinutes <= threshold) {
        candidates.push({ city, oneWayDriveMinutes });
      }
    }
    // Exit when candidates found or this was the final retry — empty result is valid.
    if (candidates.length > 0 || attempt === MAX_RETRIES) {
      candidates.sort((a, b) => a.oneWayDriveMinutes - b.oneWayDriveMinutes);
      const tagged = tag(candidates);
      cacheSet(cacheKey, tagged);
      return tagged;
    }
  }

  return [];
}

/** Marks the candidates past the on-the-way detour limit (U21); the rest are untouched. Pure. */
export function tagOutOfTheWay(candidates: readonly RadialCandidate[], origin: LatLng, destination: LatLng): RadialCandidate[] {
  return candidates.map((c) => (isOutOfTheWay(c.city, origin, destination) ? { ...c, outOfTheWay: true } : c));
}

/**
 * Graph-only candidate resolution.
 *
 * `null` means "the graph cannot answer this", which is different from an empty
 * array meaning "nothing is in range". Collapsing those two would turn missing
 * data into a confident wrong answer.
 *
 * Note there is no fan-out cap here. The cap exists because each API
 * destination costs half a cent; reading rows already on disk costs nothing, so
 * every city in range is considered. That alone fixes the symptom where a New
 * York to Los Angeles plan only ever offered Northeast cities.
 */
/**
 * `miss` means the graph cannot answer for this origin (nothing to snap to, or
 * no rows for that city) and the caller must fall back. `hit` with an empty
 * `candidates` means the graph answered and nothing is in range. Those were
 * previously `null` versus `[]`, which read the same at a glance and would have
 * let a future edit turn missing data into a confident "nothing nearby".
 */
type GraphLookup =
  | { kind: "miss" }
  | { kind: "hit"; candidates: RadialCandidate[] };

function candidatesFromGraph(
  origin: LatLng,
  ahead: City[],
  maxMinutes: number
): GraphLookup {
  // Any failure inside the graph lookup is a miss, never a hit with nothing in
  // it. A locked file or a schema drift must reach the live API, not the user
  // as an empty map. Logged, because a miss that is really an error is worth
  // knowing about even though the app keeps working.
  try {
    const snapped = snapToCity(origin);
    if (!snapped || !hasDriveGraphFor(snapped.city.id)) return { kind: "miss" };

    const allowed = new Map(ahead.map((c) => [c.id, c]));
    const candidates: RadialCandidate[] = [];
    for (const row of driveTimesFrom(snapped.city.id, maxMinutes)) {
      const city = allowed.get(row.cityId);
      if (city) candidates.push({ city, oneWayDriveMinutes: row.minutes });
    }
    candidates.sort((a, b) => a.oneWayDriveMinutes - b.oneWayDriveMinutes);
    return { kind: "hit", candidates };
  } catch (err) {
    console.error("[radial] drive-graph lookup failed, treating as a miss:", err);
    return { kind: "miss" };
  }
}
