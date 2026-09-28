import { describe, it, expect } from "vitest";
import { buildRoad, alongRoadKm, tripDays, daysSpannedBy, dayBounds, boundsOf, type DayTown } from "../days";
import type { RoadsideMarker } from "@/lib/roadside/along";

/**
 * The trip told as days (Gauntlet U3). A road due south from 35,-101 to
 * 30,-101, about 556 km, a point every 0.05 degrees; a degree of latitude
 * is 111.2 km, so a point's position along it is its distance from the
 * top. Amarillo is the start, Austin the end, and the stops, towns and
 * places sit at known latitudes so each one's day is known in advance.
 */
const road = buildRoad(Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i * 0.05, lng: -101 })));
const KM_PER_DEG = 111.19;

const place = (id: string, name: string, alongKm: number): RoadsideMarker => ({
  id, name, lat: 35 - alongKm / KM_PER_DEG, lng: -101, kind: "attraction", p: 0.6, about: null, url: null, alongKm,
});
const towns: DayTown[] = [
  { id: "plainview", name: "Plainview", alongKm: alongRoadKm(road, { lat: 34, lng: -101.02 }) },
  { id: "post", name: "Post", alongKm: alongRoadKm(road, { lat: 33, lng: -101 }) },
  { id: "brady", name: "Brady", alongKm: alongRoadKm(road, { lat: 31, lng: -101 }) },
];
const roadside = [place("a", "Cadillac Ranch", 10), place("b", "Prairie Dog Town", 250), place("c", "Windmill", 400)];

describe("the road", () => {
  it("measures the distance along it and places a point at its nearest vertex", () => {
    expect(road.lengthKm).toBeCloseTo(5 * KM_PER_DEG, 0);
    expect(road.cumKm[0]).toBe(0);
    expect(alongRoadKm(road, { lat: 35, lng: -101 })).toBe(0);
    expect(alongRoadKm(road, { lat: 33.5, lng: -101 })).toBeCloseTo(1.5 * KM_PER_DEG, 0);
    // A town 60 km off the road is placed where the road passes nearest it.
    expect(alongRoadKm(road, { lat: 33.5, lng: -101.6 })).toBeCloseTo(1.5 * KM_PER_DEG, 0);
    expect(alongRoadKm(road, { lat: 30, lng: -101 })).toBeCloseTo(road.lengthKm, 5);
    // A road with no direction has no length and places everything at 0.
    const none = buildRoad([{ lat: 35, lng: -101 }]);
    expect(none.lengthKm).toBe(0);
    expect(alongRoadKm(none, { lat: 33, lng: -101 })).toBe(0);
    expect(buildRoad([]).points).toEqual([]);
  });
});

