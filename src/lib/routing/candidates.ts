import "server-only";
import type { City } from "@/lib/urban-explorer/types";
import { getAllCities } from "@/lib/urban-explorer/cities";
import {
  decodePolyline,
  samplePolyline,
  haversineKm,
  type LatLng,
} from "./polyline";

export interface GeometricCandidate {
  city: City;
  /** Min Haversine distance from any sample point to the city, in km */
  minDistanceKm: number;
  /** The route sample point that was closest to the city */
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

/**
 * PHASE 1 — Geometric pre-filter (zero API cost).
 *
 * Decodes the encoded polyline, samples it every ~50km, then filters
 * the 102 UE cities by minimum Haversine distance to the nearest sample
 * point. Returns candidates within the buffer (default 120km) sorted by
 * distance.
 */
export function geometricFilter(
  encodedPolyline: string,
  options: { sampleIntervalKm?: number; bufferKm?: number; cities?: City[] } = {}
): GeometricCandidate[] {
  const sampleIntervalKm = options.sampleIntervalKm ?? DEFAULT_SAMPLE_INTERVAL_KM;
  const bufferKm = options.bufferKm ?? DEFAULT_GEOMETRIC_BUFFER_KM;
  const cities = options.cities ?? getAllCities();

  const decoded = decodePolyline(encodedPolyline);
  const samples = samplePolyline(decoded, sampleIntervalKm);

  if (samples.length === 0) return [];

  const candidates: GeometricCandidate[] = [];

  for (const city of cities) {
    let minDistance = Infinity;
    let nearest = samples[0];

    for (const sample of samples) {
      const d = haversineKm(sample, { lat: city.lat, lng: city.lng });
      if (d < minDistance) {
        minDistance = d;
        nearest = sample;
      }
    }

    if (minDistance <= bufferKm) {
      candidates.push({ city, minDistanceKm: minDistance, nearestRoutePoint: nearest });
    }
  }

  return candidates.sort((a, b) => a.minDistanceKm - b.minDistanceKm);
}

interface DistanceMatrixResponse {
  rows?: Array<{
    elements: Array<{
      status: string;
      duration?: { value: number };
      distance?: { value: number };
    }>;
  }>;
  status?: string;
  error_message?: string;
}

/**
 * PHASE 2 — Drive-time validation via Google Distance Matrix API.
 *
 * For geometric candidates, batch a single Distance Matrix request to
 * compute actual drive times from each candidate's nearest route point
 * to the city. Filters to candidates whose round-trip detour fits the
 * user's daily budget tolerance (default 60 min round-trip).
 *
 * One Distance Matrix call covers up to 25 origins × 25 destinations =
 * 625 elements. We typically have 5-15 candidates so a single call is enough.
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

  // Build paired origins/destinations: for each candidate we need ONE
  // measurement (its nearest route point → its city). We use the
  // pairs trick: send N origins and N destinations, then read the
  // diagonal of the resulting matrix.
  const origins = candidates
    .map((c) => `${c.nearestRoutePoint.lat},${c.nearestRoutePoint.lng}`)
    .join("|");
  const destinations = candidates
    .map((c) => `${c.city.lat},${c.city.lng}`)
    .join("|");

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", origins);
  url.searchParams.set("destinations", destinations);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Distance Matrix API failed (${response.status})`);
  }

  const data: DistanceMatrixResponse = await response.json();
  if (data.status && data.status !== "OK") {
    throw new Error(`Distance Matrix error: ${data.status} ${data.error_message ?? ""}`);
  }

  const validated: ValidatedCandidate[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const element = data.rows?.[i]?.elements?.[i];
    if (!element || element.status !== "OK" || !element.duration) continue;

    const detourSeconds = element.duration.value;
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
 * Full pipeline: encoded polyline → validated candidate cities.
 */
export async function findCandidateCities(
  encodedPolyline: string,
  options: {
    sampleIntervalKm?: number;
    bufferKm?: number;
    maxDetourMinutes?: number;
  } = {}
): Promise<ValidatedCandidate[]> {
  const geometric = geometricFilter(encodedPolyline, {
    sampleIntervalKm: options.sampleIntervalKm,
    bufferKm: options.bufferKm,
  });

  if (geometric.length === 0) return [];

  // Cap to top 25 to stay within Distance Matrix limits
  const capped = geometric.slice(0, 25);

  return validateDetourTimes(capped, {
    maxDetourMinutes: options.maxDetourMinutes,
  });
}
