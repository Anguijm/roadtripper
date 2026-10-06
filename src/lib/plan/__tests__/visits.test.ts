import { describe, it, expect } from "vitest";
import { foldVisitLegs, foldVisitMinutes, isOvernightStop, stretchEnds } from "../visits";
import { computeDeadlinePressure, legsQuantizedDays, type TripLeg } from "../trip-state";

/**
 * Overnights and visits (Gauntlet U10). A town ends a day; a roadside place
 * is visited on the way and does not.
 */

const TOWN = "lubbock";
const TOWN2 = "abilene";
const VISIT = "osm:way:1059981743";
const VISIT2 = "osm:node:42";

const leg = (from: string, to: string, minutes: number): TripLeg => ({
  originCityId: from,
  destinationCityId: to,
  durationSeconds: minutes * 60,
  distanceMeters: minutes * 1000,
});

describe("what ends a day", () => {
  it("is a town, not a roadside place", () => {
    expect(isOvernightStop(TOWN)).toBe(true);
    expect(isOvernightStop(VISIT)).toBe(false);
  });
});

describe("the legs between overnights", () => {
  it("leaves a trip of towns exactly as it was", () => {
    // The fold must be a no-op for the world the arithmetic was written for.
    expect(foldVisitMinutes([100, 200, 300], [TOWN, TOWN2])).toEqual([100, 200, 300]);
  });

  it("adds a visit's leg to the stretch it lies on", () => {
    // Amarillo -> Big Texan (9) -> Lubbock (110) -> Austin (300): one
    // stretch of 119 to Lubbock, not a 9-minute day and then another.
    expect(foldVisitMinutes([9, 110, 300], [VISIT, TOWN])).toEqual([119, 300]);
  });

  it("puts a visit after the last town into the drive to the end", () => {
    expect(foldVisitMinutes([110, 20, 280], [TOWN, VISIT])).toEqual([110, 300]);
  });

  it("folds a trip of only visits into one stretch, start to end", () => {
    expect(foldVisitMinutes([9, 30, 400], [VISIT, VISIT2])).toEqual([439]);
  });

  it("calls a stretch unknown when any leg in it is unknown", () => {
    expect(foldVisitMinutes([9, null, 300], [VISIT, TOWN])).toEqual([null, 300]);
    // and reads a short array as unknown past its end, as tripDays does
    expect(foldVisitMinutes([9], [VISIT, TOWN])).toEqual([null, null]);
  });
});

describe("the deadline's legs", () => {
  it("stops a nine-minute visit costing a whole day", () => {
    // The fault U10 exists for. legsQuantizedDays rounds each leg up to
    // whole days, so on a 4 h budget the visit was a day by itself.
    const legs = [leg("__origin__", VISIT, 9), leg(VISIT, TOWN, 110)];
    expect(legsQuantizedDays(legs, 240)).toBe(2);
    const folded = foldVisitLegs(legs, 300);
    expect(legsQuantizedDays(folded.legs, 240)).toBe(1);
  });

  it("joins the visited legs into one, from the last town to the next", () => {
    const folded = foldVisitLegs([leg("__origin__", TOWN, 100), leg(TOWN, VISIT, 10), leg(VISIT, TOWN2, 90)], 200);
    expect(folded.legs).toEqual([leg("__origin__", TOWN, 100), leg(TOWN, TOWN2, 100)]);
    expect(folded.directMinutesToDestination).toBe(200);
  });

  it("carries a trailing visit's minutes into the drive to the end, rather than losing them", () => {
    const folded = foldVisitLegs([leg("__origin__", TOWN, 100), leg(TOWN, VISIT, 20)], 280);
    expect(folded.legs).toEqual([leg("__origin__", TOWN, 100)]);
    expect(folded.directMinutesToDestination).toBe(300);
  });

  it("keeps the total drive the same, whatever it folds", () => {
    const legs = [leg("__origin__", VISIT, 9), leg(VISIT, TOWN, 110), leg(TOWN, VISIT2, 30)];
    const folded = foldVisitLegs(legs, 200);
    const total = (ls: TripLeg[], d: number) => ls.reduce((n, l) => n + l.durationSeconds / 60, 0) + d;
    expect(total(folded.legs, folded.directMinutesToDestination)).toBe(total(legs, 200));
  });

  it("agrees with the days' fold about how many stretches there are", () => {
    // The invariant days.ts keeps: the sheet's days and the deadline count
    // the same stretches.
    const ids = [VISIT, TOWN, VISIT2, TOWN2];
    const minutes = [9, 110, 30, 90, 200];
    const legs = ids.map((to, i) => leg(i === 0 ? "__origin__" : ids[i - 1], to, minutes[i]));
    const folded = foldVisitLegs(legs, minutes[4]);
    const days = foldVisitMinutes(minutes, ids);
    expect(folded.legs.map((l) => l.durationSeconds / 60)).toEqual(days.slice(0, -1));
    expect(folded.directMinutesToDestination).toBe(days.at(-1));
  });
});


describe("the deadline, through the function the sheet calls", () => {
  it("does not charge a day for a visit, without the caller having to fold", () => {
    // computeDeadlinePressure folds visits itself. The first cut of U10
    // folded at the sheet's call site instead, and reverting that left
    // every test green, because nothing tested the deadline with a visit.
    const legs = [leg("__origin__", VISIT, 9), leg(VISIT, TOWN, 110)];
    const p = computeDeadlinePressure(legs, 3, 4, 300)!;
    // One day used (the stretch to Lubbock), not two; 300 min to go is two
    // more days at 4 h, so a three-day trip is exactly on time.
    expect(p.daysRemaining).toBe(2);
    expect(p.daysLate).toBe(0);
  });

  it("counts a trailing visit in the last day's drive, not as a day of its own", () => {
    // Lubbock (100) is day 1; the 60-minute visit and the 170 to the end
    // are 230 minutes, which fits day 2 on a 4 h budget, so a two-day trip
    // is on time. Unfolded, the visit's leg rounds up to a day by itself
    // and the same trip reads a day late. The first version of this test
    // used numbers that came out the same either way, and so guarded
    // nothing; these do not.
    const legs = [leg("__origin__", TOWN, 100), leg(TOWN, VISIT, 60)];
    expect(computeDeadlinePressure(legs, 2, 4, 170)!.daysLate).toBe(0);
  });
});

describe("the two stops a stretch runs between", () => {
  const visit = { cityId: VISIT, cityName: "The Big Texan" };
  const town = { cityId: TOWN, cityName: "Lubbock" };
  const town2 = { cityId: TOWN2, cityName: "Abilene" };

  it("counts overnights, not stops, so a visit does not shift the stretches", () => {
    // Trip: Big Texan (visit), Lubbock, Abilene. Stretches: start->Lubbock,
    // Lubbock->Abilene, Abilene->end. Indexing every stop instead would
    // make stretch 1 run from the steakhouse to Lubbock.
    const stops = [visit, town, town2];
    expect(stretchEnds(0, stops)).toEqual({ from: null, to: town });
    expect(stretchEnds(1, stops)).toEqual({ from: town, to: town2 });
    expect(stretchEnds(2, stops)).toEqual({ from: town2, to: null });
  });

  it("is start to end when the trip has only visits", () => {
    expect(stretchEnds(0, [visit])).toEqual({ from: null, to: null });
  });
});
