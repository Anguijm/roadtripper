import { describe, it, expect } from "vitest";
import { unitFor, inUnit, distanceWords, KM_PER_MILE } from "@/lib/plan/units";
import { formatDistance } from "@/lib/routing/format";
import { NEAREST_TOWN_MAX_KM, unitAt } from "@/lib/today/plan";

/** John, 2026-11-15: "Miles in the US, km abroad". */
describe("units", () => {
  it("reads miles for a US start, or none known, and km anywhere else", () => {
    expect(unitFor("United States")).toBe("mi");
    expect(unitFor(" united states ")).toBe("mi");
    expect(unitFor(null)).toBe("mi");
    expect(unitFor("")).toBe("mi");
    expect(unitFor("Canada")).toBe("km");
    expect(unitFor("Japan")).toBe("km");
  });

  it("says a distance in a sentence, and keeps the divisor the app has always used", () => {
    expect(KM_PER_MILE).toBe(1.60934);
    expect(distanceWords(109.3, "mi")).toBe("68 miles");
    expect(distanceWords(1.6, "mi")).toBe("1 mile");
    expect(distanceWords(109.3, "km")).toBe("109 km");
    expect(inUnit(160.8, "mi")).toBe(100);
  });

  it("gives a route's length in either", () => {
    expect(formatDistance(800_000)).toBe("497 mi");
    expect(formatDistance(800_000, "mi")).toBe("497 mi");
    expect(formatDistance(800_000, "km")).toBe("800 km");
  });

  it("rounds the /today notice's 650 km to about 400 miles", () => {
    expect(Math.round(inUnit(NEAREST_TOWN_MAX_KM, "mi") / 100) * 100).toBe(400);
  });
});

describe("unitAt, a trip's start", () => {
  it("reads km from Toronto and from 61 km north of it, miles from Detroit and from mid-ocean", () => {
    expect(unitAt({ lat: 43.6532, lng: -79.3832 })).toBe("km");
    expect(unitAt({ lat: 44.2, lng: -79.4 })).toBe("km");
    expect(unitAt({ lat: 42.33, lng: -83.05 })).toBe("mi");
    expect(unitAt({ lat: 40.74, lng: -84.11 })).toBe("mi");
    expect(unitAt({ lat: 30, lng: -150 })).toBe("mi");
  });
});
