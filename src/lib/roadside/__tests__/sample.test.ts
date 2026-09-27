import { describe, it, expect } from "vitest";
import { labelSample } from "../sample";
import type { RoadsideStop, RoadsideKind } from "../record";

const stop = (i: number, kind: RoadsideKind): RoadsideStop => ({
  id: `osm:node:${i}`, name: `Stop ${i}`, lat: 35 + i / 1000, lng: -101 - i / 1000, kind, source: "osm",
  reason: null, wikidata: null, wikipedia: null,
});

/** A corridor like the first ten tiles: a flood of one kind and a few of the rest. */
function corridor(): RoadsideStop[] {
  const out: RoadsideStop[] = [];
  let i = 0;
  const add = (kind: RoadsideKind, n: number) => { for (let k = 0; k < n; k++) out.push(stop(i++, kind)); };
  add("historic", 300); add("artwork", 53); add("attraction", 36); add("museum", 25); add("theme_park", 10); add("park", 3); add("notable", 2); add("zoo", 1);
  return out;
}

describe("labelSample", () => {
  it("returns exactly 100, no duplicates, every kind present, no kind over a quarter", () => {
    const sample = labelSample(corridor());
    expect(sample).toHaveLength(100);
    expect(new Set(sample.map((s) => s.id)).size).toBe(100);
    const byKind = new Map<string, number>();
    for (const s of sample) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
    for (const kind of ["historic", "artwork", "attraction", "museum", "theme_park", "park", "notable", "zoo"]) {
      expect(byKind.get(kind) ?? 0).toBeGreaterThanOrEqual(1);
      expect(byKind.get(kind) ?? 0).toBeLessThanOrEqual(25);
    }
    // the small kinds gave all they had, and the big kinds share the rest
    // evenly (round-robin), so the flood of 300 historic entries ends up no
    // larger on the sheet than the 25 museums
    const big = ["historic", "artwork", "attraction", "museum"].map((k) => byKind.get(k) ?? 0);
    expect(Math.max(...big) - Math.min(...big)).toBeLessThanOrEqual(1);
    expect(byKind.get("historic")).toBeLessThanOrEqual(25);
    expect(byKind.get("zoo")).toBe(1);
    expect(byKind.get("notable")).toBe(2);
    expect(byKind.get("park")).toBe(3);
  });

  it("is deterministic for the same stops and seed, and different for another seed", () => {
    const a = labelSample(corridor()).map((s) => s.id);
    const b = labelSample(corridor()).map((s) => s.id);
    const c = labelSample(corridor(), { seed: 7 }).map((s) => s.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("returns everything when there are fewer stops than the sheet, and dedupes by id", () => {
    const few = [stop(1, "attraction"), stop(2, "museum"), stop(1, "attraction")];
    expect(labelSample(few)).toHaveLength(2);
  });

  it("fills a sheet even when the caps would leave it short", () => {
    // Only two kinds: a quarter each is 50, and that is all it can give.
    const two = [...Array.from({ length: 80 }, (_, i) => stop(i, "historic")), ...Array.from({ length: 80 }, (_, i) => stop(100 + i, "artwork"))];
    const sample = labelSample(two);
    expect(sample).toHaveLength(50);
  });

  it("refuses a bad size or share", () => {
    expect(() => labelSample(corridor(), { size: 0 })).toThrow();
    expect(() => labelSample(corridor(), { maxShare: 2 })).toThrow();
  });
});
