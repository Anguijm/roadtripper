/**
 * The trip told as days (Gauntlet U3; quality bar, rule 5). Pure and
 * client-safe: the legs and the route the app already has, nothing fetched.
 *
 * A day is a stretch of road between overnights: the start to the first
 * stop, each stop to the next, the last stop to the end. No stops is one
 * day, the whole road. A stretch longer than the daily budget is still one
 * day, and its heading says it is over ("7 h 31 min, over the 4 h you
 * wanted"). The deadline arithmetic in trip-state.ts, which turns a long
 * leg into several nights, is untouched: that counts nights, this tells
 * the road.
 *
 * Every town and every roadside place is placed by its position along the
 * direct route: the road the page was planned on, and the one the roadside
 * stops were measured along (roadsideAlong in src/lib/roadside/along.ts).
 * A stop's own position is where the road passes nearest it, so a town
 * hours off the road still belongs to the stretch you leave the road from.
 */

import { haversineKm, type LatLng } from "@/lib/routing/polyline";
import type { RoadsideMarker } from "@/lib/roadside/along";

/** A route with the distance along it at every point, built once per plan. */
export interface Road {
  points: readonly LatLng[];
  /** Distance along the road at each point, in km; cumKm[0] is 0. */
  cumKm: readonly number[];
  lengthKm: number;
}

/** A road too short to have a direction (fewer than two points) has no length and places everything at 0. */
export function buildRoad(points: readonly LatLng[]): Road {
  if (points.length < 2) return { points: [], cumKm: [], lengthKm: 0 };
  const cumKm: number[] = [0];
  for (let i = 1; i < points.length; i++) cumKm.push(cumKm[i - 1] + haversineKm(points[i - 1], points[i]));
  return { points, cumKm, lengthKm: cumKm[cumKm.length - 1] };
}

/**
 * How far along the road it passes nearest to `p`, in km. The nearest
 * vertex, as roadsideAlong takes it, so a stop and a place measure the same
 * way; a route's vertices are a few hundred metres apart. Cost: one
 * haversine per vertex, a few thousand, per point placed.
 */
export function alongRoadKm(road: Road, p: LatLng): number {
  let best = 0;
  let bestKm = Infinity;
  for (let i = 0; i < road.points.length; i++) {
    const d = haversineKm(road.points[i], p);
    if (d < bestKm) {
      bestKm = d;
      best = i;
    }
  }
  return road.cumKm[best] ?? 0;
}

export interface DayStop {
  id: string;
  name: string;
  /** Where the road passes nearest the stop, in km along it. */
  alongKm: number;
}

export interface DayTown {
  id: string;
  name: string;
  alongKm: number;
}

export interface TripDay {
  /** 0-based; the heading says index + 1. */
  index: number;
  fromName: string;
  toName: string;
  /** The drive, in minutes. Null while this stretch's route is not known yet (a recompute in flight or failed). */
  minutes: number | null;
  /** Longer than the daily budget: the heading says so. */
  overBudget: boolean;
  /** The stretch along the direct route, in km. */
  startKm: number;
  endKm: number;
  towns: DayTown[];
  roadside: RoadsideMarker[];
}

export interface TripDaysInput {
  fromName: string;
  toName: string;
  /** The trip's stops in trip order. */
  stops: readonly DayStop[];
  /**
   * legMinutes[i] is the drive that ends at stop i; the last entry is the
   * drive from the last stop (or the start) to the end. Null where the
   * route for that stretch is not known. Shorter than stops + 1 is read
   * as null past its end.
   */
  legMinutes: ReadonlyArray<number | null>;
  /** The direct route's length, where the last day ends. */
  roadLengthKm: number;
  towns: readonly DayTown[];
  roadside: readonly RoadsideMarker[];
  budgetMinutesPerDay: number;
}

/**
 * The days in order. A town or a place belongs to the first day whose
 * stretch reaches it: inclusive at the stop, so the stop's own town (which
 * projects to the same km as the stop) sits under the day that ends there,
 * and a place beyond every stop sits under the last day. A stop added
 * behind an earlier one makes an empty stretch; the earlier day keeps what
 * the road passed first.
 */
export function tripDays(input: TripDaysInput): TripDay[] {
  const ends = [
    ...input.stops.map((s) => ({ name: s.name, km: s.alongKm })),
    { name: input.toName, km: input.roadLengthKm },
  ];
  const days: TripDay[] = ends.map((end, i) => {
    const start = i === 0 ? { name: input.fromName, km: 0 } : ends[i - 1];
    const raw = input.legMinutes[i] ?? null;
    // A leg the recompute has not answered is 0 (trip-state fills missing
    // legs with 0); a zero-minute day is a lie, so it is unknown, not "0 min".
    const minutes = raw !== null && Number.isFinite(raw) && raw > 0 ? raw : null;
    return {
      index: i,
      fromName: start.name,
      toName: end.name,
      minutes,
      overBudget: minutes !== null && minutes > input.budgetMinutesPerDay,
      startKm: start.km,
      endKm: end.km,
      towns: [],
      roadside: [],
    };
  });
  const last = days[days.length - 1];
  const dayFor = (km: number): TripDay => days.find((d) => km <= d.endKm) ?? last;
  for (const t of input.towns) dayFor(t.alongKm).towns.push(t);
  for (const s of input.roadside) dayFor(s.alongKm).roadside.push(s);
  return days;
}

export interface LatLngBoundsLiteral {
  northeast: LatLng;
  southwest: LatLng;
}

/**
 * The box around a day's stretch of road: every point of the direct route
 * between the day's ends, plus the ends themselves (a stop off the road is
 * in the frame). Null only when there is nothing to frame.
 */
export function dayBounds(road: Road, day: Pick<TripDay, "startKm" | "endKm">, ends: readonly LatLng[]): LatLngBoundsLiteral | null {
  const lo = Math.min(day.startKm, day.endKm);
  const hi = Math.max(day.startKm, day.endKm);
  const pts: LatLng[] = [...ends];
  for (let i = 0; i < road.points.length; i++) {
    const km = road.cumKm[i];
    if (km >= lo && km <= hi) pts.push(road.points[i]);
  }
  return boundsOf(pts);
}

/** The smallest box holding every point, or null for none. */
export function boundsOf(pts: readonly LatLng[]): LatLngBoundsLiteral | null {
  if (pts.length === 0) return null;
  let n = -Infinity, s = Infinity, e = -Infinity, w = Infinity;
  for (const p of pts) {
    if (p.lat > n) n = p.lat;
    if (p.lat < s) s = p.lat;
    if (p.lng > e) e = p.lng;
    if (p.lng < w) w = p.lng;
  }
  return { northeast: { lat: n, lng: e }, southwest: { lat: s, lng: w } };
}
