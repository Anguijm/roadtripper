/**
 * The trip told as days (Gauntlet U3; quality bar, rule 5). Pure and
 * client-safe: the legs and the route the app already has, nothing fetched.
 *
 * A stretch is the road between overnights the person chose: the start to
 * the first stop, each stop to the next, the last stop to the end. No stops
 * is one stretch, the whole road. A stretch within the daily budget is one
 * day. A stretch longer than the budget is cut into ceil(minutes / budget)
 * days, the count the deadline math gives a leg (`legsQuantizedDays` in
 * trip-state.ts: a 6 h leg on a 4 h budget costs two days), so the day
 * numbers on the sheet and the deadline can never disagree; that arithmetic
 * is untouched. Each cut falls where that day's budget runs out, placed
 * along the road in proportion to time (the stretch's average pace: no
 * routing call), and the day's end is named by the nearest town on the
 * road ("near Snyder") or, with none near, by the trip's own mile count
 * ("mile 176"). Round 4 kept such a stretch as one section labelled "Days
 * 1 and 2 · Amarillo to Austin", and the critic's verdict was that the
 * reader was told the trip was three days but never where day 1 ended.
 *
 * Every town and every roadside place is placed by its position along the
 * direct route: the road the page was planned on, and the one the roadside
 * stops were measured along (roadsideAlong in src/lib/roadside/along.ts).
 * A stop's own position is where the road passes nearest it, so a town
 * hours off the road still belongs to the day you leave the road from.
 */

import { haversineKm, type LatLng } from "@/lib/routing/polyline";
import type { RoadsideMarker } from "@/lib/roadside/along";
import { ON_ROAD_KM } from "@/lib/roadside/anchor";

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
 * Where the road passes nearest to `p`: how far along the road that is, in
 * km, and how far off the road `p` sits. The nearest vertex, as
 * roadsideAlong takes it, so a stop and a place measure the same way; a
 * route's vertices are a few hundred metres apart. Cost: one haversine per
 * vertex, a few thousand, per point placed. A road with no direction
 * places everything at 0 and measures nothing off it.
 */
export function nearestOnRoad(road: Road, p: LatLng): { alongKm: number; offRoadKm: number } {
  let best = 0;
  let bestKm = Infinity;
  for (let i = 0; i < road.points.length; i++) {
    const d = haversineKm(road.points[i], p);
    if (d < bestKm) {
      bestKm = d;
      best = i;
    }
  }
  return { alongKm: road.cumKm[best] ?? 0, offRoadKm: Number.isFinite(bestKm) ? bestKm : 0 };
}

/** How far along the road it passes nearest to `p`, in km. */
export function alongRoadKm(road: Road, p: LatLng): number {
  return nearestOnRoad(road, p).alongKm;
}

/**
 * The point `km` along the road, between the two vertices it falls between;
 * the last vertex past the end, the first before the start. Null for a road
 * with no direction. A day's frame includes its cut end this way, so a day
 * too short to hold a vertex still has a frame.
 */
export function pointAlong(road: Road, km: number): LatLng | null {
  if (road.points.length < 2) return null;
  if (km <= 0) return road.points[0];
  if (km >= road.lengthKm) return road.points[road.points.length - 1];
  let i = 1;
  while (i < road.cumKm.length && road.cumKm[i] < km) i++;
  const a = road.points[i - 1];
  const b = road.points[i];
  const span = road.cumKm[i] - road.cumKm[i - 1];
  const t = span > 0 ? (km - road.cumKm[i - 1]) / span : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
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
  /**
   * How far the town sits off the road, in km. A town within ON_ROAD_KM
   * can name where a day ends ("near Snyder"); one hours off the road
   * cannot. Left out, the town is taken as on the road.
   */
  offRoadKm?: number;
}

/**
 * What a day ends at: a stop the person chose, a cut where the budget
 * runs out named by a town near it or by the mile, or the trip's end.
 */
