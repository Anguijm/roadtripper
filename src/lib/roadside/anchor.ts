/**
 * Which town a roadside stop is at or past (Gauntlet U1, round 3), for the
 * card's "6 mi in, at Amarillo" and "132 mi in, past Lubbock". Pure: the
 * towns the plan page already has (the start, the end, the towns that fit)
 * and the route it already has, nothing fetched.
 */

import { haversineKm, samplePolyline, type LatLng } from "@/lib/routing/polyline";

export interface NamedPoint extends LatLng {
  name: string;
}

export interface RoadTown extends NamedPoint {
  /** Distance along the route to the nearest sampled point of the road, in km. */
  alongKm: number;
}

export interface RoadsideAnchor {
  name: string;
  /** True when the stop is within NEAR_KM of the town, "at"; false when the town is the last one before it, "past". */
  near: boolean;
}

/**
 * A town this far from the road or nearer, in km, is on it and can be
 * named with a stop; a town that fits the trip can sit hours off the road
 * and is not. 15 takes in a town the road skirts on a bypass or a loop
 * (Tulia, 4.6 km off the test's road, is on it) and keeps out one the
 * road never reaches (Clovis, 46 km off, is not), so the card never says
 * "past" a town the person did not drive through. Moves with it:
 * `townsAlong` alone; nothing in CSS. Check: the test "places the towns
 * along the road and names the one a stop is at or past" in
 * src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx, and on
 * the page a card that says "past Lubbock" for a stop beyond it.
 */
export const ON_ROAD_KM = 15;
/**
 * A stop this near a town on the road, in km, is "at" it; farther, it is
 * "past" the last town before it. 10 is about a town's own spread on the
 * plains (Amarillo's limits run some 10 km from its centre) and is under
 * ON_ROAD_KM, so a stop "at" a town is always at a town on the road.
 * Moves with it: `roadsideAnchor` alone. Check: the same named test (11 km
 * down the road is "past Amarillo", beside Tulia is "at Tulia"), and on
 * the page "6 mi in, at Amarillo" for a stop inside the town.
 */
export const NEAR_KM = 10;
/**
 * The route is sampled every this many km before the towns are placed
 * along it, so a town's distance along the road is within half a km of
 * true, well inside ON_ROAD_KM and NEAR_KM. Finer buys nothing a person
 * reads (the card rounds to miles) and costs one haversine per town per
 * sample, a few tens of thousands on an 800 km route, once per route.
 * Moves with it: `townsAlong` alone. Check: the same named test pins Tulia
 * at 55.6 km and the end at 111.2 on a 111 km road.
 */
export const SAMPLE_KM = 1;

/**
 * The towns on the road in road order: the start at 0, every given town
 * within `onRoadKm` of the route at the distance of its nearest sampled
 * point, the end at the route's length. A route too short to have a
 * direction gives the start alone. Cost: one sample pass, then one
 * haversine per town per sample (a few tens of thousands on an 800 km
 * route), once per route.
 */
export function townsAlong(route: readonly LatLng[], start: NamedPoint, end: NamedPoint, towns: readonly NamedPoint[], onRoadKm = ON_ROAD_KM): RoadTown[] {
  if (route.length < 2) return [{ name: start.name, lat: start.lat, lng: start.lng, alongKm: 0 }];
  const sampled = samplePolyline(route as LatLng[], SAMPLE_KM);
  const cum: number[] = [0];
  for (let i = 1; i < sampled.length; i++) cum.push(cum[i - 1] + haversineKm(sampled[i - 1], sampled[i]));
  const out: RoadTown[] = [{ name: start.name, lat: start.lat, lng: start.lng, alongKm: 0 }];
  for (const t of towns) {
    let best = 0;
    let bestKm = Infinity;
    for (let i = 0; i < sampled.length; i++) {
      const d = haversineKm(sampled[i], t);
      if (d < bestKm) {
        bestKm = d;
        best = i;
      }
    }
    if (bestKm <= onRoadKm) out.push({ name: t.name, lat: t.lat, lng: t.lng, alongKm: cum[best] });
  }
  out.push({ name: end.name, lat: end.lat, lng: end.lng, alongKm: cum[cum.length - 1] });
  return out.sort((a, b) => a.alongKm - b.alongKm);
}

/**
 * The town to say with a stop: the nearest one when it is within `nearKm`
 * ("at Amarillo"), else the last one on the road before the stop ("past
 * Lubbock"). With the start always at 0 there is always an answer; null
 * only when no towns are given.
 */
export function roadsideAnchor(stop: LatLng & { alongKm: number }, towns: readonly RoadTown[], nearKm = NEAR_KM): RoadsideAnchor | null {
  if (towns.length === 0) return null;
  let nearest = towns[0];
  let nearestKm = Infinity;
  for (const t of towns) {
    const d = haversineKm(t, stop);
    if (d < nearestKm) {
      nearestKm = d;
      nearest = t;
    }
  }
  if (nearestKm <= nearKm) return { name: nearest.name, near: true };
  let past = towns[0];
  for (const t of towns) if (t.alongKm <= stop.alongKm) past = t;
  return { name: past.name, near: false };
}