describe("the trip as days", () => {
  it("cuts two legs that together exceed a day's budget into two days, and lands every town and roadside stop in its day by its position along the road", () => {
    // Amarillo to Lubbock (3 h 20 min) and Lubbock to Austin (4 h 30 min):
    // 7 h 50 min on a 4 h budget. Two days, not one, and the second is over.
    const lubbock = { id: "lubbock", name: "Lubbock", alongKm: alongRoadKm(road, { lat: 33.5, lng: -101 }) };
    const days = tripDays({
      fromName: "Amarillo",
      toName: "Austin",
      stops: [lubbock],
      legMinutes: [200, 270],
      roadLengthKm: road.lengthKm,
      towns: [...towns, lubbock],
      roadside,
      budgetMinutesPerDay: 240,
    });
    expect(days).toHaveLength(2);
    expect(days.map((d) => [d.fromName, d.toName])).toEqual([["Amarillo", "Lubbock"], ["Lubbock", "Austin"]]);
    expect(days.map((d) => d.minutes)).toEqual([200, 270]);
    expect(days.map((d) => d.overBudget)).toEqual([false, true]);
    expect(days[0].startKm).toBe(0);
    expect(days[0].endKm).toBeCloseTo(1.5 * KM_PER_DEG, 0);
    expect(days[1].startKm).toBe(days[0].endKm);
    expect(days[1].endKm).toBeCloseTo(road.lengthKm, 5);
    // Plainview (111 km) is before Lubbock (167 km): day 1. Lubbock itself,
    // the stop's own town, is under the day that ends there. Post (222 km)
    // and Brady (445 km) are after it: day 2.
    expect(days[0].towns.map((t) => t.name)).toEqual(["Plainview", "Lubbock"]);
    expect(days[1].towns.map((t) => t.name)).toEqual(["Post", "Brady"]);
    // The places the same: 10 km is day 1; 250 and 400 are day 2.
    expect(days[0].roadside.map((s) => s.name)).toEqual(["Cadillac Ranch"]);
    expect(days[1].roadside.map((s) => s.name)).toEqual(["Prairie Dog Town", "Windmill"]);
    expect(days.map((d) => d.index)).toEqual([0, 1]);
  });

  it("makes one day of the whole road with no stops, holding every town and place", () => {
    const days = tripDays({
      fromName: "Amarillo",
      toName: "Austin",
      stops: [],
      legMinutes: [483],
      roadLengthKm: road.lengthKm,
      towns,
      roadside,
      budgetMinutesPerDay: 240,
    });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ index: 0, fromName: "Amarillo", toName: "Austin", minutes: 483, overBudget: true, startKm: 0 });
    expect(days[0].endKm).toBeCloseTo(road.lengthKm, 5);
    expect(days[0].towns.map((t) => t.name)).toEqual(["Plainview", "Post", "Brady"]);
    expect(days[0].roadside.map((s) => s.name)).toEqual(["Cadillac Ranch", "Prairie Dog Town", "Windmill"]);
  });

  it("says a day is over the budget only when its drive is, and leaves a day's time unknown until its route is", () => {
    const lubbock = { id: "lubbock", name: "Lubbock", alongKm: 167 };
    const abilene = { id: "abilene", name: "Abilene", alongKm: 334 };
    const base = { fromName: "Amarillo", toName: "Austin", stops: [lubbock, abilene], roadLengthKm: road.lengthKm, towns: [], roadside: [], budgetMinutesPerDay: 240 };
    // Three days on a 4 h budget: 3 h 20 min, 4 h exactly, 4 h 1 min.
    expect(tripDays({ ...base, legMinutes: [200, 240, 241] }).map((d) => d.overBudget)).toEqual([false, false, true]);
    // A recompute in flight: the legs stop short of the stops, the rest is unknown, never "0 min".
    expect(tripDays({ ...base, legMinutes: [200] }).map((d) => d.minutes)).toEqual([200, null, null]);
    expect(tripDays({ ...base, legMinutes: [200, 0, null] }).map((d) => d.minutes)).toEqual([200, null, null]);
    expect(tripDays({ ...base, legMinutes: [200, NaN, 300] }).map((d) => [d.minutes, d.overBudget])).toEqual([[200, false], [null, false], [300, true]]);
  });

  it("counts the days a stretch takes by the budget, and numbers the next stretch from there", () => {
    // Round 4: "8 h of driving left over 2 days" stood over a lone "Day
    // 1". A stretch takes ceil(minutes / budget) days, the reading the
    // deadline math gives a leg (legsQuantizedDays), so the sheet's day
    // numbers and its deadline can never disagree.
    expect(daysSpannedBy(200, 240)).toBe(1);
    expect(daysSpannedBy(240, 240)).toBe(1);
    expect(daysSpannedBy(241, 240)).toBe(2);
    expect(daysSpannedBy(470, 240)).toBe(2);
    expect(daysSpannedBy(721, 240)).toBe(4);
    // Unknown, or a budget that is not a positive number: one, never NaN.
    expect(daysSpannedBy(null, 240)).toBe(1);
    expect(daysSpannedBy(300, 0)).toBe(1);
    expect(daysSpannedBy(300, NaN)).toBe(1);
    const lubbock = { id: "lubbock", name: "Lubbock", alongKm: 167 };
    const abilene = { id: "abilene", name: "Abilene", alongKm: 334 };
    const base = { fromName: "Amarillo", toName: "Austin", roadLengthKm: road.lengthKm, towns: [], roadside: [], budgetMinutesPerDay: 240 };
    // Amarillo to Lubbock in 3 h 20 min is day 1; Lubbock to Austin in
    // 4 h 30 min is days 2 and 3.
    const two = tripDays({ ...base, stops: [lubbock], legMinutes: [200, 270] });
    expect(two.map((d) => [d.firstDay, d.daysSpanned])).toEqual([[1, 1], [2, 2]]);
    // 3 h 20 min, 4 h exactly, 4 h 1 min: days 1, 2, and 3 and 4.
    const three = tripDays({ ...base, stops: [lubbock, abilene], legMinutes: [200, 240, 241] });
    expect(three.map((d) => [d.firstDay, d.daysSpanned])).toEqual([[1, 1], [2, 1], [3, 2]]);
    // No stop, 7 h 50 min: one stretch, days 1 and 2.
    expect(tripDays({ ...base, stops: [], legMinutes: [470] }).map((d) => [d.firstDay, d.daysSpanned])).toEqual([[1, 2]]);
    // A leg not yet known counts one until it is.
    expect(tripDays({ ...base, stops: [lubbock], legMinutes: [] }).map((d) => [d.firstDay, d.daysSpanned])).toEqual([[1, 1], [2, 1]]);
    expect(tripDays({ ...base, stops: [lubbock], legMinutes: [500, null] }).map((d) => [d.firstDay, d.daysSpanned])).toEqual([[1, 3], [4, 1]]);
  });

  it("keeps a place beyond every stop in the last day, and a stop added behind an earlier one leaves the earlier day what the road passed first", () => {
    // Abilene was added first, then Lubbock, which the road reaches earlier:
    // day 2's stretch runs backwards and is empty; Post (222 km) is in day 1,
    // whose stretch reaches it first, and Brady (445 km) in the last day.
    const abilene = { id: "abilene", name: "Abilene", alongKm: 334 };
    const lubbock = { id: "lubbock", name: "Lubbock", alongKm: 167 };
    const days = tripDays({
      fromName: "Amarillo", toName: "Austin", stops: [abilene, lubbock], legMinutes: [300, 150, 250],
      roadLengthKm: road.lengthKm, towns, roadside: [...roadside, place("z", "Past the end", road.lengthKm + 2)], budgetMinutesPerDay: 240,
    });
    expect(days.map((d) => d.towns.map((t) => t.name))).toEqual([["Plainview", "Post"], [], ["Brady"]]);
    expect(days[2].roadside.map((s) => s.name)).toEqual(["Windmill", "Past the end"]);
  });
});

