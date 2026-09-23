import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findCitiesInRadius } from "../radial";
import { allCities, hasDriveGraphFor, driveTimesFrom } from "@/lib/atlas/queries";

/**
 * Ship rule 3: a cache-cold request must reach the Routes API zero times when
 * the graph covers the origin.
 *
 * Counted, not assumed. `fetch` is replaced with a spy that throws, so any call
 * both fails the assertion and fails the request loudly rather than quietly
 * costing money in production.
 */
describe("findCitiesInRadius uses the graph, not the API", () => {
  const realFetch = globalThis.fetch;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      calls.push(url);
      throw new Error(`unexpected network call to ${url}`);
    }) as unknown as typeof fetch;
    process.env.GOOGLE_MAPS_KEY = "test-key-should-never-be-used";
  });

  afterEach(() => { globalThis.fetch = realFetch; });

  /** A city the graph actually covers, plus somewhere west of it to aim at. */
  const seededOrigin = () => allCities().find((c) => hasDriveGraphFor(c.id));

  it("answers from the graph with no network call at all", async () => {
    const origin = seededOrigin();
    expect(origin, "no seeded city in the atlas graph").toBeDefined();

    // Aim at whichever covered destination the graph knows about, so the
    // semicircle filter cannot be what empties the result.
    const target = driveTimesFrom(origin!.id, 10_000)[0];
    expect(target, "seeded city has no graph rows").toBeDefined();
    const dest = allCities().find((c) => c.id === target.cityId)!;

    const out = await findCitiesInRadius(
      { lat: origin!.lat, lng: origin!.lng },
      { lat: dest.lat, lng: dest.lng },
      600
    );

    expect(calls, `made ${calls.length} network call(s)`).toEqual([]);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((c) => c.city.id === dest.id)).toBe(true);
  });

  it("returns candidates sorted by drive time", async () => {
    const origin = seededOrigin()!;
    const target = driveTimesFrom(origin.id, 10_000)[0];
    const dest = allCities().find((c) => c.id === target.cityId)!;
    const out = await findCitiesInRadius(
      { lat: origin.lat, lng: origin.lng },
      { lat: dest.lat, lng: dest.lng },
      600
    );
    const mins = out.map((c) => c.oneWayDriveMinutes);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(calls).toEqual([]);
  });

  it("applies the time ceiling", async () => {
    const origin = seededOrigin()!;
    const target = driveTimesFrom(origin.id, 10_000)[0];
    const dest = allCities().find((c) => c.id === target.cityId)!;
    const out = await findCitiesInRadius(
      { lat: origin.lat, lng: origin.lng },
      { lat: dest.lat, lng: dest.lng },
      45
    );
    for (const c of out) expect(c.oneWayDriveMinutes).toBeLessThanOrEqual(45);
    expect(calls).toEqual([]);
  });

  it("falls back to the API when the origin is nowhere near a known city", async () => {
    // Mid-Pacific: nothing to snap to, so the graph cannot answer and the code
    // must say so by reaching for the network rather than returning nothing.
    await expect(
      findCitiesInRadius({ lat: 5, lng: -150 }, { lat: 34.05, lng: -118.24 }, 240)
    ).rejects.toThrow(/unexpected network call/);
    expect(calls.length).toBeGreaterThan(0);
  });
});
