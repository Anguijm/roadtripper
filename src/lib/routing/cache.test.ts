import { describe, it, expect } from "vitest";
import { neighborhoodsCacheKey, waypointsCacheKey } from "./cache";

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
