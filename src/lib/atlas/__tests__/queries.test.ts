import { describe, it, expect } from "vitest";
import { allCities, waypointsForCities, waypointsInBox, neighborhoodsForCity } from "../queries";
import { atlasExportedAt, atlasAgeDays } from "../db";

/**
 * These run against the real `data/atlas.sqlite` that ships with the build,
 * on purpose. A mocked atlas would pass while the real file was missing,
 * corrupt, or built with the wrong schema, and the file being present and
 * correct is the whole point of step 4.
 */
describe("atlas", () => {
  it("has the cities the plan depends on, including the west", () => {
    const cities = allCities();
    // 250, not 277: a floor that catches a truncated or half-written export
    // without failing every time the upstream pipeline adds or retires a city.
    expect(cities.length).toBeGreaterThan(250);
    const byName = new Set(cities.map((c) => c.name));
    // The Northeast-only candidate list seen on 2026-09-22 was a routing cap,
    // not missing data. These pin that the western data is really here.
    for (const n of ["Amarillo", "Winslow", "Marfa", "Albuquerque", "Los Angeles", "New York City"]) {
      expect(byName, `expected ${n} in the atlas`).toContain(n);
    }
  });

  it("gives every city usable coordinates", () => {
    for (const c of allCities()) {
      expect(Number.isFinite(c.lat) && Number.isFinite(c.lng), `${c.id} coords`).toBe(true);
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lng)).toBeLessThanOrEqual(180);
    }
  });

  it("returns waypoints for several cities at once, past Firestore's old 10-city cap", () => {
    const ids = allCities().slice(0, 25).map((c) => c.id);
    const wps = waypointsForCities(ids);
    expect(wps.length).toBeGreaterThan(0);
    expect(new Set(wps.map((w) => w.cityId)).size).toBeGreaterThan(10);
  });

  it("returns nothing for an empty city list rather than everything", () => {
    expect(waypointsForCities([])).toEqual([]);
  });

  it("carries the description the old Firestore projection dropped", () => {
    const ids = allCities().slice(0, 10).map((c) => c.id);
    const wps = waypointsForCities(ids);
    const withText = wps.filter((w) => w.description && w.description.length > 0);
    // Measured at export time: 15,185 of 15,185 waypoints carry one.
    expect(withText.length).toBe(wps.length);
  });

  it("answers a corridor bounding box spatially, and fast (ship rule 3)", () => {
    // Roughly the Amarillo to Albuquerque stretch of I-40.
    const t0 = process.hrtime.bigint();
    const hits = waypointsInBox(-106.0, -100.0, 34.5, 36.5);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    expect(hits.length).toBeGreaterThan(0);
    expect(ms, `corridor query took ${ms.toFixed(2)}ms`).toBeLessThan(10);
    for (const h of hits) {
      expect(h.lng).toBeGreaterThanOrEqual(-106.0);
      expect(h.lng).toBeLessThanOrEqual(-100.0);
      expect(h.lat).toBeGreaterThanOrEqual(34.5);
      expect(h.lat).toBeLessThanOrEqual(36.5);
    }
  });

  it("keeps the r-tree and the waypoint rows in step", () => {
    // A mismatched rowid join silently returns the wrong rows rather than
    // failing, so assert the spatial hits are a subset of the city query.
    const box = waypointsInBox(-106.0, -100.0, 34.5, 36.5);
    const cityIds = [...new Set(box.map((w) => w.cityId))];
    const viaCities = new Set(waypointsForCities(cityIds).map((w) => w.id));
    for (const w of box) expect(viaCities, `${w.name} (${w.id})`).toContain(w.id);
  });

  it("returns neighborhoods for a city, capped and ranked", () => {
    const withNb = allCities().find((c) => neighborhoodsForCity(c.id, 20).length > 0);
    expect(withNb, "no city had neighborhoods").toBeDefined();
    const nbs = neighborhoodsForCity(withNb!.id, 5);
    expect(nbs.length).toBeGreaterThan(0);
    expect(nbs.length).toBeLessThanOrEqual(5);
    const scores = nbs.map((n) => n.trending_score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const n of nbs) expect(typeof n.name.en).toBe("string");
  });

  it("records when it was exported so staleness can be seen", () => {
    const at = atlasExportedAt();
    expect(at).toBeTruthy();
    expect(Number.isNaN(Date.parse(at!))).toBe(false);
    const age = atlasAgeDays();
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(0);
  });
});
