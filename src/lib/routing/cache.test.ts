import { describe, it, expect } from "vitest";
import { neighborhoodsCacheKey, waypointsCacheKey, candidateCacheKey } from "./cache";

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
});
