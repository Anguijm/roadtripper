/**
 * Which towns the sheet offers (Gauntlet U21). The server fetches towns up
 * to the slack detour limit and tags those past the on-the-way one; the
 * sheet offers them only when the trip has a day to spare, and after
 * every town on the way, so the title names them last ("Lubbock and
 * Oklahoma City fit today") and the map names them last when names
 * collide. Pure; the set's other towns keep their order.
 */
import type { CityContext } from "@/lib/routing/scoring";

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
