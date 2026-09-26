import { describe, it, expect } from "vitest";
import { dedupeWaypoints, kmBetween, nameKey, DUPLICATE_RADIUS_KM } from "../dedupe.mjs";

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
