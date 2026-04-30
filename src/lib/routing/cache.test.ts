import { describe, it, expect } from "vitest";
import { neighborhoodsCacheKey, waypointsCacheKey, candidateCacheKey, radialCacheKey } from "./cache";

describe("neighborhoodsCacheKey", () => {
  it("returns a string with the neighborhoods: prefix", () => {
    expect(neighborhoodsCacheKey("las-vegas")).toMatch(/^neighborhoods:/);
  });

  it("is deterministic for the same input", () => {
    expect(neighborhoodsCacheKey("las-vegas")).toBe(neighborhoodsCacheKey("las-vegas"));
  });

  it("produces distinct keys for distinct city ids", () => {
    expect(neighborhoodsCacheKey("las-vegas")).not.toBe(neighborhoodsCacheKey("portland"));
  });

  it("hash portion is 16 hex characters", () => {
    const key = neighborhoodsCacheKey("las-vegas");
    const hash = key.replace("neighborhoods:", "");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("waypointsCacheKey", () => {
  it("returns a string with the waypoints: prefix", () => {
    expect(waypointsCacheKey(["las-vegas"])).toMatch(/^waypoints:/);
  });

  it("hash portion is 16 hex characters", () => {
    const key = waypointsCacheKey(["las-vegas"]);
    const hash = key.replace("waypoints:", "");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is order-independent — same set different order → same key", () => {
    expect(waypointsCacheKey(["a", "b", "c"])).toBe(waypointsCacheKey(["c", "a", "b"]));
  });

  it("deduplicates repeated city ids", () => {
    expect(waypointsCacheKey(["las-vegas", "las-vegas"])).toBe(
      waypointsCacheKey(["las-vegas"])
    );
  });

  it("produces distinct keys for distinct city sets", () => {
    expect(waypointsCacheKey(["las-vegas"])).not.toBe(waypointsCacheKey(["portland"]));
  });
});

describe("candidateCacheKey", () => {
  it("returns a string with the candidates: prefix", () => {
    expect(candidateCacheKey("abc123", 30)).toMatch(/^candidates:/);
  });

  it("hash portion is 16 hex characters", () => {
    const key = candidateCacheKey("abc123", 30);
    const hash = key.replace("candidates:", "");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    expect(candidateCacheKey("abc123", 30)).toBe(candidateCacheKey("abc123", 30));
  });

  it("produces distinct keys for different polylines", () => {
    expect(candidateCacheKey("abc123", 30)).not.toBe(candidateCacheKey("xyz789", 30));
  });

  it("produces distinct keys for different detour values", () => {
    expect(candidateCacheKey("abc123", 30)).not.toBe(candidateCacheKey("abc123", 60));
  });

  it("handles an empty polyline without throwing", () => {
    expect(() => candidateCacheKey("", 0)).not.toThrow();
    expect(candidateCacheKey("", 0)).toMatch(/^candidates:[0-9a-f]{16}$/);
  });

  it("handles a Unicode polyline without throwing", () => {
    // Encoded polylines are ASCII in practice; this guards the surrogate-pair edge case
    expect(() => candidateCacheKey("🗺️route", 30)).not.toThrow();
  });
});

describe("radialCacheKey", () => {
  it("returns a string with the radial: prefix", () => {
    expect(radialCacheKey(34.05, -118.24, 60, "NE")).toMatch(/^radial:/);
  });

  it("hash portion is 16 hex characters", () => {
    const key = radialCacheKey(34.05, -118.24, 60, "NE");
    const hash = key.replace("radial:", "");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    expect(radialCacheKey(34.05, -118.24, 60, "NE")).toBe(
      radialCacheKey(34.05, -118.24, 60, "NE")
    );
  });

  it("produces distinct keys for different compass points", () => {
    expect(radialCacheKey(34.05, -118.24, 60, "NE")).not.toBe(
      radialCacheKey(34.05, -118.24, 60, "SW")
    );
  });

  it("produces distinct keys for different max budgets", () => {
    expect(radialCacheKey(34.05, -118.24, 60, "NE")).not.toBe(
      radialCacheKey(34.05, -118.24, 90, "NE")
    );
  });

  it("rounds lat/lng to 3dp so nearby origins share a key", () => {
    // 34.050001 and 34.050499 both round to 34.050
    expect(radialCacheKey(34.050001, -118.24, 60, "NE")).toBe(
      radialCacheKey(34.050499, -118.24, 60, "NE")
    );
  });

  it("different origins that differ beyond 3dp get distinct keys", () => {
    expect(radialCacheKey(34.050, -118.24, 60, "NE")).not.toBe(
      radialCacheKey(34.051, -118.24, 60, "NE")
    );
  });

  it("namespace does not collide with candidates: prefix", () => {
    const radial = radialCacheKey(34.05, -118.24, 60, "NE");
    const candidate = candidateCacheKey("abc123", 60);
    expect(radial.startsWith("radial:")).toBe(true);
    expect(candidate.startsWith("candidates:")).toBe(true);
  });
});

describe("waypointsCacheKey — edge cases", () => {
  it("handles an empty city id list without throwing", () => {
    expect(() => waypointsCacheKey([])).not.toThrow();
    expect(waypointsCacheKey([])).toMatch(/^waypoints:[0-9a-f]{16}$/);
  });

  it("distinguishes city ids that contain commas from multi-element sets", () => {
    // structured JSON means ['a,b','c'] and ['a','b,c'] produce different keys
    expect(waypointsCacheKey(["a,b", "c"])).not.toBe(waypointsCacheKey(["a", "b,c"]));
  });

  it("handles Unicode city ids without throwing", () => {
    expect(() => waypointsCacheKey(["montréal", "québec"])).not.toThrow();
  });
});
