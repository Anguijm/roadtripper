/**
 * Which cities count as "ahead" on a trip.
 *
 * The old rule was a 180-degree fan: any city whose bearing was within 90
 * degrees of the heading, and the heading was first snapped to one of eight
 * compass points, so the fan could swing 22.5 degrees off the true line. A
 * city at right angles to the trip, or a little behind it, was offered as a
 * stop. Session 24's plan named it: "nothing behind you is ever offered."
 *
 * The rule now is progress. A city is ahead when stopping there leaves less
 * straight-line distance to the destination than you have now, and when it
 * is not past the destination. Pure geometry, client-safe, no atlas.
 */

import { haversineKm, type LatLng } from "./polyline";

/** Initial bearing from one point to another, degrees clockwise from north, in [0, 360). */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface Progress {
  /** Origin to destination, km. */
  totalKm: number;
  /** City to destination, km. Less than totalKm means the stop helps. */
  remainingKm: number;
  /** How far along the origin-to-destination line the city sits, km. Negative is behind. */
  alongKm: number;
}

export function progressToward(city: LatLng, origin: LatLng, destination: LatLng): Progress {
  const totalKm = haversineKm(origin, destination);
  const remainingKm = haversineKm(city, destination);
  const distKm = haversineKm(origin, city);
  // Signed angle between the two bearings, folded into [-180, 180): adding
  // 540 makes the value positive before the modulo (JavaScript's % keeps the
  // sign of its left operand), the % 360 wraps it, the -180 recentres it.
  // Only its cosine is used, so the sign does not matter here; it is folded
  // anyway so a 350-degree difference reads as -10, not as "almost a circle".
  const diff = ((bearingDeg(origin, city) - bearingDeg(origin, destination) + 540) % 360) - 180;
  const alongKm = distKm * Math.cos((diff * Math.PI) / 180);
  return { totalKm, remainingKm, alongKm };
}

/**
 * How much longer the trip is through `city` than straight, as a ratio:
 * (origin → city + city → destination) / (origin → destination). 1 is on
 * the straight line; 1.5 is half as long again.
 */
export function detourRatio(city: LatLng, origin: LatLng, destination: LatLng): number {
  const totalKm = haversineKm(origin, destination);
  if (totalKm === 0) return Infinity;
  return (haversineKm(origin, city) + haversineKm(city, destination)) / totalKm;
}

/**
 * The longest a town may make the trip and still count as ahead: a quarter
 * longer than going straight (Gauntlet U17).
 *
 * Measured on three trips before it was chosen — Amarillo → Austin, Dallas →
 * Denver, Chicago → Nashville. Every town on the road those trips actually
 * take is under 1.1 (Lubbock 1.07, Indianapolis 1.05, Louisville 1.07); the
 * ones a person would call out of the way are over 1.25 (Oklahoma City 1.45
 * from Amarillo to Austin, Columbus 1.53, St. Louis and Dayton 1.30). The
 * table is in `__tests__/progress.test.ts`. Straight lines, like the rest of
 * this file: a road that bends can make a town look further off than it is.
 */
export const MAX_DETOUR_RATIO = 1.25;

/**
 * True when a stop at `city` is progress: closer to the destination than the
 * origin is, not past it, and not far off the way.
 *
 * "Closer" rules out behind. It does not rule out sideways, whatever this
 * comment used to say — "a city at right angles is farther from the
 * destination than the origin, by Pythagoras" holds only at exactly right
 * angles. Oklahoma City is 578 km from Austin against Amarillo's 667, so it
 * passed as ahead on Amarillo → Austin, though going through it is about
 * 1,000 km against 667 direct. The detour limit is what rules out sideways
 * (U17). "Not past" rules out overshooting and having to come back. When
 * origin and destination coincide nothing is progress.
 */
export function makesProgress(city: LatLng, origin: LatLng, destination: LatLng, maxDetourRatio = MAX_DETOUR_RATIO): boolean {
  const { totalKm, remainingKm, alongKm } = progressToward(city, origin, destination);
  return remainingKm < totalKm && alongKm <= totalKm && detourRatio(city, origin, destination) <= maxDetourRatio;
}

/**
 * How far out of the way a town may be for a trip with a day to spare
 * (Gauntlet U21; the operator on U17: Oklahoma City on Amarillo to Austin
 * is fine "if you have five days… at the bottom of the list"). Oklahoma
 * City is 1.45 there. Still only towns that bring you closer: going west
 * to go east never qualifies, whatever the ratio.
 */
export const MAX_DETOUR_RATIO_WITH_SLACK = 1.5;

/** A town past MAX_DETOUR_RATIO but within the slack limit: offered only with a day to spare, and last. */
export function isOutOfTheWay(city: LatLng, origin: LatLng, destination: LatLng): boolean {
  return detourRatio(city, origin, destination) > MAX_DETOUR_RATIO;
}
