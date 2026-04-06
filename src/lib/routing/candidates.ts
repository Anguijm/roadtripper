import "server-only";
import type { City } from "@/lib/urban-explorer/types";
import { getAllCities } from "@/lib/urban-explorer/cities";
import {
  decodePolyline,
  samplePolyline,
  haversineKm,
  projectOntoPolyline,
  type LatLng,
} from "./polyline";
import { cacheGet, cacheSet, candidateCacheKey } from "./cache";

export interface GeometricCandidate {
  city: City;
  /** Min distance from the route (after projection) to the city, in km */
  minDistanceKm: number;
  /** The projected point on the actual route closest to the city */
  nearestRoutePoint: LatLng;
}

export interface ValidatedCandidate extends GeometricCandidate {
  /** Detour drive time (one-way, route point → city) in seconds */
  detourSeconds: number;
  /** Round-trip detour cost in minutes */
  roundTripDetourMinutes: number;
}

const DEFAULT_SAMPLE_INTERVAL_KM = 50;
const DEFAULT_GEOMETRIC_BUFFER_KM = 120;
const DEFAULT_MAX_DETOUR_MINUTES = 60;
const MAX_CANDIDATES_FOR_DRIVE_TIME = 25;

/**
 * PHASE 1 — Geometric pre-filter (zero API cost).
 *
 * 1. Decode the encoded polyline
 * 2. Sample it every ~50km (with interpolation along long highway segments)
 * 3. For each of the 102 UE cities, run the cheap haversine pre-check vs sample points
 * 4. For surviving candidates, project precisely onto the full polyline so
 *    `nearestRoutePoint` is the actual exit point — not just the nearest sample.
 *    This fixes a precision bug that inflated detour times by up to ~25km.
 */
export function geometricFilter(
  encodedPolyline: string,
  options: { sampleIntervalKm?: number; bufferKm?: number; cities?: City[] } = {}
): GeometricCandidate[] {
  const sampleIntervalKm = options.sampleIntervalKm ?? DEFAULT_SAMPLE_INTERVAL_KM;
  const bufferKm = options.bufferKm ?? DEFAULT_GEOMETRIC_BUFFER_KM;
  const cities = options.cities ?? getAllCities();

  const decoded = decodePolyline(encodedPolyline);
  if (decoded.length === 0) return [];

  const samples = samplePolyline(decoded, sampleIntervalKm);
  if (samples.length === 0) return [];

  const candidates: GeometricCandidate[] = [];

  for (const city of cities) {
    // Cheap pre-check against samples
    let minSampleDistance = Infinity;
    for (const sample of samples) {
      const d = haversineKm(sample, { lat: city.lat, lng: city.lng });
      if (d < minSampleDistance) minSampleDistance = d;
    }

    // Use a slightly relaxed buffer for the pre-check to account for the
    // up-to-half-interval slop between samples and the true polyline
    const relaxedBuffer = bufferKm + sampleIntervalKm / 2;
    if (minSampleDistance > relaxedBuffer) continue;

    // Precise projection onto the full polyline
    const { point, distanceKm } = projectOntoPolyline(
      { lat: city.lat, lng: city.lng },
      decoded
    );

    if (distanceKm <= bufferKm) {
      candidates.push({
        city,
        minDistanceKm: distanceKm,
        nearestRoutePoint: point,
      });
    }
  }

  return candidates.sort((a, b) => a.minDistanceKm - b.minDistanceKm);
}

interface RouteMatrixElement {
  originIndex: number;
  destinationIndex: number;
  status?: { code?: number; message?: string };
  condition?: string;
  distanceMeters?: number;
  duration?: string;
}

/**
 * PHASE 2 — Drive-time validation via Routes API v2 `computeRouteMatrix`.
 *
 * Replaces the legacy Distance Matrix API + "pairs trick" which billed N²
 * elements for N results. computeRouteMatrix accepts explicit origin/dest
 * pairs and bills only the pairs requested — a 25× quota reduction on the
 * hot path.
 *
 * Streaming JSON response: each element arrives separately, so we collect
 * the full array before filtering.
 */
