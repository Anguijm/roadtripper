import { isCityId } from "@/lib/urban-explorer/cityAtlas";
import type { TripLeg } from "./trip-state";

/**
 * Overnights and visits (Gauntlet U10).
 *
 * Until U10 every stop ended a day. That was right when every stop was a
 * town, but a roadside place can be a stop since U7, and the sheet then
 * said "Day 1 · Amarillo to The Big Texan Steak Ranch · 9 min" and booked
 * a night at the steakhouse. The operator ruled on 2026-10-06 that a
 * roadside place is a visit: the route still runs through it, the day does
 * not end there.
 *
 * A town is an overnight and a roadside place is a visit, told apart by
 * `isCityId`, the one test the app already uses to decide what is a city.
 *
 * The rest of the trip's arithmetic — the days in `days.ts`, the deadline
 * in `trip-state.ts` — was written for a world where every stop is an
 * overnight, and it is right for that world. Rather than teach both about
 * visits, the visits are folded out before either sees the stops: a visit's
 * leg is added to the leg after it, so each stretch runs from one overnight
 * to the next, through whatever was visited on the way. The two folds below
 * are the same rule twice, once for the days and once for the deadline, so
 * the day numbers on the sheet and the deadline cannot disagree — the
 * invariant `days.ts` exists to keep.
 */

/** Whether a stop ends a day. A town does; a roadside place is visited on the way. */
export function isOvernightStop(stopId: string): boolean {
  return isCityId(stopId);
}

const add = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

/**
 * The legs between overnights, from the legs between every stop.
 *
 * `legMinutes[i]` is the drive that ends at stop `i`, and the entry after
 * the last stop is the drive to the end; shorter than that is read as
 * unknown past its end, as `tripDays` reads it. The result has one entry
 * per overnight and one for the drive to the end. A stretch with any
 * unknown leg in it is unknown: a day whose time is half known has no time.
 */
export function foldVisitMinutes(
  legMinutes: ReadonlyArray<number | null>,
  stopIds: readonly string[]
): (number | null)[] {
  const out: (number | null)[] = [];
  let acc: number | null = 0;
  stopIds.forEach((id, i) => {
    acc = add(acc, legMinutes[i] ?? null);
    if (isOvernightStop(id)) {
      out.push(acc);
      acc = 0;
    }
  });
  out.push(add(acc, legMinutes[stopIds.length] ?? null));
  return out;
}

/**
 * The same fold for the deadline, which counts days from `TripLeg`s.
 *
 * `legsQuantizedDays` rounds each leg up to whole days, so a nine-minute
 * leg to a steakhouse cost a full day on its own. Folded, the visit's
 * minutes ride in the stretch they lie on. Visits after the last overnight
 * belong to the drive to the end, so their minutes go onto
 * `directMinutesToDestination` rather than vanishing.
 */
export function foldVisitLegs(
  legs: readonly TripLeg[],
  directMinutesToDestination: number
): { legs: TripLeg[]; directMinutesToDestination: number } {
  const out: TripLeg[] = [];
  let from = "__origin__";
  let seconds = 0;
  let meters = 0;
  for (const leg of legs) {
    seconds += leg.durationSeconds;
    meters += leg.distanceMeters;
    if (isOvernightStop(leg.destinationCityId)) {
      out.push({ originCityId: from, destinationCityId: leg.destinationCityId, durationSeconds: seconds, distanceMeters: meters });
      from = leg.destinationCityId;
      seconds = 0;
      meters = 0;
    }
  }
  return { legs: out, directMinutesToDestination: directMinutesToDestination + seconds / 60 };
}

/**
 * The two stops a stretch runs between, given every stop in the trip.
 *
 * A day's `legIndex` counts stretches between overnights, so it indexes the
 * overnight stops, not the trip's stops; with a roadside visit in the trip
 * the two lists disagree, and indexing the wrong one frames the wrong road
 * when a day is tapped. The first cut of U10 filtered at the call sites,
 * and putting the old indexing back left every test green — nothing could
 * see which road a tapped day framed. So the filtering lives here, where
 * it is tested, and the callers hand over every stop.
 *
 * `from` is null for the first stretch, which starts at the trip's start;
 * `to` is null for the last, which ends at its end.
 */
export function stretchEnds<S extends { cityId: string }>(
  legIndex: number,
  stops: readonly S[]
): { from: S | null; to: S | null } {
  const overnights = stops.filter((s) => isOvernightStop(s.cityId));
  return {
    from: legIndex === 0 ? null : (overnights[legIndex - 1] ?? null),
    to: legIndex < overnights.length ? overnights[legIndex] : null,
  };
}
