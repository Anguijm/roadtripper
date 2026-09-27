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
 * True when a stop at `city` is progress: closer to the destination than the
 * origin is, and not past it. "Closer" already rules out behind and
 * sideways (a city at right angles is farther from the destination than the
 * origin, by Pythagoras); "not past" rules out overshooting and having to
 * come back. When origin and destination coincide nothing is progress.
 */
export function makesProgress(city: LatLng, origin: LatLng, destination: LatLng): boolean {
  const { totalKm, remainingKm, alongKm } = progressToward(city, origin, destination);
  return remainingKm < totalKm && alongKm <= totalKm;
}
