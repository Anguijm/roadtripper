import { describe, it, expect } from "vitest";
import { fetchWaypointsForCandidates, fetchNeighborhoods } from "./recommend";
import { allCities } from "@/lib/atlas/queries";
import type { RadialCandidate } from "./radial";

/**
 * Replaces the previous suite, which mocked `urbanExplorerDb` and asserted
 * Firestore query shapes and cache keys. Both are gone: the atlas is local and
 * the in-process waypoint cache was removed with it.
 *
 * These run against the real atlas for the same reason the atlas tests do. The
 * old suite passed for years while the production read path was capped at 10
 * cities by a Firestore `in` limit nobody tested against.
 */
const candidate = (id: string, name: string, lat: number, lng: number, mins: number): RadialCandidate => ({
  city: { id, name, country: "US", region: "x", tier: "tier2", lat, lng },
  oneWayDriveMinutes: mins,
});

const realCandidates = (n: number) =>
  allCities()
    .slice(0, n)
    .map((c, i) => candidate(c.id, c.name, c.lat, c.lng, 30 + i * 5));

describe("fetchWaypointsForCandidates", () => {
  it("returns fresh data with cities and waypoints for real candidates", async () => {
    const res = await fetchWaypointsForCandidates(realCandidates(8));
    expect(res.status).toBe("fresh");
    expect(res.cities.length).toBe(8);
    expect(res.waypoints.length).toBeGreaterThan(0);
    for (const w of res.waypoints) {
      expect(res.cities.some((c) => c.id === w.cityId)).toBe(true);
    }
  });

  it("doubles one-way drive time into the round-trip detour the scorer expects", async () => {
    const cands = realCandidates(3);
    const res = await fetchWaypointsForCandidates(cands);
    for (const c of cands) {
      const ctx = res.cities.find((x) => x.id === c.city.id);
      expect(ctx?.detourMinutes).toBe(c.oneWayDriveMinutes * 2);
    }
  });

  it("caps at MAX_WAYPOINT_CITIES rather than fetching every candidate", async () => {
    const res = await fetchWaypointsForCandidates(realCandidates(40));
    expect(res.cities.length).toBe(10);
  });

  it("handles an empty candidate list", async () => {
    const res = await fetchWaypointsForCandidates([]);
    expect(res).toEqual({ status: "fresh", cities: [], waypoints: [], neighborhoods: {} });
  });

  it("loads neighborhoods only for the one selected city", async () => {
    const cands = realCandidates(6);
    const target = cands[0].city.id;
    const res = await fetchWaypointsForCandidates(cands, target);
    expect(Object.keys(res.neighborhoods)).toEqual([target]);
  });

  it("rejects a malformed cityId at the boundary instead of querying with it", async () => {
    const res = await fetchNeighborhoods("../../etc/passwd");
    expect(res.loadState.kind).toBe("failed");
    expect(res.failure?.reason).toMatch(/invalid cityId/i);
  });

  it("reports empty rather than failed for a city with no neighborhoods", async () => {
    const res = await fetchNeighborhoods("definitely-not-a-city-id");
    expect(res.loadState.kind).toBe("empty");
    expect(res.failure).toBeUndefined();
  });
});
