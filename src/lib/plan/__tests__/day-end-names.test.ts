import { nightMarks } from "../days";
import { pastCutName, PAST_CUT_KM, PAST_CUT_MINUTES } from "../days";
import { dayHeadingLine, tripShapeLine } from "../words";
import { describe, it, expect } from "vitest";
import { buildRoad, nearestOnRoad, tripDays, type DayTown, type TripDaysInput } from "../days";
import { placesNearRoute, type PlaceRow } from "../places";

/**
 * Naming where a cut day ends from the plain town list (Gauntlet U19). The
 * road runs due south from 35,-101 to 30,-101 (556 km, a degree of latitude
 * is 111.19 km). At 7 h 50 min on a 4 h budget the cut falls 240/470 of
 * the way, at 284 km, where no atlas town is near.
 */
const KM = 111.19;
const road = buildRoad(Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i * 0.05, lng: -101 })));
const at = (id: string, name: string, km: number, lng = -101): DayTown => ({ id, name, ...nearestOnRoad(road, { lat: 35 - km / KM, lng }) });
const base: TripDaysInput = {
  fromName: "Amarillo",
  toName: "Austin",
  stops: [],
  legMinutes: [470],
  roadLengthKm: road.lengthKm,
  towns: [at("plainview", "Plainview", 111)],
  roadside: [],
  budgetMinutesPerDay: 240,
};

describe("a cut day's end named from the town list (U19)", () => {
  it("is on the road with the atlas alone, and near a list town on the road when one is within reach", () => {
    expect(tripDays(base)[0]).toMatchObject({ toName: "on the road", endKind: "hours" });
    const days = tripDays({ ...base, places: [at("place:Roscoe", "Roscoe", 300)] });
    expect(days[0]).toMatchObject({ toName: "near Roscoe", endKind: "near" });
    expect(days[1].fromName).toBe("near Roscoe");
  });

  it("keeps an atlas town near the cut over a nearer list town", () => {
    const days = tripDays({ ...base, towns: [...base.towns, at("snyder", "Snyder", 270)], places: [at("place:Hermleigh", "Hermleigh", 283)] });
    expect(days[0].toName).toBe("near Snyder");
  });

  it("never names a cut from a list town off the road, or one too far along from the cut", () => {
    // 20 km east of the road at the cut: off it (ON_ROAD_KM is 15).
    const off = at("place:Off", "Off", 284, -101 + 20 / (KM * Math.cos((32.45 * Math.PI) / 180)));
    expect(off.offRoadKm).toBeGreaterThan(15);
    expect(tripDays({ ...base, places: [off] })[0].toName).toBe("on the road");
    expect(tripDays({ ...base, places: [at("place:Far", "Far", 330)] })[0].toName).toBe("on the road");
  });

  it("does not offer a list town as a town that fits", () => {
    const days = tripDays({ ...base, places: [at("place:Roscoe", "Roscoe", 300)] });
    expect(days.flatMap((d) => d.towns.map((t) => t.name))).toEqual(["Plainview"]);
  });
});

describe("the towns on a route's road (U19)", () => {
  const route = Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i * 0.05, lng: -101 }));
  const lngOff = (km: number, lat: number) => -101 + km / (KM * Math.cos((lat * Math.PI) / 180));
  const rows: PlaceRow[] = [
    ["Tulia", "TX", 34.5, lngOff(5, 34.5)],
    ["Clovis", "NM", 34.4, lngOff(46, 34.4)],
    ["Edge", "TX", 32, lngOff(14, 32)],
    ["Beyond", "TX", 29.5, -101],
    ["Midway", "TX", 32.5, -101],
  ];
  it("keeps the towns within 15 km of the road, each once, and drops the rest", () => {
    const names = placesNearRoute(route, rows).map((p) => p.name).sort();
    expect(names).toEqual(["Edge", "Midway", "Tulia"]);
  });
  it("measures the distance to the road itself, not to the box around a stretch of it", () => {
    // A road running north-east: a town 18 km off it, square to the road,
    // sits inside the stretch's padded box (the box of a diagonal is wide)
    // and must still be left out; one 10 km off is kept.
    const diag = Array.from({ length: 41 }, (_, i) => ({ lat: 35 + i * 0.01, lng: -101 + i * 0.0122 }));
    const mid = diag[20];
    const perp = (km: number) => ({ lat: mid.lat - (km / Math.SQRT2) / KM, lng: mid.lng + (km / Math.SQRT2) / (KM * Math.cos((mid.lat * Math.PI) / 180)) });
    const p18 = perp(18), p10 = perp(10);
    const names = placesNearRoute(diag, [["Far", "TX", p18.lat, p18.lng], ["Near", "TX", p10.lat, p10.lng]]).map((p) => p.name);
    expect(names).toEqual(["Near"]);
  });

  it("finds nothing on a route too short to have a direction", () => {
    expect(placesNearRoute(route.slice(0, 1), rows)).toEqual([]);
  });
});


