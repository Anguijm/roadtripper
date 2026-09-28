import { describe, it, expect } from "vitest";
import {
  buildRoad,
  alongRoadKm,
  nearestOnRoad,
  pointAlong,
  tripDays,
  daysSpannedBy,
  cutEndName,
  NEAR_CUT_KM,
  placeNameKey,
  uniqueByName,
  dayBounds,
  boundsOf,
  type DayTown,
} from "../days";
import { legsQuantizedDays } from "../trip-state";
import { ON_ROAD_KM } from "@/lib/roadside/anchor";
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
const town = (id: string, name: string, lat: number, lng = -101): DayTown => ({ id, name, ...nearestOnRoad(road, { lat, lng }) });
const towns: DayTown[] = [
  town("plainview", "Plainview", 34, -101.02),
  town("post", "Post", 33),
  town("snyder", "Snyder", 32.5),
  town("brady", "Brady", 31),
];
const roadside = [place("a", "Cadillac Ranch", 10), place("b", "Prairie Dog Town", 250), place("c", "Windmill", 400)];
const lubbock = { id: "lubbock", name: "Lubbock", alongKm: alongRoadKm(road, { lat: 33.5, lng: -101 }) };
const base = { fromName: "Amarillo", toName: "Austin", roadLengthKm: road.lengthKm, towns, roadside, budgetMinutesPerDay: 240 };

describe("the road", () => {
  it("measures the distance along it and places a point at its nearest vertex, with how far off the road it sits", () => {
    expect(road.lengthKm).toBeCloseTo(5 * KM_PER_DEG, 0);
    expect(road.cumKm[0]).toBe(0);
    expect(alongRoadKm(road, { lat: 35, lng: -101 })).toBe(0);
    expect(alongRoadKm(road, { lat: 33.5, lng: -101 })).toBeCloseTo(1.5 * KM_PER_DEG, 0);
    // A town 60 km off the road is placed where the road passes nearest
    // it, and measured as off it.
    const off = nearestOnRoad(road, { lat: 33.5, lng: -101.6 });
    expect(off.alongKm).toBeCloseTo(1.5 * KM_PER_DEG, 0);
    expect(off.offRoadKm).toBeCloseTo(55.6, 0);
    expect(nearestOnRoad(road, { lat: 33.5, lng: -101 }).offRoadKm).toBe(0);
    expect(alongRoadKm(road, { lat: 30, lng: -101 })).toBeCloseTo(road.lengthKm, 5);
    // A road with no direction has no length and places everything at 0.
    const none = buildRoad([{ lat: 35, lng: -101 }]);
    expect(none.lengthKm).toBe(0);
    expect(alongRoadKm(none, { lat: 33, lng: -101 })).toBe(0);
    expect(nearestOnRoad(none, { lat: 33, lng: -101 })).toEqual({ alongKm: 0, offRoadKm: 0 });
    expect(buildRoad([]).points).toEqual([]);
  });

  it("finds the point a distance along it, between vertices, and the ends past them", () => {
    // 1.5 degrees south is 166.8 km, exactly a vertex; 2.525 degrees is
    // between two, so the point is interpolated.
    expect(pointAlong(road, 1.5 * KM_PER_DEG)!.lat).toBeCloseTo(33.5, 3);
    expect(pointAlong(road, 2.525 * KM_PER_DEG)!.lat).toBeCloseTo(32.475, 3);
    expect(pointAlong(road, 0)).toEqual({ lat: 35, lng: -101 });
    expect(pointAlong(road, -5)).toEqual({ lat: 35, lng: -101 });
    expect(pointAlong(road, road.lengthKm + 5)!.lat).toBeCloseTo(30, 5);
    expect(pointAlong(buildRoad([]), 10)).toBeNull();
  });
});

