import { describe, it, expect } from "vitest";
import { buildSurvivors, aboutFor, MAP_THRESHOLD, SurvivorsFileSchema, RoadsideSurvivorSchema, hasRealName } from "../survivors";
import type { RoadsideStop } from "../record";

const stop = (i: number, extra: Partial<RoadsideStop> = {}): RoadsideStop => ({
  id: `osm:node:${i}`, name: `Stop ${i}`, lat: 35, lng: -101, kind: "attraction", source: "osm",
  reason: null, detail: null, wikidata: null, wikipedia: null, ...extra,
});

describe("the survivors", () => {
  it("keeps every scored stop at or above the line, skips the unscored, and keeps corridor order", () => {
    const stops = [stop(1), stop(2), stop(3), stop(4)];
    const scores = new Map([["osm:node:1", 0.45], ["osm:node:2", 0.44], ["osm:node:4", 0.9]]);
    const out = buildSurvivors(stops, scores, {});
    expect(out.map((s) => [s.id, s.p])).toEqual([["osm:node:1", 0.45], ["osm:node:4", 0.9]]);
    expect(MAP_THRESHOLD).toBe(0.45);
    expect(buildSurvivors(stops, scores, {}, 0.5).map((s) => s.id)).toEqual(["osm:node:4"]);
  });

  it("reads about in order: the encyclopedia's opening, its short description, the map's own line, nothing", () => {
    const s = stop(1, { detail: "mural" });
    expect(aboutFor(s, { extract: "A large steakhouse. Known for eating.", short: "restaurant" })).toBe("A large steakhouse. Known for eating.");
    expect(aboutFor(s, { short: "restaurant" })).toBe("restaurant");
    // The map's own line, when it is a single tag word, is said as the noun
    // in the card's sentence rather than shown bare (U16); before U16 this
    // read just "mural".
    expect(aboutFor(s, undefined)).toBe("On the map as a mural; nothing written about it yet.");
    expect(aboutFor(stop(4, { detail: "A mural of the plains, painted in 1999." }), undefined)).toBe("A mural of the plains, painted in 1999.");
    expect(aboutFor(stop(2), { extract: "  " })).toBeNull();
    const long = "word ".repeat(100);
    expect(aboutFor(stop(3, { detail: long }), undefined)!.length).toBeLessThanOrEqual(240);
  });

  it("carries the Wikipedia link and validates as a file", () => {
    const out = buildSurvivors([stop(1)], new Map([["osm:node:1", 0.7]]), { "osm:node:1": { url: "https://en.wikipedia.org/wiki/X", short: "x" } });
    expect(out[0].url).toBe("https://en.wikipedia.org/wiki/X");
    const file = { corridor: "c", builtAt: "2026-09-28T00:00:00Z", threshold: 0.45, model: "jev-1.13.0", stops: out };
    expect(SurvivorsFileSchema.safeParse(file).success).toBe(true);
    expect(SurvivorsFileSchema.safeParse({ ...file, stops: [{ ...out[0], p: 1.5 }] }).success).toBe(false);
  });
});

describe("a place's name is a name (U15)", () => {
  it("refuses a symbol, a bare number, or a single character", () => {
    // 54 places on the map, all in Midland, Texas, are named "*".
    for (const name of ["*", "4", "18", "S", "a", " * ", "", "  "]) {
      expect(hasRealName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it("keeps the real short names the map does have", () => {
    for (const name of ["Owl", "Ram", "Zia", "B52", "Oz", "U-Drop Inn", "Ol' Rip", "Café", "Zoë"]) {
      expect(hasRealName(name), name).toBe(true);
    }
  });

  it("is applied at the boundary, so a nameless row never becomes a place on the sheet", () => {
    const row = { id: "osm:node:5872811324", lat: 32, lng: -102.1, kind: "attraction", p: 0.6, about: null, url: null };
    expect(RoadsideSurvivorSchema.safeParse({ ...row, name: "*" }).success).toBe(false);
    expect(RoadsideSurvivorSchema.safeParse({ ...row, name: "Owl" }).success).toBe(true);
  });
});