export type DayEndKind = "stop" | "near" | "mile" | "end";

export interface TripDay {
  /** 0-based position among the days: the section's key; the heading's number is index + 1. */
  index: number;
  /** Which stretch between overnights the day is part of: 0 from the start, i after stop i - 1. */
  legIndex: number;
  fromName: string;
  /** A town, "near Snyder" or "mile 176" for a cut, the trip's end for the last day. */
  toName: string;
  /** The stop the day ends at, or null: a cut, or the destination. */
  endStopId: string | null;
  endKind: DayEndKind;
  /** The drive, in minutes. Null while this stretch's route is not known yet (a recompute in flight or failed). */
  minutes: number | null;
  /** The day along the direct route, in km. */
  startKm: number;
  endKm: number;
  /**
   * The day's share of its stretch, 0 to 1 by time: a whole stretch is 0
   * to 1; the first of two cut days on a 6 h stretch at 4 h a day is 0 to
   * 2/3. The map's day frame cuts the drawn road (the route through the
   * stops) at the same shares, since that road's km differ from the
   * direct route's.
   */
  legFractionStart: number;
  legFractionEnd: number;
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
 * The days a stretch takes at the budget: ceil(minutes / budget), the
 * deadline's own reading (`legsQuantizedDays`), and one while the drive is
 * unknown or the budget is not a positive number.
 */
export function daysSpannedBy(minutes: number | null, budgetMinutesPerDay: number): number {
  if (minutes === null || !(budgetMinutesPerDay > 0)) return 1;
  return Math.max(1, Math.ceil(minutes / budgetMinutesPerDay));
}

/**
 * How near a town on the road must be to where a day's budget runs out
 * for the day to end "near" it, in km. 30 is about twenty minutes at
 * highway pace: the most a person plans to drive on, or stop short, to
 * sleep in a town rather than at a mile marker. Farther than that the
 * day's end is the mile. Moves with it: `cutEndName` alone; nothing in
 * CSS. Check: the test "names where a cut day ends by the nearest town on
 * the road, or by the mile with none near" pins 30 and the line at 29
 * and 31 km, and on the page a trip over the budget reads "Day 1 ·
 * Amarillo to near Snyder · 4 h".
 */
export const NEAR_CUT_KM = 30;

/** A named point on the road, for naming a cut: a town that fits and sits on the road, a stop, the start, the end. */
interface NamedKm {
  name: string;
  alongKm: number;
}

/**
 * The trip's own mile count from the start, rounded as the roadside rows
 * round theirs ("131 miles along"), so the two never disagree.
 */
function mileAlong(km: number): number {
  return Math.round((km * 1000) / 1609.34);
}

/**
 * Where a cut day ends, as the heading says it: "near Snyder" for the
 * nearest named point on the road within NEAR_CUT_KM of the cut (a tie
 * goes to the earlier one), else "mile 176".
 */
export function cutEndName(cutKm: number, named: readonly NamedKm[], nearKm = NEAR_CUT_KM): { toName: string; endKind: "near" | "mile" } {
  let best: NamedKm | null = null;
  let bestKm = Infinity;
  for (const n of named) {
    const d = Math.abs(n.alongKm - cutKm);
    if (d < bestKm) {
      bestKm = d;
      best = n;
    }
  }
  if (best && bestKm <= nearKm) return { toName: `near ${best.name}`, endKind: "near" };
  return { toName: `mile ${mileAlong(cutKm)}`, endKind: "mile" };
}

/**
 * The days in order. A stretch within the budget is one day; a longer one
 * is cut into the days it takes, each cut where its budget runs out along
 * the road in proportion to time. A town or a place belongs to the first
 * day whose stretch reaches it: inclusive at the end, so the stop's own
 * town (which projects to the same km as the stop) sits under the day that
 * ends there, and a place beyond every stop sits under the last day. A
 * stop added behind an earlier one makes an empty stretch; the earlier day
 * keeps what the road passed first.
 */
export function tripDays(input: TripDaysInput): TripDay[] {
  const ends = [
    ...input.stops.map((s) => ({ name: s.name, km: s.alongKm, stopId: s.id as string | null })),
    { name: input.toName, km: input.roadLengthKm, stopId: null as string | null },
  ];
  // What can name a cut: the start, the stops, the end, and the towns
  // that fit which sit on the road (a town hours off it is not "near").
  const named: NamedKm[] = [
    { name: input.fromName, alongKm: 0 },
    ...input.stops.map((s) => ({ name: s.name, alongKm: s.alongKm })),
    { name: input.toName, alongKm: input.roadLengthKm },
    ...input.towns.filter((t) => t.offRoadKm === undefined || t.offRoadKm <= ON_ROAD_KM).map((t) => ({ name: t.name, alongKm: t.alongKm })),
  ];
  const budget = input.budgetMinutesPerDay;
  const days: TripDay[] = [];
  ends.forEach((end, leg) => {
    const start = leg === 0 ? { name: input.fromName, km: 0 } : ends[leg - 1];
    const raw = input.legMinutes[leg] ?? null;
    // A leg the recompute has not answered is 0 (trip-state fills missing
    // legs with 0); a zero-minute day is a lie, so it is unknown, not "0 min".
    const minutes = raw !== null && Number.isFinite(raw) && raw > 0 ? raw : null;
    const count = daysSpannedBy(minutes, budget);
    for (let k = 0; k < count; k++) {
      const last = k === count - 1;
      // With count > 1 the drive is known and the budget positive; the
      // shares are by time, so each cut day drives the whole budget and
      // the last day what is left.
      const fStart = k === 0 ? 0 : (k * budget) / (minutes as number);
      const fEnd = last ? 1 : ((k + 1) * budget) / (minutes as number);
      const startKm = start.km + (end.km - start.km) * fStart;
      const endKm = start.km + (end.km - start.km) * fEnd;
      const dayMinutes = minutes === null ? null : last ? minutes - k * budget : budget;
      const cut = last ? null : cutEndName(endKm, named);
      days.push({
        index: days.length,
        legIndex: leg,
        fromName: k === 0 ? start.name : days[days.length - 1].toName,
        toName: cut ? cut.toName : end.name,
        endStopId: last ? end.stopId : null,
        endKind: cut ? cut.endKind : end.stopId !== null ? "stop" : "end",
        minutes: dayMinutes,
        startKm,
        endKm,
        legFractionStart: fStart,
        legFractionEnd: fEnd,
        towns: [],
        roadside: [],
      });
    }
  });
  const lastDay = days[days.length - 1];
  const dayFor = (km: number): TripDay => days.find((d) => km <= d.endKm) ?? lastDay;
  for (const t of input.towns) dayFor(t.alongKm).towns.push(t);
  for (const s of input.roadside) dayFor(s.alongKm).roadside.push(s);
  return days;
}

/**
 * A place's name as a key for spotting the same place twice: accents
 * folded, lower case, a leading "the" dropped, "&" read as "and", every
 * letter and digit kept and everything else folded to one space. "The Buddy Holly Center" and
 * "Buddy Holly Center" are one; "Kimbell Art Museum" and "Kimbell Museum"
 * are two (round 4: a day listed the same place three times under two
 * spellings and once under its town).
 */
export function placeNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/**
 * The places with no name listed twice: the first of a name is kept (so
 * strongest first in keeps the strongest), and a name in `alreadyNamed`
 * (the places already listed under the day's towns) is left out.
 */
export function uniqueByName<T extends { name: string }>(places: readonly T[], alreadyNamed: Iterable<string> = []): T[] {
  const seen = new Set<string>();
  for (const n of alreadyNamed) seen.add(placeNameKey(n));
  const out: T[] = [];
  for (const p of places) {
    const key = placeNameKey(p.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
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
