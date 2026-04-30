import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/urban-explorer/cities", () => ({
  getAllCities: vi.fn(),
}));
vi.mock("./cache", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  radialCacheKey: vi.fn().mockReturnValue("radial:test-key"),
}));

import {
  bearingDeg,
  snapToCompassPoint,
  bearingFromCompassPoint,
  withinSemicircle,
  findCitiesInRadius,
} from "./radial";
import { getAllCities } from "@/lib/urban-explorer/cities";
import { cacheGet, cacheSet } from "./cache";

const mockGetAllCities = vi.mocked(getAllCities);
const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);

// ── bearingDeg ────────────────────────────────────────────────────────────────

describe("bearingDeg", () => {
  it("returns ~0 (north) when destination is directly north", () => {
    const bearing = bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(bearing).toBeCloseTo(0, 0);
  });

  it("returns ~90 (east) when destination is directly east", () => {
    const bearing = bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(bearing).toBeCloseTo(90, 0);
  });

  it("returns ~180 (south) when destination is directly south", () => {
    const bearing = bearingDeg({ lat: 1, lng: 0 }, { lat: 0, lng: 0 });
    expect(bearing).toBeCloseTo(180, 0);
  });

  it("returns ~270 (west) when destination is directly west", () => {
    const bearing = bearingDeg({ lat: 0, lng: 1 }, { lat: 0, lng: 0 });
    expect(bearing).toBeCloseTo(270, 0);
  });

  it("returns a value in [0, 360)", () => {
    const b = bearingDeg({ lat: 34.05, lng: -118.24 }, { lat: 40.71, lng: -74.0 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  it("LA to NY is roughly northeast (~66°)", () => {
    // LA: 34.05°N 118.24°W  →  NY: 40.71°N 74.00°W
    const b = bearingDeg({ lat: 34.05, lng: -118.24 }, { lat: 40.71, lng: -74.0 });
    expect(b).toBeGreaterThan(50);
    expect(b).toBeLessThan(90);
  });
});

// ── snapToCompassPoint ────────────────────────────────────────────────────────

describe("snapToCompassPoint", () => {
  it("snaps 0° to N", () => expect(snapToCompassPoint(0)).toBe("N"));
  it("snaps 45° to NE", () => expect(snapToCompassPoint(45)).toBe("NE"));
  it("snaps 90° to E", () => expect(snapToCompassPoint(90)).toBe("E"));
  it("snaps 135° to SE", () => expect(snapToCompassPoint(135)).toBe("SE"));
  it("snaps 180° to S", () => expect(snapToCompassPoint(180)).toBe("S"));
  it("snaps 225° to SW", () => expect(snapToCompassPoint(225)).toBe("SW"));
  it("snaps 270° to W", () => expect(snapToCompassPoint(270)).toBe("W"));
  it("snaps 315° to NW", () => expect(snapToCompassPoint(315)).toBe("NW"));

  it("snaps 22° to N (closer to N than NE)", () => expect(snapToCompassPoint(22)).toBe("N"));
  it("snaps 23° to NE (closer to NE than N)", () => expect(snapToCompassPoint(23)).toBe("NE"));
  it("snaps 359° to N (wraps from NW back to N)", () => expect(snapToCompassPoint(359)).toBe("N"));
  it("snaps 360° to N (same as 0°)", () => expect(snapToCompassPoint(360)).toBe("N"));

  it("handles bearing > 360 by wrapping", () => {
    expect(snapToCompassPoint(405)).toBe("NE"); // 405 mod 360 = 45
  });
});

// ── bearingFromCompassPoint ───────────────────────────────────────────────────

describe("bearingFromCompassPoint", () => {
  it("returns correct bearing for each compass point", () => {
    expect(bearingFromCompassPoint("N")).toBe(0);
    expect(bearingFromCompassPoint("NE")).toBe(45);
    expect(bearingFromCompassPoint("E")).toBe(90);
    expect(bearingFromCompassPoint("SE")).toBe(135);
    expect(bearingFromCompassPoint("S")).toBe(180);
    expect(bearingFromCompassPoint("SW")).toBe(225);
    expect(bearingFromCompassPoint("W")).toBe(270);
    expect(bearingFromCompassPoint("NW")).toBe(315);
  });

  it("round-trips through snapToCompassPoint", () => {
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const cp = snapToCompassPoint(bearing);
      expect(bearingFromCompassPoint(cp)).toBe(bearing);
    }
  });
});

// ── withinSemicircle ──────────────────────────────────────────────────────────

describe("withinSemicircle", () => {
  const origin = { lat: 0, lng: 0 };

  it("city directly ahead (0° diff from heading) is inside", () => {
    // heading N (0°), city due north
    expect(withinSemicircle({ lat: 1, lng: 0 }, origin, 0)).toBe(true);
  });

  it("city exactly 90° off heading is on the boundary (inside)", () => {
    // heading N (0°), city due east (90°) → diff = 90 → inside
    expect(withinSemicircle({ lat: 0, lng: 1 }, origin, 0)).toBe(true);
  });

  it("city exactly 90° off heading on the other side is inside", () => {
    // heading N (0°), city due west (270°) → diff = |270-0|=270, 360-270=90 → inside
    expect(withinSemicircle({ lat: 0, lng: -1 }, origin, 0)).toBe(true);
  });

  it("city behind (180° from heading) is outside", () => {
    // heading N (0°), city due south (180°) → diff = 180 → outside
    expect(withinSemicircle({ lat: -1, lng: 0 }, origin, 0)).toBe(false);
  });

  it("city slightly behind (91° off heading) is outside", () => {
    // heading N (0°), city at bearing 91° → diff = 91 → outside
    // Create a city bearing ~91° east-slightly-south
    expect(withinSemicircle({ lat: -0.01, lng: 1 }, origin, 0)).toBe(false);
  });

  it("handles heading 270 (west) correctly", () => {
    // heading W (270°), city due west → inside
    expect(withinSemicircle({ lat: 0, lng: -1 }, origin, 270)).toBe(true);
    // heading W (270°), city due east (90°) → diff = |90-270| = 180 → outside
    expect(withinSemicircle({ lat: 0, lng: 1 }, origin, 270)).toBe(false);
  });

  it("handles 0°/360° wrap for heading near north", () => {
    // heading N (0°), city at bearing 350° (NNW) → diff = |350-0|=350, 360-350=10 → inside
    const cityNNW = { lat: Math.cos((350 * Math.PI) / 180), lng: Math.sin((350 * Math.PI) / 180) };
    expect(withinSemicircle(cityNNW, origin, 0)).toBe(true);
  });
});

// ── findCitiesInRadius ────────────────────────────────────────────────────────

const LAS_VEGAS = {
  id: "las-vegas",
  name: "Las Vegas",
  country: "US",
  region: "Nevada",
  lat: 36.17,
  lng: -115.14,
  tier: "tier1" as const,
};

const PORTLAND = {
  id: "portland",
  name: "Portland",
  country: "US",
  region: "Oregon",
  lat: 45.52,
  lng: -122.68,
  tier: "tier2" as const,
};

const LA = { lat: 34.05, lng: -118.24 };
const NY = { lat: 40.71, lng: -74.0 };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_MAPS_KEY = "test-api-key";
});

describe("findCitiesInRadius", () => {
  it("returns cached result without calling getAllCities", async () => {
    const cached = [{ city: LAS_VEGAS, driveMinutes: 30 }];
    mockCacheGet.mockReturnValue(cached);

    const result = await findCitiesInRadius(LA, NY, 60);

    expect(result).toBe(cached);
    expect(mockGetAllCities).not.toHaveBeenCalled();
  });

  it("calls getAllCities and fetch on cache miss, caches result", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 0,
            condition: "ROUTE_EXISTS",
            duration: "1800s", // 30 min
          },
        ]),
        { status: 200 }
      )
    );

    const result = await findCitiesInRadius(LA, NY, 60);

    expect(result).toHaveLength(1);
    expect(result[0].city.id).toBe("las-vegas");
    expect(result[0].driveMinutes).toBeCloseTo(30, 1);
    expect(mockCacheSet).toHaveBeenCalledOnce();
  });

  it("excludes cities outside the drive budget", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 0,
            condition: "ROUTE_EXISTS",
            duration: "7200s", // 120 min
          },
        ]),
        { status: 200 }
      )
    );

    // maxMinutes = 60, city is 120 min away — should be excluded even after 2 retries
    const result = await findCitiesInRadius(LA, NY, 60);

    // 60 + 15 + 15 = 90 min max after retries — city at 120 min still excluded
    expect(result).toHaveLength(0);
  });

  it("expands threshold via retry when initial bucket is empty", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 0,
            condition: "ROUTE_EXISTS",
            duration: "4200s", // 70 min
          },
        ]),
        { status: 200 }
      )
    );

    // maxMinutes = 60; first retry expands to 75 → city at 70 min is included
    const result = await findCitiesInRadius(LA, NY, 60);

    expect(result).toHaveLength(1);
    expect(result[0].driveMinutes).toBeCloseTo(70, 1);
  });

  it("throws on API error (non-200 response)", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );

    await expect(findCitiesInRadius(LA, NY, 60)).rejects.toThrow(
      "Route matrix API returned 503"
    );
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("throws when API returns unexpected shape", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad request" } }), {
        status: 200,
      })
    );

    await expect(findCitiesInRadius(LA, NY, 60)).rejects.toThrow(
      "Route matrix API returned unexpected shape"
    );
  });

  it("skips cities with condition !== ROUTE_EXISTS", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 0,
            condition: "ROUTE_NOT_FOUND",
            duration: "1800s",
          },
        ]),
        { status: 200 }
      )
    );

    const result = await findCitiesInRadius(LA, NY, 60);
    expect(result).toHaveLength(0);
  });

  it("skips fetch when semicircle filter leaves no cities", async () => {
    mockCacheGet.mockReturnValue(null);
    // Origin at (0,0), destination to the east at (0,10) → heading ≈ E (90°).
    // A city due west at (0,-1) has bearing 270° from origin; diff = |270-90|=180 > 90 → excluded.
    const cityBehind = {
      id: "city-behind",
      name: "Behind City",
      country: "US",
      region: "Test",
      lat: 0,
      lng: -1,
      tier: "tier3" as const,
    };
    mockGetAllCities.mockResolvedValue([cityBehind]);

    const fetchSpy = vi.spyOn(global, "fetch");

    const result = await findCitiesInRadius({ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, 60);

    expect(result).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns results sorted by driveMinutes ascending", async () => {
    mockCacheGet.mockReturnValue(null);
    mockGetAllCities.mockResolvedValue([LAS_VEGAS, PORTLAND]);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            originIndex: 0,
            destinationIndex: 1,
            condition: "ROUTE_EXISTS",
            duration: "1200s", // 20 min — PORTLAND (index 1 in semicircle list)
          },
          {
            originIndex: 0,
            destinationIndex: 0,
            condition: "ROUTE_EXISTS",
            duration: "3600s", // 60 min — LAS_VEGAS (index 0)
          },
        ]),
        { status: 200 }
      )
    );

    const result = await findCitiesInRadius(LA, NY, 120);

    // Both within budget — verify ascending sort
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].driveMinutes).toBeGreaterThanOrEqual(result[i - 1].driveMinutes);
    }
  });
});
