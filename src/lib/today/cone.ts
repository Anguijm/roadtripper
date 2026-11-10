/**
 * "The general direction" of a destination, for the car app's
 * /api/today/toward (docs/car-api.md).
 *
 * John's ruling, 2026-11-10: "Rough cone, no lookup". No Routes call; the
 * direction is geometry. A place counts as toward the destination when going
 * there first costs at most a quarter more distance than heading straight:
 *
 *     km(here, place) + km(place, destination) <= CONE_RATIO * km(here, destination)
 *
 * That set is an ellipse with here and the destination as its ends, widest
 * halfway (about 0.38 of the trip each side at 1.25). An ellipse alone also
 * takes a strip behind you (Flint, heading south from Detroit, on the first
 * run), so a place must also leave you closer to the destination than you
 * are now. Straight-line distances only, which is the "rough" John chose: a
 * road that bends round a lake can put a place outside that the road passes.
 *
 * Pure and isomorphic, so it is tested without the atlas.
 */
import { haversineKm } from "@/lib/routing/polyline";
import type { LatLng } from "@/lib/plan/types";

/**
 * How much longer than straight the detour through a place may be. 1.25 is
 * "very general" (John's words) without being "anywhere": on Detroit to
 * Louisville (about 500 km) it reaches some 190 km either side halfway, and
 * on the first runs it took Ann Arbor, Toledo, Dayton, Columbus, Cincinnati
 * and Indianapolis and left out Chicago and Cleveland. Wider admits more
 * places to the side and makes the store's box query larger (its area grows
 * with the ratio); narrower drops towns a road reaches with a small detour.
 * Changing it: read the lists it gives on a few real trips, as was done for
 * 1.25, and re-run src/lib/today/__tests__/cone.test.ts and toward.test.ts.
 */
export const CONE_RATIO = 1.25;

/** The extra straight-line km of going through `p` on the way from `from` to `to`. Never negative. */
export function detourKm(from: LatLng, to: LatLng, p: LatLng): number {
  return Math.max(0, haversineKm(from, p) + haversineKm(p, to) - haversineKm(from, to));
}

/** Whether `p` lies in the cone from `from` toward `to`: inside the ellipse, and nearer `to` than `from` is. */
export function inCone(from: LatLng, to: LatLng, p: LatLng, ratio: number = CONE_RATIO): boolean {
  const straight = haversineKm(from, to);
  if (!(straight > 0)) return false;
  const left = haversineKm(p, to);
  return left < straight && haversineKm(from, p) + left <= ratio * straight;
}

export interface Box {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const KM_PER_DEG_LAT = 111.32;

/** A box around a circle of `km` about `c`, for an indexed lat/lng query. */
export function boxAround(c: LatLng, km: number): Box {
  const dLat = km / KM_PER_DEG_LAT;
  // Longitude degrees shrink with latitude; the floor keeps the box finite
  // near the poles, which the US never reaches.
  const dLng = km / (KM_PER_DEG_LAT * Math.max(0.05, Math.cos((c.lat * Math.PI) / 180)));
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng };
}

/**
 * A box that holds every point of the cone within `reachKm` of `from`: the
 * ellipse lies inside the circle about its midpoint with radius half its long
 * axis, and today's reach is a circle about `from`; the overlap of their
 * boxes holds both. Null when they do not overlap.
 */
export function coneBox(from: LatLng, to: LatLng, reachKm: number, ratio: number = CONE_RATIO): Box | null {
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
  const a = boxAround(mid, (ratio * haversineKm(from, to)) / 2);
  const b = boxAround(from, reachKm);
  const box = {
    minLat: Math.max(a.minLat, b.minLat),
    maxLat: Math.min(a.maxLat, b.maxLat),
    minLng: Math.max(a.minLng, b.minLng),
    maxLng: Math.min(a.maxLng, b.maxLng),
  };
  return box.minLat <= box.maxLat && box.minLng <= box.maxLng ? box : null;
}

/** Straight-line km as driving minutes, by the drive graph's own ratio. Whole minutes. */
export function estimateMinutes(km: number, minutesPerKm: number): number {
  return Math.round(Math.max(0, km) * minutesPerKm);
}
