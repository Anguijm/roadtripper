import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebaseAdmin", () => ({
  urbanExplorerDb: { collection: vi.fn() },
}));

vi.mock("./cache", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  waypointsCacheKey: vi.fn().mockReturnValue("waypoints:test-key"),
  neighborhoodsCacheKey: vi.fn().mockReturnValue("nbhd:test-key"),
}));

import { fetchWaypointsForCandidates } from "./recommend";
import { cacheGet, cacheSet } from "./cache";
import type { RadialCandidate } from "./radial";
import type { City } from "@/lib/urban-explorer/types";

const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);

function makeCity(id: string, lat: number, lng: number): City {
  return { id, name: id, lat, lng, country: "US", region: "CA", tier: "tier1" } as City;
}

function makeCandidate(id: string, lat: number, lng: number): RadialCandidate {
  return { city: makeCity(id, lat, lng), oneWayDriveMinutes: 30 };
}

describe("fetchWaypointsForCandidates — cache staleness filter", () => {
  beforeEach(() => {
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
  });

  test("cache hit: only returns cities present in current candidates", async () => {
    const candidateA = makeCandidate("city-a", 37.0, -122.0);

    // Cache contains city-a AND a stale city-b not in current candidates.
    mockCacheGet.mockReturnValueOnce({
      cities: [
        { id: "city-a", name: "city-a", detourMinutes: 60, lat: 37.0, lng: -122.0, vibeClass: null },
        { id: "city-b", name: "city-b", detourMinutes: 90, lat: 36.0, lng: -121.0, vibeClass: null },
      ],
      waypoints: [],
    });

    const result = await fetchWaypointsForCandidates([candidateA]);

    expect(result.status).toBe("fresh");
    expect(result.cities.map((c) => c.id)).toEqual(["city-a"]);
    expect(result.cities).not.toContainEqual(expect.objectContaining({ id: "city-b" }));
  });

  test("cache hit: detourMinutes re-derived from current candidate, not stale cache value", async () => {
    const candidateA = makeCandidate("city-a", 37.0, -122.0);
    // oneWayDriveMinutes = 30 → expected detourMinutes = 60

    mockCacheGet.mockReturnValueOnce({
      cities: [
        { id: "city-a", name: "city-a", detourMinutes: 999, lat: 37.0, lng: -122.0, vibeClass: null },
      ],
      waypoints: [],
    });

    const result = await fetchWaypointsForCandidates([candidateA]);
    expect(result.cities[0]?.detourMinutes).toBe(60); // 30 * 2
  });
});
