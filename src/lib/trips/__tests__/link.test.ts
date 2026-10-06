import { describe, it, expect } from "vitest";
import { parseStopsParam, stopsParam, STOPS_PARAM } from "../link";
import { MAX_TRIP_STOPS } from "../types";

/** A saved trip's stops, carried in the link that reopens it (Gauntlet U9). */

const town = { cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 };
const roadside = { cityId: "osm:way:1059981743", cityName: "The Big Texan Steak Ranch", lat: 35.19381, lng: -101.7551 };

describe("the stops a reopen link carries", () => {
  it("survives the round trip, in order, towns and roadside places both", () => {
    const stops = [town, roadside];
    expect(parseStopsParam(stopsParam(stops))).toEqual(stops);
    expect(parseStopsParam(stopsParam([roadside, town]))).toEqual([roadside, town]);
  });

  it("survives names a link would otherwise trip on", () => {
    const awkward = { ...town, cityName: `Stubb's "BBQ", Lubbock; & more` };
    expect(parseStopsParam(stopsParam([awkward]))).toEqual([awkward]);
  });

  it("writes nothing for a trip with no stops", () => {
    expect(stopsParam([])).toBeNull();
  });

  it("reads as no stops when the link cannot be read, rather than failing", () => {
    for (const raw of [undefined, null, 42, {}, "", "not json", "{", "[1,2]", '{"cityId":"x"}', '[{"cityId":""}]', "null"]) {
      expect(parseStopsParam(raw), JSON.stringify(raw)).toEqual([]);
    }
  });

  it("refuses a stop with coordinates off the planet", () => {
    expect(parseStopsParam(JSON.stringify([{ ...town, lat: 91 }]))).toEqual([]);
    expect(parseStopsParam(JSON.stringify([{ ...town, lng: -181 }]))).toEqual([]);
  });

  it("never reads more stops than a trip may hold", () => {
    const tooMany = Array.from({ length: MAX_TRIP_STOPS + 1 }, (_, i) => ({ ...town, cityId: `t${i}` }));
    expect(parseStopsParam(JSON.stringify(tooMany))).toEqual([]);
    expect(parseStopsParam(JSON.stringify(tooMany.slice(0, MAX_TRIP_STOPS)))).toHaveLength(MAX_TRIP_STOPS);
  });

  it("does not hand the server a stop twice, which it would refuse", () => {
    expect(parseStopsParam(JSON.stringify([town, roadside, town]))).toEqual([town, roadside]);
  });

  it("does not parse an outsized parameter at all, even one that is otherwise valid", () => {
    // Valid JSON, a valid stop, and padded with whitespace past the
    // ceiling — so only the length check can refuse it. The first version
    // of this test used a 10,000-character name, which the schema's
    // 200-character cap refused on its own: removing the ceiling left it
    // green, so it proved the schema and nothing about the ceiling.
    const valid = JSON.stringify([town]);
    const padded = `[${" ".repeat(9_000)}${valid.slice(1)}`;
    expect(JSON.parse(padded)).toEqual([town]);
    expect(parseStopsParam(padded)).toEqual([]);
    expect(parseStopsParam(valid)).toEqual([town]);
  });

  it("takes the first when the parameter is repeated", () => {
    expect(parseStopsParam([stopsParam([town]), stopsParam([roadside])])).toEqual([town]);
  });

  it("is named once", () => {
    expect(STOPS_PARAM).toBe("stops");
  });
});
