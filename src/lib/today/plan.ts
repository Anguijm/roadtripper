import "server-only";

import { allCities, snapToCity, hasDriveGraphFor, driveTimesFrom } from "@/lib/atlas/queries";
import type { RadialCandidate } from "@/lib/routing/radial";
import type { LatLng } from "@/lib/plan/types";

/**
 * "I have five hours. What is in range?"
 *
 * No destination, no route, no external call. The origin snaps to its atlas
 * city, and the drive graph answers which cities are within the hours,
 * nearest first. Every number here comes from SQLite, so a page open costs
 * nothing and takes milliseconds.
 */

export type TodayReach =
  /** Snapped to a city with graph rows; `reachable` is the answer. */
  | "hit"
  /** No atlas city within 40 km of the point. Rural, or outside the US. */
  | "no-city"
  /** A city we know, but the graph has no rows for it (never on a complete graph). */
  | "no-graph";

export interface TodayPlan {
  origin: LatLng;
  hours: number;
  here: { city: { id: string; name: string; lat: number; lng: number }; distanceKm: number } | null;
  reach: TodayReach;
  /** Cities within `hours` of one-way driving, nearest first. */
  reachable: RadialCandidate[];
}

export function planToday(origin: LatLng, hours: number): TodayPlan {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`hours must be a positive number, got ${hours}`);
  }
  const snapped = snapToCity(origin);
  if (!snapped) return { origin, hours, here: null, reach: "no-city", reachable: [] };

  const { id, name, lat, lng } = snapped.city;
  const here = { city: { id, name, lat, lng }, distanceKm: snapped.distanceKm };
  if (!hasDriveGraphFor(id)) return { origin, hours, here, reach: "no-graph", reachable: [] };

  const byId = new Map(allCities().map((c) => [c.id, c]));
  // driveTimesFrom already filters to the budget and sorts ascending; the
  // minutes it holds are calibrated, one-way, city centre to city centre.
  const reachable = driveTimesFrom(id, hours * 60).flatMap((row) => {
    const city = byId.get(row.cityId);
    return city ? [{ city, oneWayDriveMinutes: row.minutes }] : [];
  });
  return { origin, hours, here, reach: "hit", reachable };
}