describe("a cut no town is near, named by the last town passed (U28)", () => {
  const named = [{ name: "Reno", alongKm: 0 }, { name: "Winnemucca", alongKm: 270 }, { name: "Elko", alongKm: 470 }, { name: "Wells", alongKm: 550 }];
  // 1 min per km: highway-ish, so minutes equal km.
  it("names the last point passed, in minutes at the day's pace, rounded to five", () => {
    expect(pastCutName(522, named, 1)).toBe("50 min past Elko");
    expect(pastCutName(473, named, 0.8)).toBe("5 min past Elko"); // never "0 min"
  });
  it("never names a point ahead of the cut", () => {
    expect(pastCutName(540, named, 0.5)).toBe("35 min past Elko");
  });
  it("says nothing when the last point passed is too far back, in km or in time, or the pace is unknown", () => {
    expect(PAST_CUT_KM).toBe(100);
    expect(PAST_CUT_MINUTES).toBe(60);
    expect(pastCutName(380, named, 0.5)).toBeNull(); // Winnemucca 110 km back
    expect(pastCutName(540, named, 1)).toBeNull(); // Elko 70 km back, but 70 min
    expect(pastCutName(522, named, null)).toBeNull();
  });
  it("reads as where the day ends, in the heading and the trip's shape", () => {
    const day = { index: 1, fromKind: "stop" as const, fromName: "Winnemucca", endKind: "past" as const, toName: "50 min past Elko", minutes: 240 };
    expect(dayHeadingLine(day)).toBe("Day 2 · Winnemucca to 50 min past Elko · 4 h");
    expect(tripShapeLine([{ toName: "Winnemucca", endKind: "stop" }, { toName: "50 min past Elko", endKind: "past" }, { toName: "Salt Lake City", endKind: "end" }])).toBe(
      "Three days, with nights in Winnemucca and 50 min past Elko"
    );
  });
});


describe("the cut nights drawn on the map (U29)", () => {
  it("marks each cut night where it falls, named as its heading says, and nothing for a stop's night or the end", () => {
    // Two cuts on the 556 km road at 3 h a day for 470 min: three days.
    const days = tripDays({ ...base, legMinutes: [470], budgetMinutesPerDay: 180, places: [at("place:Roscoe", "Roscoe", 210)] });
    expect(days.map((d) => d.endKind)).toEqual(["near", "hours", "end"]);
    const marks = nightMarks(days, road);
    expect(marks.map((m) => m.label)).toEqual(["near Roscoe", "Night 2"]);
    expect(marks.map((m) => m.key)).toEqual(["night-0", "night-1"]);
    // On the road, at the day's end: due south, so latitude says how far.
    expect(marks[0].lng).toBeCloseTo(-101, 5);
    expect((35 - marks[0].lat) * KM).toBeCloseTo(days[0].endKm, 0);
    // A stop's night has its square already; no mark.
    const withStop = tripDays({ ...base, stops: [{ id: "lubbock", name: "Lubbock", alongKm: 190 }], legMinutes: [160, 310] });
    expect(withStop[0].endKind).toBe("stop");
    expect(nightMarks(withStop, road).every((m) => m.key !== "night-0")).toBe(true);
  });
});