describe("a day's frame on the map", () => {
  it("boxes the road between the day's ends and the ends themselves, a stop off the road included", () => {
    const lubbockOffRoad = { lat: 33.5, lng: -101.6 };
    const day = { startKm: 0, endKm: alongRoadKm(road, lubbockOffRoad) };
    const b = dayBounds(road, day, [{ lat: 35, lng: -101 }, lubbockOffRoad]);
    expect(b).not.toBeNull();
    expect(b!.northeast.lat).toBeCloseTo(35, 5);
    expect(b!.southwest.lat).toBeCloseTo(33.5, 5);
    expect(b!.northeast.lng).toBeCloseTo(-101, 5);
    // The stop's own longitude, 60 km west of the road, is in the frame.
    expect(b!.southwest.lng).toBeCloseTo(-101.6, 5);
    // The next day's frame does not reach back over the first's road.
    const day2 = dayBounds(road, { startKm: day.endKm, endKm: road.lengthKm }, [lubbockOffRoad, { lat: 30, lng: -101 }]);
    expect(day2!.northeast.lat).toBeCloseTo(33.5, 5);
    expect(day2!.southwest.lat).toBeCloseTo(30, 5);
    // A backwards stretch is read either way round; nothing at all is null.
    expect(dayBounds(road, { startKm: 300, endKm: 100 }, [])!.northeast.lat).toBeCloseTo(35 - 100 / KM_PER_DEG, 1);
    expect(dayBounds(buildRoad([]), { startKm: 0, endKm: 0 }, [])).toBeNull();
    expect(boundsOf([])).toBeNull();
  });
});
