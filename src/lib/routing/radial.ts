import "server-only";
import { getAllCities } from "@/lib/urban-explorer/cities";
import type { City } from "@/lib/urban-explorer/types";
import { cacheGet, cacheSet, radialCacheKey } from "./cache";
import type { LatLng } from "./polyline";

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface RadialCandidate {
  city: City;
  driveMinutes: number;
}

const COMPASS_BEARINGS: Record<CompassPoint, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

const COMPASS_POINTS: CompassPoint[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function snapToCompassPoint(bearing: number): CompassPoint {
  const b = ((bearing % 360) + 360) % 360;
  const idx = Math.round(b / 45) % 8;
  return COMPASS_POINTS[idx];
}

export function bearingFromCompassPoint(cp: CompassPoint): number {
  return COMPASS_BEARINGS[cp];
}

export function withinSemicircle(city: LatLng, origin: LatLng, headingDeg: number): boolean {
  const bearing = bearingDeg(origin, city);
  let diff = Math.abs(bearing - headingDeg);
  if (diff > 180) diff = 360 - diff;
  return diff <= 90;
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
      const seconds = parseInt(el.duration.replace("s", ""), 10);
      if (!Number.isNaN(seconds)) {
        result.set(cities[el.destinationIndex].id, seconds / 60);
      }
    }
  }
  return result;
}

const RETRY_INCREMENT_MINUTES = 15;
const MAX_RETRIES = 2;

/**
 * Find candidate cities reachable from `origin` within `maxMinutes` drive,
 * filtered to a 180° semicircle aimed toward `destination`.
 *
 * ONE Routes API matrix call (1×N cities) per cache miss. Zero-results retry
 * expands the in-memory threshold by 15-min increments (max 2), so the
 * entire retry sequence never triggers additional API calls.
 */
export async function findCitiesInRadius(
  origin: LatLng,
  destination: LatLng,
  maxMinutes: number
): Promise<RadialCandidate[]> {
  const compassPoint = snapToCompassPoint(bearingDeg(origin, destination));
  const cacheKey = radialCacheKey(origin.lat, origin.lng, maxMinutes, compassPoint);

  const cached = cacheGet<RadialCandidate[]>(cacheKey);
  if (cached) return cached;

  const allCities = await getAllCities();
  const headingDeg = bearingFromCompassPoint(compassPoint);
  const inSemicircle = allCities.filter((c) => withinSemicircle(c, origin, headingDeg));

  const driveTimes = await fetchDriveTimes(origin, inSemicircle);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const threshold = maxMinutes + attempt * RETRY_INCREMENT_MINUTES;
    const candidates: RadialCandidate[] = [];
    for (const city of inSemicircle) {
      const driveMinutes = driveTimes.get(city.id);
      if (driveMinutes !== undefined && driveMinutes <= threshold) {
        candidates.push({ city, driveMinutes });
      }
    }
    if (candidates.length > 0 || attempt === MAX_RETRIES) {
      candidates.sort((a, b) => a.driveMinutes - b.driveMinutes);
      cacheSet(cacheKey, candidates);
      return candidates;
    }
  }

  return [];
}
