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
