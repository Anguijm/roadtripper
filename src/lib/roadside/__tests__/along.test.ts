import { describe, it, expect } from "vitest";
import { roadsideAlong } from "../along";
import type { RoadsideSurvivor } from "../survivors";

/** A road due south from 35,-101 to 34,-101: about 111 km, a point every 0.01 degrees. */
const route = Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i / 100, lng: -101 }));
const survivor = (id: string, lat: number, lng: number, name = id): RoadsideSurvivor => ({
  id, name, lat, lng, kind: "attraction", p: 0.6, about: null, url: null,
});
// At latitude 34.5 a degree of longitude is about 91.7 km, so 0.05 deg is
// about 4.6 km and 0.16 deg is about 14.7 km.
const near = survivor("near", 34.5, -101 + 0.05);
const far = survivor("far", 34.5, -101 + 0.16);
const early = survivor("early", 34.9, -101, "Early");

describe("survivors along a route", () => {
  it("keeps a stop 5 km off the road and drops one 15 km off", () => {
    const out = roadsideAlong([near, far], route);
    expect(out.map((s) => s.id)).toEqual(["near"]);
    expect(roadsideAlong([far], route, 20).map((s) => s.id)).toEqual(["far"]);
  });

  it("sorts by distance along the road and says how far", () => {
    const out = roadsideAlong([near, early], route);
    expect(out.map((s) => s.id)).toEqual(["early", "near"]);
    expect(out[0].alongKm).toBeCloseTo(11.1, 0);
    expect(out[1].alongKm).toBeCloseTo(55.6, 0);
  });

  it("passes nothing for a route with fewer than two points", () => {
    expect(roadsideAlong([near], [])).toEqual([]);
    expect(roadsideAlong([near], [route[0]])).toEqual([]);
  });
});