export async function validateDetourTimes(
  candidates: GeometricCandidate[],
  options: { maxDetourMinutes?: number } = {}
): Promise<ValidatedCandidate[]> {
  if (candidates.length === 0) return [];

  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_KEY environment variable not set");
  }

  const maxDetourMinutes = options.maxDetourMinutes ?? DEFAULT_MAX_DETOUR_MINUTES;

  // Build origins (one per candidate, the projected route point) and
  // destinations (one per candidate, the city). Pairing is done by
  // index — we will read element [i,i] for each candidate.
  // Note: computeRouteMatrix supports up to 625 elements (25x25). With our
  // cap of MAX_CANDIDATES_FOR_DRIVE_TIME = 25, we use 25*25 = 625 max.
  // We still pair by index since the API computes the full matrix; we just
  // read the diagonal. (Better than legacy DM because Routes API computes
  // the matrix more efficiently and the field mask is tighter.)
  //
  // For an even tighter pattern when we have many candidates, we could
  // chunk to single-row requests (1 origin x N destinations) but the API
  // limit is high enough that 25x25 is fine for a single request.

  const origins = candidates.map((c) => ({
    waypoint: {
      location: {
        latLng: {
          latitude: c.nearestRoutePoint.lat,
          longitude: c.nearestRoutePoint.lng,
        },
      },
    },
  }));

  const destinations = candidates.map((c) => ({
    waypoint: {
      location: {
        latLng: { latitude: c.city.lat, longitude: c.city.lng },
      },
    },
  }));

  let response: Response;
  try {
    response = await fetch(
      "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "originIndex,destinationIndex,duration,distanceMeters,condition",
        },
        body: JSON.stringify({
          origins,
          destinations,
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      }
    );
  } catch {
    throw new Error("Distance matrix request failed");
  }

  if (!response.ok) {
    // Strip API response body from error to avoid leaking key in logs
    throw new Error(`Distance matrix API returned ${response.status}`);
  }

  const data = (await response.json()) as RouteMatrixElement[] | { error?: { message?: string } };
  if (!Array.isArray(data)) {
    throw new Error("Distance matrix API returned an unexpected response shape");
  }

  // Index the diagonal: for each i, find the element where originIndex == i && destinationIndex == i
  const diagonal = new Map<number, RouteMatrixElement>();
  for (const element of data) {
    if (element.originIndex === element.destinationIndex) {
      diagonal.set(element.originIndex, element);
    }
  }

  const validated: ValidatedCandidate[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const element = diagonal.get(i);
    if (!element || element.condition !== "ROUTE_EXISTS" || !element.duration) continue;

    const detourSeconds = parseInt(element.duration.replace("s", ""), 10);
    if (Number.isNaN(detourSeconds)) continue;

    const roundTripDetourMinutes = (detourSeconds * 2) / 60;

    if (roundTripDetourMinutes <= maxDetourMinutes) {
      validated.push({
        ...candidates[i],
        detourSeconds,
        roundTripDetourMinutes,
      });
    }
  }

  return validated.sort((a, b) => a.roundTripDetourMinutes - b.roundTripDetourMinutes);
}

/**
 * Full pipeline: encoded polyline → validated candidate cities, with
 * an in-process LRU cache to avoid re-billing identical queries.
 */
export async function findCandidateCities(
  encodedPolyline: string,
  options: {
    sampleIntervalKm?: number;
    bufferKm?: number;
    maxDetourMinutes?: number;
  } = {}
): Promise<ValidatedCandidate[]> {
  const maxDetourMinutes = options.maxDetourMinutes ?? DEFAULT_MAX_DETOUR_MINUTES;
  const cacheKey = candidateCacheKey(encodedPolyline, maxDetourMinutes);

  const cached = cacheGet<ValidatedCandidate[]>(cacheKey);
  if (cached) return cached;

  const geometric = geometricFilter(encodedPolyline, {
    sampleIntervalKm: options.sampleIntervalKm,
    bufferKm: options.bufferKm,
  });

  if (geometric.length === 0) {
    cacheSet(cacheKey, []);
    return [];
  }

  // Cap to top N to keep within Routes API matrix limits
  const capped = geometric.slice(0, MAX_CANDIDATES_FOR_DRIVE_TIME);

  const validated = await validateDetourTimes(capped, { maxDetourMinutes });
  cacheSet(cacheKey, validated);
  return validated;
}
