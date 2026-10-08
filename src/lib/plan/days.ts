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
 * road ("near Snyder") or, with none near, said in hours ("4 h down the
 * road from Amarillo"; round 6: round 5's "mile 176" was a number a person
 * in a car would not say). Round 4 kept such a stretch as one section
 * labelled "Days 1 and 2 · Amarillo to Austin", and the critic's verdict
 * was that the reader was told the trip was three days but never where
 * day 1 ended.
 *
 * Every roadside place is placed by its position along the direct route:
 * the road the page was planned on, and the one the roadside stops were
 * measured along (roadsideAlong in src/lib/roadside/along.ts). The towns
 * that fit are not: they are, by the app's own rule, the towns within a
 * day's drive of the last stop that make progress toward the end
 * (findCitiesInRadius, makesProgress), the choices for where the next day
 * ends, so every one of them is listed under the first day after the last
 * stop whatever its position along the road, and the sheet's title takes
 * its day from that same day (round 6: round 5 placed Fort Worth, four
 * hours from Lubbock by road but 340 km east of the direct road, past day
 * 2's cut under Day 3, while the title said it fit in day 2).
 */

import { haversineKm, type LatLng } from "@/lib/routing/polyline";
import type { RoadsideMarker } from "@/lib/roadside/along";
import { ON_ROAD_KM } from "@/lib/roadside/anchor";
import { formatDurationPlain } from "@/lib/routing/format";

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
 * runs out named by a town near it ("near"), by how far past the last
 * town it falls ("past", U28: "50 min past Elko"), or said in hours with
 * neither ("hours"), or the trip's end.
 */
export type DayEndKind = "stop" | "near" | "past" | "hours" | "end";

export interface TripDay {
  /** 0-based position among the days: the section's key; the heading's number is index + 1. */
  index: number;
  /** Which stretch between overnights the day is part of: 0 from the start, i after stop i - 1. */
  legIndex: number;
  /** What the day starts from: the trip's start, or the previous day's end (its `endKind`). */
  fromKind: "start" | DayEndKind;
  fromName: string;
  /** A town, "near Snyder" for a cut with a town near it, ON_THE_ROAD for a cut with none, the trip's end for the last day. */
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
  /**
   * True on the one day the towns that fit are listed under: the first
   * day after the last stop, day 1 with no stops. The sheet's title
   * ("Fort Worth fits in day 2") reads its day number from this day, so
   * the title and the sections cannot disagree (round 6).
   */
  holdsTowns: boolean;
  /** The towns that fit, all of them on the day that `holdsTowns`; empty on every other day. */
  towns: DayTown[];
  /** The places worth pulling over for on this day's stretch of road, by their position along it. */
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
  /**
   * The towns that fit from the last stop (the start with no stops): the
   * choices for where the next day ends. Listed under that day, all of
   * them; a town on the road also names a cut near it.
   */
  towns: readonly DayTown[];
  /**
   * Towns from the plain list (Gauntlet U19) that can name a cut when no
   * atlas name is near it: where the road passes each and how far off it
   * sits. Optional; without them a cut is named by the atlas alone.
   */
  places?: readonly DayTown[];
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
 * sleep in a town rather than wherever the hours run out. Farther than
 * that the day's end is said in hours. Moves with it: `cutEndName` alone;
 * nothing in CSS. Check: the test "names where a cut day ends by the
 * nearest town on the road, or in hours with none near" pins 30 and the
 * line at 29 and 31 km, and on the page a trip over the budget reads
 * "Day 1 · Amarillo to near Snyder · 4 h".
 *
 * To change it: first the test "names where a cut day ends by the
 * nearest town on the road, or in hours with none near" in
 * src/lib/plan/__tests__/days.test.ts, which pins 30 and probes the
 * line at 29 and 31 km from Snyder; a new value needs those two probes
 * moved to either side of it, and the pin changed with it. Then the
 * page's fixtures, whose headings come from `tripDays` over that file's
 * towns and so move with this value:
 * src/components/__tests__/PlanWorkspace.days.ssr.test.tsx expects
 * "Two days, with a night near Snyder", "Day 2 · near Snyder to Austin ·
 * 3 h 50 min" and "Day 3 · near Llano to Austin · 30 min" where a town
 * sits within 30 km of a cut, and "Day 2 · 4 h down the road from
 * Lubbock" where none does. Raising it far enough turns an "hours"
 * heading into "near X" and the shape line's "a night on the road" into
 * a town; lowering it under 29 turns "near Snyder" into hours. Run that
 * file after a change and read which flipped rather than expecting a
 * particular one. src/components/__tests__/glossary.ssr.test.tsx builds
 * its `dayHeadingLine` cases from a TripDay by hand, so it does not move.
 * Nothing in CSS, the store or the routing reads it: `cutEndName` is its
 * one reader, and its `nearKm` parameter is how a test tries another
 * value without changing this one. Which town may name a cut at all (on
 * the road, not hours off it) is ON_ROAD_KM, a separate threshold.
 */
export const NEAR_CUT_KM = 30;

/**
 * Where a night is when the day's budget runs out with no town on the
 * road near: the phrase the shape line says ("Two days, with a night on
 * the road"). The heading says the hours instead ("Day 1 · 4 h down the
 * road from Amarillo"; `dayHeadingLine` in words.ts), so this is never a
 * day's start or end on the page. Round 5 said "mile 176", a number a
 * person in a car would not say (round 6's critic, rule 1). On the
 * Amarillo to Austin trip this is what every cut gets: the atlas has
 * eight towns in the corridor, none within 30 km of where four hours run
 * out.
 */
export const ON_THE_ROAD = "on the road";

/** A named point on the road, for naming a cut: a town that fits and sits on the road, a stop, the start, the end. */
interface NamedKm {
  name: string;
  alongKm: number;
}

/**
 * Where a cut day ends: "near Snyder" for the nearest named point on the
 * road within NEAR_CUT_KM of the cut (a tie goes to the earlier one), else
 * ON_THE_ROAD, which the heading says in hours.
 */
export function cutEndName(cutKm: number, named: readonly NamedKm[], nearKm = NEAR_CUT_KM): { toName: string; endKind: "near" | "hours" } {
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
  return { toName: ON_THE_ROAD, endKind: "hours" };
}

/**
 * How far back, in km, the last town passed may be for a cut to be named
 * by it (Gauntlet U28): about an hour at highway speed. "50 min past
 * Elko" says where a night falls; "3 h past Reno" says nothing the
 * heading's own hours do not.
 */
export const PAST_CUT_KM = 100;
/** And at most this many minutes back at the day's pace: past an hour, "1 h 30 min past Brady" names a town the day left long ago. */
export const PAST_CUT_MINUTES = 60;

/**
 * A cut no town is near, named by the last named point the road passed
 * before it, in the time it takes to get there at the day's own pace:
 * "50 min past Elko" (U28: "a night … and one on the road" did not say
 * where, U26's critic). Rounded to 5 minutes, as a person says it. Null
 * when nothing was passed within PAST_CUT_KM, or the pace is unknown.
 */
export function pastCutName(cutKm: number, named: readonly NamedKm[], minutesPerKm: number | null, pastKm = PAST_CUT_KM): string | null {
  if (minutesPerKm === null || !(minutesPerKm > 0)) return null;
  let last: NamedKm | null = null;
  for (const n of named) if (n.alongKm < cutKm && cutKm - n.alongKm <= pastKm && (!last || n.alongKm > last.alongKm)) last = n;
  if (!last) return null;
  const minutes = Math.max(5, Math.round(((cutKm - last.alongKm) * minutesPerKm) / 5) * 5);
  if (minutes > PAST_CUT_MINUTES) return null;
  return `${formatDurationPlain(minutes * 60)} past ${last.name}`;
}

/**
 * The days in order. A stretch within the budget is one day; a longer one
 * is cut into the days it takes, each cut where its budget runs out along
 * the road in proportion to time. A place belongs to the first day whose
 * stretch reaches it: inclusive at the end, and a place beyond every stop
 * sits under the last day; a stop added behind an earlier one makes an
 * empty stretch, and the earlier day keeps what the road passed first.
 * The towns that fit all belong to the first day after the last stop
 * (`holdsTowns`): they are the choices for where that day ends, and the
 * sheet's title names that day from the same flag.
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
  const listNamed: NamedKm[] = (input.places ?? []).filter((t) => t.offRoadKm === undefined || t.offRoadKm <= ON_ROAD_KM).map((t) => ({ name: t.name, alongKm: t.alongKm }));
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
      // The atlas first: a town the sheet offers, or a stop or an end,
      // names the cut when one is near it; the list only when none is
      // (U19), so "near Lubbock" is never lost to a smaller town beside it.
      const atlasCut = last ? null : cutEndName(endKm, named);
      const nearCut = atlasCut && atlasCut.endKind === "hours" && listNamed.length > 0 ? cutEndName(endKm, listNamed) : atlasCut;
      // Nothing near: name it by the last town passed, if one is within
      // reach behind (U28), at this day's pace.
      const pace = dayMinutes !== null && endKm > startKm ? dayMinutes / (endKm - startKm) : null;
      const past = nearCut && nearCut.endKind === "hours" ? pastCutName(endKm, [...named, ...listNamed], pace) : null;
      const cut = past ? { toName: past, endKind: "past" as const } : nearCut;
      const prev = days[days.length - 1];
      days.push({
        index: days.length,
        legIndex: leg,
        fromKind: prev ? prev.endKind : "start",
        fromName: prev ? prev.toName : start.name,
        toName: cut ? cut.toName : end.name,
        endStopId: last ? end.stopId : null,
        endKind: cut ? cut.endKind : end.stopId !== null ? "stop" : "end",
        minutes: dayMinutes,
        startKm,
        endKm,
        legFractionStart: fStart,
        legFractionEnd: fEnd,
        holdsTowns: false,
        towns: [],
        roadside: [],
      });
    }
  });
  const lastDay = days[days.length - 1];
  // The towns that fit: the next day's, all of them (the first day of the
  // last stretch always exists; the fallback is belt and braces).
  const next = days.find((d) => d.legIndex === input.stops.length) ?? lastDay;
  next.holdsTowns = true;
  next.towns.push(...input.towns);
  // The places: by where the road passes them.
  const dayFor = (km: number): TripDay => days.find((d) => km <= d.endKm) ?? lastDay;
  for (const s of input.roadside) dayFor(s.alongKm).roadside.push(s);
  return days;
}

/** The day the towns that fit are listed under; the title's day. Always one; the first day if none is flagged. */
export function townsDay(days: readonly TripDay[]): TripDay {
  return days.find((d) => d.holdsTowns) ?? days[0];
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

/** A night the budget cuts, drawn on the map where it falls (Gauntlet U29). */
export interface NightMark {
  key: string;
  lat: number;
  lng: number;
  /** As the heading says it: "near Sweetwater", "45 min past Elizabethtown"; "Night 2" for one said in hours. */
  label: string;
}

/**
 * Where each cut night falls on the road, with its name, for the map
 * (U29: the headings named "near Sweetwater" and the map showed nothing
 * there). Only cut days: a stop's night has its numbered square, and the
 * last day ends at the trip's end. Placed on the direct road by distance,
 * the same frame the days are cut in. Pure.
 */
export function nightMarks(days: readonly TripDay[], road: Road): NightMark[] {
  const out: NightMark[] = [];
  for (const d of days) {
    if (d.endKind !== "near" && d.endKind !== "past" && d.endKind !== "hours") continue;
    const p = pointAlong(road, d.endKm);
    if (!p) continue;
    out.push({ key: `night-${d.index}`, lat: p.lat, lng: p.lng, label: d.endKind === "hours" ? `Night ${d.index + 1}` : d.toName });
  }
  return out;
}

/**
 * The town whose "Stop here" is the screen's one obvious action (Gauntlet
 * U31, rule 3): on the day that holds the towns, the one nearest where
 * that day's driving runs out, of those the list shows and none out of
 * the way. Null when the day ends at the destination, since there is no
 * night to choose, or no town qualifies. Pure.
 */
export function primaryTownId(day: Pick<TripDay, "holdsTowns" | "endKind" | "endKm" | "towns">, shown: ReadonlySet<string>, outOfTheWay: ReadonlySet<string>): string | null {
  if (!day.holdsTowns || day.endKind === "end" || day.endKind === "stop") return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const t of day.towns) {
    if (!shown.has(t.id) || outOfTheWay.has(t.id)) continue;
    const d = Math.abs(t.alongKm - day.endKm);
    if (d < bestKm) {
      bestKm = d;
      best = t.id;
    }
  }
  return best;
}
