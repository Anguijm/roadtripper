import "server-only";

import { allCities, snapToCity, hasDriveGraphFor, driveTimesFrom, driveGraphPaceMinutesPerKm, haversineKm } from "@/lib/atlas/queries";
import type { RadialCandidate } from "@/lib/routing/radial";
import type { LatLng } from "@/lib/plan/types";

/**
 * "I have five hours. What is in range?"
 *
 * No destination, no route, no external call. The origin snaps to its atlas
 * city, and the drive graph answers which cities are within the hours,
 * nearest first. Every number here comes from SQLite, so a page open costs
 * nothing and takes milliseconds.
 *
 * Between towns (no atlas town within 40 km) the /today page says so and
 * asks for a town; the car app's endpoints ask for `betweenTowns` instead
 * and get an answer from the point itself (`planBetweenTowns`).
 */

/**
 * Between towns, the nearest atlas town must be within this to stand as
 * "here", or the answer is no-city. 650 km is the drive graph's own
 * neighbourhood (NEIGHBOUR_RADIUS_KM in scripts/build-drive-graph.mjs) and
 * about what the longest day, 8 hours, covers at the graph's pace (0.7355
 * min/km: 653 km), so a point with no town this near has none in reach on
 * any day: mid-ocean, or abroad where the atlas is thin.
 */
export const NEAREST_TOWN_MAX_KM = 650;

export type TodayReach =
  /** Snapped to a city with graph rows; `reachable` is the answer. */
  | "hit"
  /**
   * No atlas city within 40 km, asked with `betweenTowns`: `here` is the
   * nearest town (up to NEAREST_TOWN_MAX_KM away) and `reachable` is every
   * town today's hours cover, measured from the point itself and estimated
   * (straight line at the drive graph's median pace). The car's request,
   * 2026-11-14 (John: "no nearby towns" between cities).
   */
  | "between"
  /** No atlas city within 40 km of the point (without `betweenTowns`), or none within NEAREST_TOWN_MAX_KM (with it). */
  | "no-city"
  /** A city we know, but the graph has no rows for it (never on a complete graph). */
  | "no-graph";

export interface TodayPlan {
  origin: LatLng;
  hours: number;
  here: { city: { id: string; name: string; lat: number; lng: number; country: string }; distanceKm: number } | null;
  reach: TodayReach;
  /** Cities within `hours` of one-way driving, nearest first. On "between", estimated from `origin`, and `here`'s town is one of them. */
  reachable: RadialCandidate[];
}

export function planToday(origin: LatLng, hours: number, opts: { betweenTowns?: boolean } = {}): TodayPlan {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`hours must be a positive number, got ${hours}`);
  }
  const snapped = snapToCity(origin);
  if (!snapped) return opts.betweenTowns ? planBetweenTowns(origin, hours) : { origin, hours, here: null, reach: "no-city", reachable: [] };

  const { id, name, lat, lng, country } = snapped.city;
  const here = { city: { id, name, lat, lng, country: country ?? "" }, distanceKm: snapped.distanceKm };
  if (!hasDriveGraphFor(id)) return { origin, hours, here, reach: "no-graph", reachable: [] };

  const byId = new Map(allCities().map((c) => [c.id, c]));
  // driveTimesFrom already filters to the budget and sorts ascending; the
  // minutes it holds are calibrated, one-way, city centre to city centre.
  // Deliberately not capped here. The graph holds at most 56 rows for any
  // origin (650 km neighbourhood; mean 27), read by one indexed query, and
  // the waypoint pipeline slices to its own MAX_WAYPOINT_CITIES before it
  // touches waypoints. A cap here would only make "N cities within 5 hours"
  // a lie; the page shows the count and says how many it left out.
  const reachable = driveTimesFrom(id, hours * 60).flatMap((row) => {
    const city = byId.get(row.cityId);
    return city ? [{ city, oneWayDriveMinutes: row.minutes }] : [];
  });
  return { origin, hours, here, reach: "hit", reachable };
}

/**
 * Today from a point no atlas town is near. The drive graph is measured
 * between town centres, so from 100 km out its minutes would be off by the
 * hour or more it takes to reach that centre; instead every town is measured
 * from the point by straight line at the graph's median pace, as the car
 * already measures roadside stops. The nearest town stands as `here` so the
 * answer can say where you are, but you are not in it, so it is a town in
 * the list like any other. Nearest first; ties by id, so the order is stable.
 */
function planBetweenTowns(origin: LatLng, hours: number): TodayPlan {
  const nearest = snapToCity(origin, NEAREST_TOWN_MAX_KM);
  if (!nearest) return { origin, hours, here: null, reach: "no-city", reachable: [] };
  const { id, name, lat, lng, country } = nearest.city;
  const here = { city: { id, name, lat, lng, country: country ?? "" }, distanceKm: nearest.distanceKm };
  const pace = driveGraphPaceMinutesPerKm();
  const reachable = allCities()
    .map((city) => ({ city, oneWayDriveMinutes: haversineKm(origin, city) * pace }))
    .filter((r) => r.oneWayDriveMinutes <= hours * 60)
    .sort((a, b) => a.oneWayDriveMinutes - b.oneWayDriveMinutes || a.city.id.localeCompare(b.city.id));
  return { origin, hours, here, reach: "between", reachable };
}
