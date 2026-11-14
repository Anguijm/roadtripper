import "server-only";

import { allCities, snapToCity, hasDriveGraphFor, driveTimesFrom, driveGraphPaceMinutesPerKm, haversineKm } from "@/lib/atlas/queries";
import type { RadialCandidate } from "@/lib/routing/radial";
import type { LatLng } from "@/lib/plan/types";
import type { City } from "@/lib/urban-explorer/types";

/**
 * "I have five hours. What is in range?"
 *
 * No destination, no route, no external call. The origin snaps to its atlas
 * city, and the drive graph answers which cities are within the hours,
 * nearest first. Every number here comes from SQLite, so a page open costs
 * nothing and takes milliseconds.
 *
 * Two options, asked for by the car app's endpoints (2026-11-14) and by the
 * /today page since U53 the same day (John: "Both"); without them the
 * answer is the drive graph's alone:
 * - `betweenTowns`: with no atlas town within 40 km, an answer from the
 *   point itself (`planBetweenTowns`) instead of no-city.
 * - `beyondGraph`: towns past the drive graph's 650 km are added with an
 *   estimate, for days longer than the graph reaches: 10 and 12 hours and
 *   no limit (`hours` Infinity).
 */

/**
 * The drive graph's neighbourhood: pairs are built only between towns this
 * close (NEIGHBOUR_RADIUS_KM in scripts/build-drive-graph.mjs; a test reads
 * the script so the two cannot drift). Inside it, a town missing from a
 * town's rows is out of the budget, or a pair the road cannot make (an
 * island); outside it, the graph simply does not know.
 */
export const GRAPH_NEIGHBOURHOOD_KM = 650;

/**
 * Between towns, the nearest atlas town must be within this to stand as
 * "here", or the answer is no-city. The graph's neighbourhood, and about
 * what 8 hours cover at the graph's pace (0.72 min/km: 660 km). A point
 * this far from every town is off the map the atlas covers (mid-ocean, or
 * abroad where it is thin), so even a longer day does not lift it.
 */
export const NEAREST_TOWN_MAX_KM = GRAPH_NEIGHBOURHOOD_KM;

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

/** A town in range, and whether its minutes are the drive graph's (false) or a straight-line estimate from the point (true). */
export interface TodayCandidate extends RadialCandidate {
  estimated: boolean;
}

export interface TodayPlan {
  origin: LatLng;
  /** Infinity for no limit (the car's `hours=any`). */
  hours: number;
  here: { city: { id: string; name: string; lat: number; lng: number; country: string }; distanceKm: number } | null;
  reach: TodayReach;
  /** Cities within `hours` of one-way driving, nearest first. On "between", all estimated from `origin`, and `here`'s town is one of them. */
  reachable: TodayCandidate[];
}

export function planToday(origin: LatLng, hours: number, opts: { betweenTowns?: boolean; beyondGraph?: boolean } = {}): TodayPlan {
  // Infinity passes (no limit); NaN, 0 and below do not.
  if (!(hours > 0)) {
    throw new Error(`hours must be a positive number, got ${hours}`);
  }
  const snapped = snapToCity(origin);
  if (!snapped) return opts.betweenTowns ? planBetweenTowns(origin, hours) : { origin, hours, here: null, reach: "no-city", reachable: [] };

  const { id, name, lat, lng, country } = snapped.city;
  const here = { city: { id, name, lat, lng, country: country ?? "" }, distanceKm: snapped.distanceKm };
  if (!hasDriveGraphFor(id)) return { origin, hours, here, reach: "no-graph", reachable: [] };

  const budget = hours * 60;
  const byId = new Map(allCities().map((c) => [c.id, c]));
  // driveTimesFrom already filters to the budget and sorts ascending; the
  // minutes it holds are calibrated, one-way, city centre to city centre.
  // Deliberately not capped here. The graph holds at most 56 rows for any
  // origin (650 km neighbourhood; mean 27), read by one indexed query, and
  // the waypoint pipeline slices to its own MAX_WAYPOINT_CITIES before it
  // touches waypoints. A cap here would only make "N cities within 5 hours"
  // a lie; the page shows the count and says how many it left out. No limit
  // binds Infinity, which SQLite compares as a real (every row; tested).
  const graphRows: TodayCandidate[] = driveTimesFrom(id, budget).flatMap((row) => {
    const city = byId.get(row.cityId);
    return city ? [{ city, oneWayDriveMinutes: row.minutes, estimated: false }] : [];
  });
  if (!opts.beyondGraph) return { origin, hours, here, reach: "hit", reachable: graphRows };

  const beyond = beyondTheGraph(origin, snapped.city, budget);
  const reachable = beyond.length === 0 ? graphRows : [...graphRows, ...beyond].sort((a, b) => a.oneWayDriveMinutes - b.oneWayDriveMinutes || a.city.id.localeCompare(b.city.id));
  return { origin, hours, here, reach: "hit", reachable };
}

/**
 * The towns farther from `hereCity` than the graph's neighbourhood that the
 * budget covers by estimate: straight line from the point at the graph's
 * median pace, as between towns. Only those: inside the neighbourhood the
 * graph has measured, and a town it leaves out is out of reach.
 */
function beyondTheGraph(origin: LatLng, hereCity: City, budget: number): TodayCandidate[] {
  const pace = driveGraphPaceMinutesPerKm();
  return allCities().flatMap((city) => {
    if (haversineKm(hereCity, city) <= GRAPH_NEIGHBOURHOOD_KM) return [];
    const minutes = haversineKm(origin, city) * pace;
    return minutes <= budget ? [{ city, oneWayDriveMinutes: minutes, estimated: true }] : [];
  });
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
    .map((city) => ({ city, oneWayDriveMinutes: haversineKm(origin, city) * pace, estimated: true }))
    .filter((r) => r.oneWayDriveMinutes <= hours * 60)
    .sort((a, b) => a.oneWayDriveMinutes - b.oneWayDriveMinutes || a.city.id.localeCompare(b.city.id));
  return { origin, hours, here, reach: "between", reachable };
}
