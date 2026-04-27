import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./firestore", () => ({
  listCities: vi.fn(),
  getCity: vi.fn(),
}));
vi.mock("@/lib/routing/cache", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

import { getAllCities } from "./cities";
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

  it("warns and caches remaining items when some cities fail schema validation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({
      items: [CITY_A],
      dropped: [{ id: "broken-city", reason: "missing lat" }],
    });

    const result = await getAllCities();

    expect(result).toEqual([CITY_A]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed schema validation")
    );
    expect(mockCacheSet).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws and does not cache when all cities fail schema validation", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValue({
      items: [],
      dropped: [{ id: "broken-city", reason: "missing lat" }],
    });

    await expect(getAllCities()).rejects.toThrow("city list unavailable");
    expect(mockCacheSet).not.toHaveBeenCalled();
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

  it("clears in-flight state after a throw so subsequent calls retry Firestore", async () => {
    mockCacheGet.mockReturnValue(null);
    mockListCities.mockResolvedValueOnce({
      items: [],
      dropped: [{ id: "bad", reason: "x" }],
    });

    await expect(getAllCities()).rejects.toThrow();

    mockListCities.mockResolvedValue({ items: [CITY_A], dropped: [] });
    const result = await getAllCities();

    expect(result).toEqual([CITY_A]);
    expect(mockListCities).toHaveBeenCalledTimes(2);
  });
});
