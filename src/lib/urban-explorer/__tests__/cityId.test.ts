import { describe, it, expect } from "vitest";
import { isCityId, CITY_ID_PATTERN } from "../cityAtlas";

/**
 * What counts as an atlas city id (Gauntlet U7).
 *
 * Two things depend on agreeing about this: the server refuses a
 * `selectedCityId` that does not match, because it is untrusted input
 * reaching a read, and the plan sheet has to know not to send one that
 * would be refused.
 */

describe("an atlas city id", () => {
  it("accepts the slugs the atlas actually uses", () => {
    for (const id of ["lubbock", "oklahoma-city", "st-louis", "a", "1", "new-york-city"]) {
      expect(isCityId(id), id).toBe(true);
    }
  });

  it("refuses a roadside place's id, which is why U7 needed this", () => {
    // A roadside stop can be a trip stop now and its id is an OSM one.
    // The sheet used to send it as the selected city; the server rejected
    // the whole recompute as invalid input, so adding a place worth
    // pulling over for silently left the drive times stale. Measured on a
    // live server: the action returned in 3 ms without calling the Routes
    // API, against 293 ms for a town and 457 ms once fixed.
    for (const id of ["osm:way:1059981743", "osm:node:609552420", "osm:relation:1"]) {
      expect(isCityId(id), id).toBe(false);
    }
  });

  it("refuses the shapes a guard is for", () => {
    for (const id of ["", "UPPER", "has space", "has_underscore", "a".repeat(101), "../etc", "a/b", "a.b"]) {
      expect(isCityId(id), JSON.stringify(id)).toBe(false);
    }
    for (const id of [undefined, null, 0, 42, {}, [], true, ["lubbock"]]) {
      expect(isCityId(id), JSON.stringify(id)).toBe(false);
    }
  });

  it("is anchored at both ends, so a bad id cannot hide inside a good one", () => {
    expect(isCityId("lubbock\nosm:way:1")).toBe(false);
    expect(isCityId("osm:way:1\nlubbock")).toBe(false);
    expect(CITY_ID_PATTERN.source.startsWith("^")).toBe(true);
    expect(CITY_ID_PATTERN.source.endsWith("$")).toBe(true);
    expect(CITY_ID_PATTERN.flags).not.toContain("m");
  });
});

describe("what a saved trip may carry", () => {
  it("accepts a roadside stop's id, which is not a city id", async () => {
    // Council round 1 on #96 asked whether a trip holding a roadside stop
    // still parses. It does, and this is what says so. The two limits are
    // deliberately different: `CITY_ID_PATTERN` is the narrow one, for a
    // value that reaches a read; `SavedTripStopSchema.cityId` is a plain
    // length cap, because a trip's stop may be an OSM id.
    const { SaveTripInputSchema } = await import("@/lib/trips/types");
    const trip = {
      fromName: "Amarillo",
      toName: "Austin",
      fromLat: 35.2073,
      fromLng: -101.8338,
      toLat: 30.2672,
      toLng: -97.7431,
      budgetHours: 4,
      stops: [
        { cityId: "osm:way:1059981743", cityName: "The Big Texan Steak Ranch", lat: 35.19381, lng: -101.7551 },
        { cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 },
      ],
    };
    const parsed = SaveTripInputSchema.safeParse(trip);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(isCityId(trip.stops[0].cityId)).toBe(false);
    expect(isCityId(trip.stops[1].cityId)).toBe(true);
  });
});
