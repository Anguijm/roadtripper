import { describe, it, expect } from "vitest";
import {
  driveTimesFrom, hasDriveGraphFor, driveGraphInfo,
  snapToCity, haversineKm, allCities, SNAP_RADIUS_KM,
} from "../queries";

/**
 * Runs against the real atlas. A mocked graph would pass while the shipped file
 * was empty, and an empty graph is invisible at every call site: it just means
 * no city is ever offered.
 */
describe("drive-time graph", () => {
  const seeded = () => allCities().find((c) => hasDriveGraphFor(c.id));

  it("has rows, and reports what built them", () => {
    const info = driveGraphInfo();
    expect(info.rows).toBeGreaterThan(0);
    expect(info.provider).toBeTruthy();
    expect(info.builtAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(info.builtAt!))).toBe(false);
  });

  it("returns rows ordered by drive time, all within the ceiling", () => {
    const city = seeded();
    expect(city, "no city in the atlas has graph rows").toBeDefined();
    const rows = driveTimesFrom(city!.id, 600);
    expect(rows.length).toBeGreaterThan(0);
    const mins = rows.map((r) => r.minutes);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    for (const m of mins) expect(m).toBeLessThanOrEqual(600);
  });

  it("respects the ceiling rather than returning everything", () => {
    const city = seeded()!;
    const wide = driveTimesFrom(city.id, 600);
    const narrow = driveTimesFrom(city.id, 60);
    expect(narrow.length).toBeLessThanOrEqual(wide.length);
    for (const r of narrow) expect(r.minutes).toBeLessThanOrEqual(60);
  });

  it("never points a city at itself", () => {
    const city = seeded()!;
    expect(driveTimesFrom(city.id, 10_000).some((r) => r.cityId === city.id)).toBe(false);
  });

  it("distinguishes 'no data' from 'nothing in range'", () => {
    // Both come back as an empty array, which is why hasDriveGraphFor exists:
    // one should fall back to the API, the other is a real answer.
    expect(hasDriveGraphFor("definitely-not-a-city")).toBe(false);
    expect(driveTimesFrom("definitely-not-a-city", 600)).toEqual([]);
    const city = seeded()!;
    expect(hasDriveGraphFor(city.id)).toBe(true);
    expect(driveTimesFrom(city.id, 0.0001)).toEqual([]);
  });

  it("gives plausible drive times, not garbage", () => {
    const city = seeded()!;
    for (const r of driveTimesFrom(city.id, 600)) {
      const other = allCities().find((c) => c.id === r.cityId)!;
      const km = haversineKm(city, other);
      // Straight-line km over hours driven. Below ~25 km/h means the number is
      // implausibly slow; above 130 km/h means it beat a straight line, which
      // no road does.
      const kmh = km / (r.minutes / 60);
      expect(kmh, `${city.name} -> ${other.name}: ${km.toFixed(0)}km in ${r.minutes.toFixed(0)}min`).toBeGreaterThan(25);
      expect(kmh).toBeLessThan(130);
    }
  });
});

describe("snapping an arbitrary point to a city", () => {
  it("snaps a city's own coordinates to itself at zero distance", () => {
    const c = allCities()[0];
    const snapped = snapToCity({ lat: c.lat, lng: c.lng });
    expect(snapped?.city.id).toBe(c.id);
    expect(snapped!.distanceKm).toBeLessThan(0.001);
  });

  it("picks the nearest city, not merely a nearby one", () => {
    const c = allCities()[5];
    const nudged = { lat: c.lat + 0.05, lng: c.lng + 0.05 };
    const snapped = snapToCity(nudged)!;
    const trueNearest = allCities()
      .map((x) => ({ x, d: haversineKm(nudged, x) }))
      .sort((a, b) => a.d - b.d)[0];
    expect(snapped.city.id).toBe(trueNearest.x.id);
  });

  it("returns null in the middle of an ocean rather than a wrong answer", () => {
    expect(snapToCity({ lat: 0, lng: -140 })).toBeNull();
  });

  it("honours the radius", () => {
    const c = allCities()[0];
    expect(snapToCity({ lat: c.lat, lng: c.lng }, 0.0001)?.city.id).toBe(c.id);
    const far = { lat: c.lat + 5, lng: c.lng + 5 };
    const snapped = snapToCity(far);
    if (snapped) expect(snapped.distanceKm).toBeLessThanOrEqual(SNAP_RADIUS_KM);
  });
});
