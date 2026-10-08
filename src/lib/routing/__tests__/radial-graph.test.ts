import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findCitiesInRadius } from "../radial";
import { allCities, hasDriveGraphFor } from "@/lib/atlas/queries";

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

  /**
   * A real trip the graph covers: Winnemucca to Salt Lake City (the corridor
   * towns, #119). Elko is ahead on the way; Salt Lake City is the end, and
   * the end is never a town that fits (U26). Until U26 these tests aimed at
   * the origin's nearest graph neighbour and expected it back, which is the
   * destination offered as a stop.
   */
  const trip = () => {
    const byId = (id: string) => allCities().find((c) => c.id === id)!;
    const origin = byId("winnemucca-nv");
    const dest = byId("salt-lake-city");
    expect(origin && dest, "the corridor towns are missing from the atlas").toBeTruthy();
    expect(hasDriveGraphFor(origin.id), "Winnemucca has no graph rows").toBe(true);
    return { origin: { lat: origin.lat, lng: origin.lng }, dest: { lat: dest.lat, lng: dest.lng } };
  };

  it("answers from the graph with no network call at all, and never offers the destination", async () => {
    const { origin, dest } = trip();
    const out = await findCitiesInRadius(origin, dest, 600);
    expect(calls, `made ${calls.length} network call(s)`).toEqual([]);
    expect(out.map((c) => c.city.id)).toContain("elko-nv");
    expect(out.map((c) => c.city.id)).not.toContain("salt-lake-city");
  });

  it("never offers the destination's town when the trip ends a few km from its centre", async () => {
    // A typed end is rarely the atlas's point: an address on the east bench,
    // ~6 km past downtown from the west, so downtown is ahead and only the
    // destination rule can drop it (the airport, west of downtown, put it past
    // the end, and the ahead rule dropped it alone).
    const { origin } = trip();
    const out = await findCitiesInRadius(origin, { lat: 40.75, lng: -111.82 }, 600);
    expect(out.map((c) => c.city.id)).toContain("elko-nv");
    expect(out.map((c) => c.city.id)).not.toContain("salt-lake-city");
  });

  it("returns candidates sorted by drive time", async () => {
    const { origin, dest } = trip();
    const out = await findCitiesInRadius(origin, dest, 600);
    expect(out.length).toBeGreaterThan(0);
    const mins = out.map((c) => c.oneWayDriveMinutes);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(calls).toEqual([]);
  });

  it("applies the time ceiling", async () => {
    const { origin, dest } = trip();
    const wide = await findCitiesInRadius(origin, dest, 600);
    const out = await findCitiesInRadius(origin, dest, 150);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(wide.length);
    for (const c of out) expect(c.oneWayDriveMinutes).toBeLessThanOrEqual(150);
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
