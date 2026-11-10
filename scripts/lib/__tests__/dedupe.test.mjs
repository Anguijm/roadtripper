import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { dedupeWaypoints, dedupeBracketed, bracketKey, kmBetween, nameKey, DUPLICATE_RADIUS_KM, BRACKETED_RADIUS_KM, KEEP_APART } from "../dedupe.mjs";

// 0.01 degrees of latitude is about 1.11 km.
const row = (id, name, lat, lng, extra = {}) => ({
  id, city_id: "amarillo", name, description: "d", lat, lng, trending_score: 50, ...extra,
});

describe("dedupeWaypoints", () => {
  it("passes unnamed waypoints through untouched (the temporal-dead-zone case)", () => {
    // Two unnamed places at the same spot. Grouping on "" would collapse them;
    // the version that shipped before this test crashed before it got that far.
    const rows = [row("a", "", 35.2, -101.8), row("b", "   ", 35.2, -101.8)];
    const { kept, dropped } = dedupeWaypoints(rows);
    expect(kept.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(dropped).toBe(0);
  });

  it("collapses the same name within the radius to the richest row", () => {
    const rows = [
      row("low", "Cadillac Ranch", 35.2000, -101.9870, { trending_score: 50 }),
      row("high", "Cadillac Ranch", 35.2027, -101.9870, { trending_score: 90 }),
      row("mid", "cadillac ranch", 35.2010, -101.9875, { trending_score: 70 }),
    ];
    const { kept, dropped } = dedupeWaypoints(rows);
    expect(kept.map((r) => r.id)).toEqual(["high"]);
    expect(dropped).toBe(2);
  });

  it("keeps the same name beyond the radius as separate rows", () => {
    const rows = [row("n", "Starbucks", 35.20, -101.80), row("s", "Starbucks", 35.29, -101.80)];
    expect(kmBetween(rows[0], rows[1])).toBeGreaterThan(DUPLICATE_RADIUS_KM);
    const { kept, dropped } = dedupeWaypoints(rows);
    expect(kept).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it("merges a chain whose ends are farther apart than the radius (single linkage)", () => {
    // A-B and B-C are each ~1.5 km; A-C is ~3 km. First-match-wins left one
    // of these behind once; full merging must not.
    const rows = [row("a", "Big Texan", 35.2000, -101.8), row("b", "Big Texan", 35.2135, -101.8), row("c", "Big Texan", 35.2270, -101.8)];
    expect(kmBetween(rows[0], rows[2])).toBeGreaterThan(DUPLICATE_RADIUS_KM);
    const { kept, dropped } = dedupeWaypoints(rows);
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it("breaks a trending tie by longer description, then lower id", () => {
    const rows = [
      row("z", "Helium Monument", 35.2, -101.8, { description: "short" }),
      row("m", "Helium Monument", 35.2, -101.8, { description: "a much longer description" }),
      row("a", "Helium Monument", 35.2, -101.8, { description: "short" }),
    ];
    expect(dedupeWaypoints(rows).kept.map((r) => r.id)).toEqual(["m"]);
    const tied = [row("z", "X", 35.2, -101.8), row("a", "X", 35.2, -101.8)];
    expect(dedupeWaypoints(tied).kept.map((r) => r.id)).toEqual(["a"]);
  });

  it("never merges across cities", () => {
    const rows = [row("a", "Main Street", 35.2, -101.8), { ...row("b", "Main Street", 35.2, -101.8), city_id: "lubbock" }];
    expect(dedupeWaypoints(rows).kept).toHaveLength(2);
  });

  it("normalises names by case and whitespace only", () => {
    expect(nameKey("  The  Big   Texan ")).toBe("the big texan");
    expect(nameKey("")).toBe("");
    expect(nameKey(null)).toBe("");
  });
});

describe("dedupeBracketed", () => {
  // 0.001 degrees of latitude is about 111 m.
  it("merges a bracketed aside with the plain name within 300 m, keeping the richest", () => {
    const rows = [
      row("plain", "La Grande Vitesse", 42.9665, -85.672, { trending_score: 80 }),
      row("aside", 'La Grande Vitesse ("The Calder")', 42.9655, -85.6725, { trending_score: 60 }),
    ];
    const { kept, dropped, merges } = dedupeBracketed(rows);
    expect(kept.map((r) => r.id)).toEqual(["plain"]);
    expect(dropped).toBe(1);
    expect(merges).toEqual([{ kept: rows[0], dropped: [rows[1]] }]);
  });

  it("keeps them apart past 300 m", () => {
    const rows = [row("a", "Old North Church", 42.366, -71.054), row("b", "Old North Church (Christ Church)", 42.370, -71.054)];
    expect(kmBetween(rows[0], rows[1])).toBeGreaterThan(BRACKETED_RADIUS_KM);
    expect(dedupeBracketed(rows).kept).toHaveLength(2);
  });

  it("drops only the bracket: an article or punctuation still keeps names apart", () => {
    const rows = [row("a", "The Fish Market", 35.2, -101.8), row("b", "Fish Market", 35.2, -101.8)];
    expect(dedupeBracketed(rows).kept).toHaveLength(2);
    expect(bracketKey("Old North Church (Christ Church)")).toBe("old north church");
    expect(bracketKey("Minetta Tavern (Bar)")).toBe(bracketKey("Minetta Tavern (Restaurant)"));
  });

  it("passes a name that is only a bracket through, and never merges across cities", () => {
    const rows = [row("a", "(viewpoint)", 35.2, -101.8), row("b", "(viewpoint)", 35.2, -101.8)];
    expect(dedupeBracketed(rows).kept).toHaveLength(2);
    const twoTowns = [row("x", "Begijnhof", 35.2, -101.8), { ...row("y", "Begijnhof (House 34)", 35.2, -101.8), city_id: "elsewhere" }];
    expect(dedupeBracketed(twoTowns).kept).toHaveLength(2);
  });

  it("leaves a group John kept apart alone (Little Rock's two Quapaw Quarter streets)", () => {
    const streets = [
      { ...row("scott", "Quapaw Quarter Historic Homes (Scott St)", 34.7380, -92.2700), city_id: "little-rock" },
      { ...row("cumberland", "Quapaw Quarter Historic Homes (Cumberland St)", 34.7400, -92.2710), city_id: "little-rock" },
    ];
    expect(kmBetween(streets[0], streets[1])).toBeLessThan(BRACKETED_RADIUS_KM);
    expect(KEEP_APART.has("little-rock|quapaw quarter historic homes")).toBe(true);
    const { kept, dropped } = dedupeBracketed(streets);
    expect(kept.map((r) => r.id).sort()).toEqual(["cumberland", "scott"]);
    expect(dropped).toBe(0);
  });
});

describe("the exported atlas (2026-11-10)", () => {
  const db = new Database("data/atlas.sqlite", { readonly: true, fileMustExist: true });
  const rows = db.prepare("select id, city_id, name, description, lat, lng, trending_score from waypoints").all();
  db.close();

  it("holds no bracketed duplicate the export should have merged, and one Calder in Grand Rapids", () => {
    // A re-export from an atlas.sqlite built without the second pass, or a
    // change that stops running it, brings the 80 rows back.
    expect(dedupeBracketed(rows).dropped).toBe(0);
    const calder = rows.filter((r) => r.city_id === "grand-rapids" && bracketKey(r.name) === "la grande vitesse");
    expect(calder).toHaveLength(1);
    // The group John kept apart is still two rows.
    expect(rows.filter((r) => r.city_id === "little-rock" && bracketKey(r.name) === "quapaw quarter historic homes")).toHaveLength(2);
  });
});
