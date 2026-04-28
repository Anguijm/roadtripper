import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./firestore", () => ({
  listCities: vi.fn(),
  getCity: vi.fn(),
}));
vi.mock("@/lib/routing/cache", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { getAllCities, lookupCity } from "./cities";
import { listCities } from "./firestore";
import { cacheGet, cacheSet } from "@/lib/routing/cache";

const mockListCities = vi.mocked(listCities);
const mockCacheGet = vi.mocked(cacheGet);
const mockCacheSet = vi.mocked(cacheSet);

const CITY_A = {
  id: "las-vegas",
  name: "Las Vegas",
  country: "US",
  region: "Nevada",
  lat: 36.17,
  lng: -115.14,
  tier: "tier1" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getAllCities", () => {
  it("returns cached data without calling listCities on cache hit", async () => {
    mockCacheGet.mockReturnValue([CITY_A]);

    const result = await getAllCities();

    expect(result).toEqual([CITY_A]);
    expect(mockListCities).not.toHaveBeenCalled();
  });

  it("fetches from Firestore and writes to cache on miss", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({ items: [CITY_A], dropped: [] });

    const result = await getAllCities();

    expect(result).toEqual([CITY_A]);
    expect(mockCacheSet).toHaveBeenCalledWith(
      "allCities",
      [CITY_A],
      expect.any(Number)
    );
  });

  it("includes dropped docIds in the warning when some cities fail schema validation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({
      items: [CITY_A],
      dropped: [{ id: "broken-city", reason: "missing lat" }],
    });

    const result = await getAllCities();

    expect(result).toEqual([CITY_A]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("broken-city")
    );
    expect(mockCacheSet).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns static fallback when all cities fail schema validation", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({
      items: [],
      dropped: [{ id: "broken-city", reason: "missing lat" }],
    });

    const result = await getAllCities();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(mockCacheSet).toHaveBeenCalled();
  });

  it("caches and returns empty array for a genuinely empty collection", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({ items: [], dropped: [] });

    const result = await getAllCities();

    expect(result).toEqual([]);
    expect(mockCacheSet).toHaveBeenCalledWith("allCities", [], expect.any(Number));
  });

  it("coalesces concurrent cache-miss requests into a single Firestore read", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({ items: [CITY_A], dropped: [] });

    const [r1, r2] = await Promise.all([getAllCities(), getAllCities()]);

    expect(mockListCities).toHaveBeenCalledTimes(1);
    expect(r1).toEqual([CITY_A]);
    expect(r2).toEqual([CITY_A]);
  });

  it("returns static fallback when listCities throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockRejectedValue(new Error("Firestore unavailable"));

    const result = await getAllCities();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(mockCacheSet).toHaveBeenCalled();
  });
});

describe("lookupCity", () => {
  it("returns city from in-memory cache without calling listCities", async () => {
    mockCacheGet.mockReturnValue([CITY_A]);

    const result = await lookupCity("las-vegas");

    expect(result).toEqual(CITY_A);
    expect(mockListCities).not.toHaveBeenCalled();
  });

  it("loads all cities via getAllCities when cache is cold, never calls getCity directly", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({ items: [CITY_A], dropped: [] });

    const result = await lookupCity("las-vegas");

    expect(result).toEqual(CITY_A);
    expect(mockListCities).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for a city not present in the loaded list", async () => {
    mockCacheGet.mockReturnValue([CITY_A]);

    const result = await lookupCity("unknown-city");

    expect(result).toBeUndefined();
  });
});
