import { describe, it, expect } from "vitest";
import { sheetFromScores, SHEET_MAX_YES, SHEET_NEAR, SHEET_RANDOM } from "../sample";
import type { RoadsideStop } from "../record";

const stop = (i: number): RoadsideStop => ({
  id: `osm:node:${i}`, name: `Stop ${String(i).padStart(3, "0")}`, lat: 35, lng: -101, kind: "attraction", source: "osm",
  reason: null, detail: null, wikidata: null, wikipedia: null,
});
/** n stops with p = i/n, so exactly half are at or above 0.5. */
function scored(n: number) {
  const stops = Array.from({ length: n }, (_, i) => stop(i));
  const scores = new Map(stops.map((s, i) => [s.id, i / n]));
  return { stops, scores };
}

describe("the sheet from scores", () => {
  it("puts every yes first by probability, then the ten just under the line, then ten at random, none twice", () => {
    const { stops, scores } = scored(200);
    const rows = sheetFromScores(stops, scores);
    const yes = rows.filter((r) => r.group === "yes");
    const near = rows.filter((r) => r.group === "near_no");
    const random = rows.filter((r) => r.group === "random_no");
    expect(yes).toHaveLength(100);
    expect(yes.every((r) => r.p >= 0.5)).toBe(true);
    expect(yes.map((r) => r.p)).toEqual([...yes.map((r) => r.p)].sort((a, b) => b - a));
    expect(near).toHaveLength(SHEET_NEAR);
    expect(near.map((r) => r.stop.id)).toEqual(Array.from({ length: 10 }, (_, k) => `osm:node:${99 - k}`));
    expect(random).toHaveLength(SHEET_RANDOM);
    expect(random.every((r) => r.p < near.at(-1)!.p)).toBe(true);
    expect(new Set(rows.map((r) => r.stop.id)).size).toBe(rows.length);
    expect(rows.slice(0, 100).every((r) => r.group === "yes")).toBe(true);
  });

  it("breaks a tie by name the same way everywhere, accents included", () => {
    const names = ["Zilker", "Émile", "eagle", "Ålesund"];
    const stops = names.map((n, i) => ({ ...stop(i), name: n }));
    const scores = new Map(stops.map((s) => [s.id, 0.9]));
    const order = sheetFromScores(stops, scores).map((r) => r.stop.name);
    expect(order).toEqual(["Ålesund", "eagle", "Émile", "Zilker"]);
  });

  it("is deterministic for a seed and different for another", () => {
    const { stops, scores } = scored(200);
    const a = sheetFromScores(stops, scores).filter((r) => r.group === "random_no").map((r) => r.stop.id);
    const b = sheetFromScores(stops, scores).filter((r) => r.group === "random_no").map((r) => r.stop.id);
    const c = sheetFromScores(stops, scores, { seed: 9 }).filter((r) => r.group === "random_no").map((r) => r.stop.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("cuts the yes list at the cap by probability, and gives all the no calls when there are fewer than twenty", () => {
    const { stops, scores } = scored(400); // 200 at or above 0.5
    const yes = sheetFromScores(stops, scores).filter((r) => r.group === "yes");
    expect(yes).toHaveLength(SHEET_MAX_YES);
    expect(yes.at(-1)!.p).toBeGreaterThan(yes[0].p - 0.5);
    expect(Math.min(...yes.map((r) => r.p))).toBeCloseTo(250 / 400, 5);
    const few = scored(20); // 10 below the line: all of them, near first
    const rows = sheetFromScores(few.stops, few.scores);
    expect(rows.filter((r) => r.group !== "yes")).toHaveLength(10);
    expect(rows.filter((r) => r.group === "random_no")).toHaveLength(0);
  });

  it("never draws a near miss again at random, whatever the seed", () => {
    // 30 stops, 15 below the line: ten are near misses, so the random draw
    // has only five to choose from and must return exactly those five.
    const { stops, scores } = scored(30);
    for (const seed of [1, 2, 3, 1337]) {
      const rows = sheetFromScores(stops, scores, { seed });
      const near = new Set(rows.filter((r) => r.group === "near_no").map((r) => r.stop.id));
      const random = rows.filter((r) => r.group === "random_no");
      expect(random).toHaveLength(5);
      expect(random.some((r) => near.has(r.stop.id))).toBe(false);
    }
  });

  it("leaves out stops with no score, or a score that is not a number", () => {
    const { stops, scores } = scored(10);
    scores.delete("osm:node:9");
    scores.set("osm:node:8", Number.NaN);
    const rows = sheetFromScores(stops, scores);
    expect(rows.some((r) => r.stop.id === "osm:node:9" || r.stop.id === "osm:node:8")).toBe(false);
    expect(rows).toHaveLength(8);
  });
});