describe("the trip as days", () => {
  it("cuts two legs that together exceed a day's budget into two days, and lands every town and roadside stop in its day by its position along the road", () => {
    // Amarillo to Lubbock (3 h 20 min) and Lubbock to Austin (4 h 30 min)
    // on a 4 h budget: the first stretch is one day; the second is over
    // the budget, so it is cut where 4 h runs out (240/270 of the way,
    // 512.8 km) into a day of 4 h and a day of 30 min. Three days, each
    // saying where it ends.
    const days = tripDays({ ...base, stops: [lubbock], legMinutes: [200, 270], towns: [...towns, lubbock] });
    expect(days).toHaveLength(3);
    expect(days.map((d) => [d.fromName, d.toName])).toEqual([["Amarillo", "Lubbock"], ["Lubbock", "mile 319"], ["mile 319", "Austin"]]);
    expect(days.map((d) => d.minutes)).toEqual([200, 240, 30]);
    expect(days.map((d) => d.legIndex)).toEqual([0, 1, 1]);
    expect(days.map((d) => d.endStopId)).toEqual(["lubbock", null, null]);
    expect(days.map((d) => d.endKind)).toEqual(["stop", "mile", "end"]);
    expect(days[0].startKm).toBe(0);
    expect(days[0].endKm).toBeCloseTo(1.5 * KM_PER_DEG, 0);
    expect(days[1].startKm).toBe(days[0].endKm);
    expect(days[1].endKm).toBeCloseTo(days[0].endKm + ((road.lengthKm - days[0].endKm) * 240) / 270, 5);
    expect(days[2].startKm).toBe(days[1].endKm);
    expect(days[2].endKm).toBeCloseTo(road.lengthKm, 5);
    expect(days.map((d) => [d.legFractionStart, d.legFractionEnd])).toEqual([[0, 1], [0, 240 / 270], [240 / 270, 1]]);
    // Plainview (111 km) is before Lubbock (167 km): day 1. Lubbock itself,
    // the stop's own town, is under the day that ends there. Post (222 km),
    // Snyder (278) and Brady (445) are after it and before the cut at 513:
    // day 2. Nothing is past the cut but Austin.
    expect(days[0].towns.map((t) => t.name)).toEqual(["Plainview", "Lubbock"]);
    expect(days[1].towns.map((t) => t.name)).toEqual(["Post", "Snyder", "Brady"]);
    expect(days[2].towns).toEqual([]);
    // The places the same: 10 km is day 1; 250 and 400 are day 2.
    expect(days[0].roadside.map((s) => s.name)).toEqual(["Cadillac Ranch"]);
    expect(days[1].roadside.map((s) => s.name)).toEqual(["Prairie Dog Town", "Windmill"]);
    expect(days[2].roadside).toEqual([]);
    expect(days.map((d) => d.index)).toEqual([0, 1, 2]);
    // The count is the deadline's own: one day for the first leg, two for the second.
    expect(days.length).toBe(legsQuantizedDays([{ originCityId: "a", destinationCityId: "b", durationSeconds: 200 * 60, distanceMeters: 0 }], 240) + daysSpannedBy(270, 240));
  });

  it("makes two days of the whole road with no stops, cut where the budget runs out and named by the town near the cut, holding every town and place", () => {
    // 7 h 50 min on a 4 h budget with no stop chosen: 4 h runs out 240/470
    // of the way, 284 km, 6 km short of Snyder (278): "near Snyder". Every
    // town and place before it is day 1, the rest day 2.
    const days = tripDays({ ...base, stops: [], legMinutes: [470] });
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ index: 0, legIndex: 0, fromName: "Amarillo", toName: "near Snyder", endKind: "near", endStopId: null, minutes: 240, startKm: 0, legFractionStart: 0 });
    expect(days[1]).toMatchObject({ index: 1, legIndex: 0, fromName: "near Snyder", toName: "Austin", endKind: "end", endStopId: null, minutes: 230, legFractionEnd: 1 });
    expect(days[0].endKm).toBeCloseTo((road.lengthKm * 240) / 470, 5);
    expect(days[1].startKm).toBe(days[0].endKm);
    expect(days[1].endKm).toBeCloseTo(road.lengthKm, 5);
    expect(days[0].towns.map((t) => t.name)).toEqual(["Plainview", "Post", "Snyder"]);
    expect(days[1].towns.map((t) => t.name)).toEqual(["Brady"]);
    expect(days[0].roadside.map((s) => s.name)).toEqual(["Cadillac Ranch", "Prairie Dog Town"]);
    expect(days[1].roadside.map((s) => s.name)).toEqual(["Windmill"]);
    // Within the budget, one day of the whole road holding everything.
    const one = tripDays({ ...base, stops: [], legMinutes: [200] });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ index: 0, fromName: "Amarillo", toName: "Austin", endKind: "end", minutes: 200, startKm: 0, legFractionStart: 0, legFractionEnd: 1 });
    expect(one[0].endKm).toBeCloseTo(road.lengthKm, 5);
    expect(one[0].towns.map((t) => t.name)).toEqual(["Plainview", "Post", "Snyder", "Brady"]);
    expect(one[0].roadside.map((s) => s.name)).toEqual(["Cadillac Ranch", "Prairie Dog Town", "Windmill"]);
  });

  it("names where a cut day ends by the nearest town on the road, or by the mile with none near", () => {
    const named = [
      { name: "Amarillo", alongKm: 0 },
      { name: "Snyder", alongKm: 278 },
      { name: "Austin", alongKm: 556 },
    ];
    expect(NEAR_CUT_KM).toBe(30);
    // The line: 29 km from Snyder is near it, 31 is the mile (307 km is
    // 191 miles).
    expect(cutEndName(278 + 29, named)).toEqual({ toName: "near Snyder", endKind: "near" });
    expect(cutEndName(278 - 29, named)).toEqual({ toName: "near Snyder", endKind: "near" });
    expect(cutEndName(278 + 31, named)).toEqual({ toName: "mile 192", endKind: "mile" });
    expect(cutEndName(278 - 31, named)).toEqual({ toName: "mile 153", endKind: "mile" });
    // The nearest wins; the ends of the trip count.
    expect(cutEndName(550, named)).toEqual({ toName: "near Austin", endKind: "near" });
    expect(cutEndName(10, named)).toEqual({ toName: "near Amarillo", endKind: "near" });
    expect(cutEndName(300, [])).toEqual({ toName: "mile 186", endKind: "mile" });
    // The mile is the trip's own count, rounded as the roadside rows round theirs.
    expect(cutEndName(512.8, [])).toEqual({ toName: `mile ${Math.round((512.8 * 1000) / 1609.34)}`, endKind: "mile" });
    // A town that fits but sits hours off the road cannot name a cut; a
    // town on the road can; one with no measure is taken as on the road.
    const cutAt = (t: DayTown[]) => tripDays({ ...base, stops: [], legMinutes: [470], towns: t })[0].toName;
    expect(cutAt([{ id: "x", name: "Far Town", alongKm: 284, offRoadKm: ON_ROAD_KM + 1 }])).toBe("mile 176");
    expect(cutAt([{ id: "x", name: "Near Town", alongKm: 284, offRoadKm: ON_ROAD_KM }])).toBe("near Near Town");
    expect(cutAt([{ id: "x", name: "Unmeasured", alongKm: 284 }])).toBe("near Unmeasured");
    // A stop can name a cut in the stretch after it, as can the next stop
    // or the end: 4 h of a 4 h 5 min stretch runs out 5 min short of Austin.
    const late = tripDays({ ...base, stops: [lubbock], legMinutes: [200, 245], towns: [] });
    expect(late.map((d) => d.toName)).toEqual(["Lubbock", "near Austin", "Austin"]);
    expect(late.map((d) => d.minutes)).toEqual([200, 240, 5]);
  });

  it("says a day's time only when its route is known, and counts a stretch's days by the budget as the deadline does", () => {
    const abilene = { id: "abilene", name: "Abilene", alongKm: 334 };
    const two = { ...base, stops: [lubbock, abilene], towns: [], roadside: [] };
    // Three stretches on a 4 h budget: 3 h 20 min, 4 h exactly, 4 h 1 min:
    // days 1, 2, and 3 and 4 (the last cut a minute short of Austin).
    const three = tripDays({ ...two, legMinutes: [200, 240, 241] });
    expect(three.map((d) => [d.legIndex, d.minutes])).toEqual([[0, 200], [1, 240], [2, 240], [2, 1]]);
    expect(three.map((d) => d.index + 1)).toEqual([1, 2, 3, 4]);
    // A recompute in flight: the legs stop short of the stops, the rest is
    // unknown, never "0 min", and an unknown stretch is one day.
    expect(tripDays({ ...two, legMinutes: [200] }).map((d) => d.minutes)).toEqual([200, null, null]);
    expect(tripDays({ ...two, legMinutes: [200, 0, null] }).map((d) => d.minutes)).toEqual([200, null, null]);
    expect(tripDays({ ...two, legMinutes: [200, NaN, 300] }).map((d) => [d.legIndex, d.minutes])).toEqual([[0, 200], [1, null], [2, 240], [2, 60]]);
    expect(tripDays({ ...two, legMinutes: [] }).map((d) => d.toName)).toEqual(["Lubbock", "Abilene", "Austin"]);
    // The count per stretch is ceil(minutes / budget), the reading the
    // deadline math gives a leg (legsQuantizedDays), so the sheet's day
    // numbers and its deadline can never disagree.
    expect(daysSpannedBy(200, 240)).toBe(1);
    expect(daysSpannedBy(240, 240)).toBe(1);
    expect(daysSpannedBy(241, 240)).toBe(2);
    expect(daysSpannedBy(470, 240)).toBe(2);
    expect(daysSpannedBy(721, 240)).toBe(4);
    for (const m of [1, 200, 240, 241, 470, 721]) {
      expect(daysSpannedBy(m, 240)).toBe(legsQuantizedDays([{ originCityId: "a", destinationCityId: "b", durationSeconds: m * 60, distanceMeters: 0 }], 240));
    }
    // Unknown, or a budget that is not a positive number: one, never NaN.
    expect(daysSpannedBy(null, 240)).toBe(1);
    expect(daysSpannedBy(300, 0)).toBe(1);
    expect(daysSpannedBy(300, NaN)).toBe(1);
    expect(tripDays({ ...base, stops: [], legMinutes: [470], budgetMinutesPerDay: 0 }).map((d) => [d.toName, d.minutes])).toEqual([["Austin", 470]]);
    // A stretch of 12 h 1 min at 4 h a day is four days (the deadline's
    // count too), the middle ones from cut to cut by the mile with no
    // town near, and the last cut a minute short of Austin.
    const long = tripDays({ ...base, stops: [], legMinutes: [721], towns: [] });
    expect(long.map((d) => [d.fromName, d.toName, d.minutes])).toEqual([
      ["Amarillo", "mile 115", 240],
      ["mile 115", "mile 230", 240],
      ["mile 230", "near Austin", 240],
      ["near Austin", "Austin", 1],
    ]);
  });

  it("keeps a place beyond every stop in the last day, and a stop added behind an earlier one leaves the earlier day what the road passed first", () => {
    // Abilene was added first, then Lubbock, which the road reaches earlier:
    // day 2's stretch runs backwards and is empty; Post (222 km) and
    // Snyder (278) are in day 1, whose stretch reaches them first, and
    // Brady (445 km) in the last day.
    const abilene = { id: "abilene", name: "Abilene", alongKm: 334 };
    const days = tripDays({
      ...base, stops: [abilene, lubbock], legMinutes: [200, 150, 200],
      roadside: [...roadside, place("z", "Past the end", road.lengthKm + 2)],
    });
    expect(days.map((d) => d.towns.map((t) => t.name))).toEqual([["Plainview", "Post", "Snyder"], [], ["Brady"]]);
    expect(days[2].roadside.map((s) => s.name)).toEqual(["Windmill", "Past the end"]);
  });

  it("lists a place once whatever its spelling, and leaves a place its town already lists", () => {
    // Round 4: Day 1 listed the Buddy Holly Center three times, twice
    // from the store under two spellings and once under Lubbock.
    expect(placeNameKey("The Buddy Holly Center")).toBe("buddy holly center");
    expect(placeNameKey("Buddy Holly Center")).toBe("buddy holly center");
    expect(placeNameKey("National Cowboy & Western Heritage Museum")).toBe(placeNameKey("National Cowboy and Western Heritage Museum"));
    expect(placeNameKey("Café  du Monde!")).toBe("cafe du monde");
    expect(placeNameKey("Kimbell Art Museum")).not.toBe(placeNameKey("Kimbell Museum"));
    const rows = [
      { id: "1", name: "The Buddy Holly Center", p: 0.8 },
      { id: "2", name: "Prairie Dog Town", p: 0.7 },
      { id: "3", name: "Buddy Holly Center", p: 0.6 },
      { id: "4", name: "Windmill", p: 0.5 },
    ];
    // Strongest first in, so the stronger spelling stays.
    expect(uniqueByName(rows).map((r) => r.id)).toEqual(["1", "2", "4"]);
    // A place the town's own rows list is left to them.
    expect(uniqueByName(rows, ["Buddy Holly Center"]).map((r) => r.id)).toEqual(["2", "4"]);
    expect(uniqueByName([], ["x"])).toEqual([]);
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
    // A day cut part way along a stretch frames its own share: the cut end
    // is the point along the road, so a day between two vertices still has
    // a frame.
    const cut = dayBounds(road, { startKm: 100, endKm: 103 }, [pointAlong(road, 100)!, pointAlong(road, 103)!]);
    expect(cut!.northeast.lat).toBeCloseTo(35 - 100 / KM_PER_DEG, 3);
    expect(cut!.southwest.lat).toBeCloseTo(35 - 103 / KM_PER_DEG, 3);
    // A backwards stretch is read either way round; nothing at all is null.
    expect(dayBounds(road, { startKm: 300, endKm: 100 }, [])!.northeast.lat).toBeCloseTo(35 - 100 / KM_PER_DEG, 1);
    expect(dayBounds(buildRoad([]), { startKm: 0, endKm: 0 }, [])).toBeNull();
    expect(boundsOf([])).toBeNull();
  });
});
