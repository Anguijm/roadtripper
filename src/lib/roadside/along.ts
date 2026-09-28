/**
 * Which survivors a planned route passes (step 22). Pure: the plan page
 * decodes its polyline and asks; the answer is the stops within the buffer
 * of the road, in road order, with how far along they sit.
 */

import { haversineKm, type LatLng } from "@/lib/routing/polyline";
import { withinCorridor, DEFAULT_BUFFER_KM } from "./corridor";
import type { RoadsideSurvivor } from "./survivors";

export interface RoadsideMarker extends RoadsideSurvivor {
  /** Distance along the route to the nearest point of the road, in km. */
  alongKm: number;
}

/**
 * The survivors within `bufferKm` of the route, sorted by where along the
 * route they sit. A route too short to have a direction (fewer than two
 * points) passes nothing.
 */
export function roadsideAlong(survivors: readonly RoadsideSurvivor[], route: readonly LatLng[], bufferKm = DEFAULT_BUFFER_KM): RoadsideMarker[] {
  if (route.length < 2) return [];
  // Cumulative distance at each vertex, once; each survivor then takes the
  // distance at its nearest vertex. A vertex every few hundred metres makes
  // that within a rounding of the true along-route distance.
  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + haversineKm(route[i - 1], route[i]));
  const out: RoadsideMarker[] = [];
  for (const s of survivors) {
    if (!withinCorridor(s, route as LatLng[], bufferKm)) continue;
    let best = 0;
    let bestKm = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineKm(route[i], s);
      if (d < bestKm) {
        bestKm = d;
        best = i;
      }
    }
    out.push({ ...s, alongKm: cum[best] });
  }
  return out.sort((a, b) => a.alongKm - b.alongKm || a.name.localeCompare(b.name, "en"));
}
