/**
 * Which towns the sheet offers (Gauntlet U21). The server fetches towns up
 * to the slack detour limit and tags those past the on-the-way one; the
 * sheet offers them only when the trip has a day to spare, and after
 * every town on the way, so the title names them last ("Lubbock and
 * Oklahoma City fit today") and the map names them last when names
 * collide. Pure; the set's other towns keep their order.
 */
import type { CityContext } from "@/lib/routing/scoring";
import type { Road } from "@/lib/plan/days";
import { haversineKm, projectOntoPolyline, type LatLng } from "@/lib/routing/polyline";

/**
 * How far off the route's road, in km, a town may sit and still be on the
 * way (Gauntlet U39). The search marks a detour by straight lines (U17,
 * before the route is known), and Omaha passed on Kansas City to Denver
 * at 1.16 though it sits some 200 km off I-70; several critics read it,
 * Lincoln and Wichita as dots off the route. Past this, a town is out of
 * the way like a detour: offered with a day to spare, last. 60 km, about
 * 40 minutes each way: measured on the real routes, Abilene sits 54 km
 * off Amarillo to Austin's road (kept, a choice for the night) and San
 * Angelo 66 (out); Omaha, Lincoln and Wichita sit 130 km or more off I-70.
 */
export const OFF_ROAD_OUT_KM = 60;

/**
 * Marks out of the way every town farther than OFF_ROAD_OUT_KM from the
 * road; the rest untouched. A road that does not join the trip's ends
 * (within OFF_ROAD_OUT_KM of each) measures nothing, and nothing is
 * marked: a town is never hidden by a route that is not this trip's.
 * (Several of the sheet's tests render a sample polyline unrelated to
 * their trip; this is also what keeps them honest.) Pure.
 */
export function markOffRoad<T extends { cities: CityContext[] }>(fetch: T, road: Road, ends: { origin: LatLng; destination: LatLng }, km = OFF_ROAD_OUT_KM): T {
  if (road.points.length < 2) return fetch;
  const first = road.points[0];
  const last = road.points[road.points.length - 1];
  if (haversineKm(first, ends.origin) > km || haversineKm(last, ends.destination) > km) return fetch;
  let changed = false;
  const cities = fetch.cities.map((c) => {
    // Measured to the road's segments, not its nearest vertex: a straight
    // interstate's vertices can sit 50 km apart, and Abilene, on I-20,
    // measured as off the road it is on.
    if (c.outOfTheWay || projectOntoPolyline(c, road.points as LatLng[]).distanceKm <= km) return c;
    changed = true;
    return { ...c, outOfTheWay: true };
  });
  return changed ? { ...fetch, cities } : fetch;
}

export function offeredTowns<T extends { cities: CityContext[]; waypoints: ReadonlyArray<{ cityId: string }> }>(fetch: T, roomForDetours: boolean): T {
  const kept = fetch.cities.filter((c) => roomForDetours || !c.outOfTheWay);
  if (kept.length === fetch.cities.length && !kept.some((c, i) => c.outOfTheWay && kept.slice(i + 1).some((d) => !d.outOfTheWay))) return fetch;
  const cities = [...kept.filter((c) => !c.outOfTheWay), ...kept.filter((c) => c.outOfTheWay)];
  const ids = new Set(cities.map((c) => c.id));
  return { ...fetch, cities, waypoints: fetch.waypoints.filter((w) => ids.has(w.cityId)) } as T;
}

/** The map's towns: only those the sheet offers (U21), so a town the trip has no room for is neither listed nor drawn. Pure. */
export function onlyOffered<M extends { id: string }>(markers: readonly M[], offered: { cities: ReadonlyArray<{ id: string }> }): M[] {
  const ids = new Set(offered.cities.map((c) => c.id));
  return markers.filter((m) => ids.has(m.id));
}
