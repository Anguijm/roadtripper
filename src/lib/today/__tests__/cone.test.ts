import { describe, it, expect } from "vitest";
import { CONE_RATIO, boxAround, coneBox, detourKm, estimateMinutes, inCone } from "@/lib/today/cone";

/** The cone toward a destination (John, 2026-11-10: "Rough cone, no lookup"). Pure geometry, no atlas. */

const DETROIT = { lat: 42.3314, lng: -83.0458 };
const LOUISVILLE = { lat: 38.2527, lng: -85.7585 };
const TOLEDO = { lat: 41.6528, lng: -83.5379 };
const FLINT = { lat: 43.0125, lng: -83.6875 };
const CLEVELAND = { lat: 41.4993, lng: -81.6944 };
const CHICAGO = { lat: 41.8781, lng: -87.6298 };

describe("inCone", () => {
  it("takes a town on the way and refuses one behind you", () => {
    expect(inCone(DETROIT, LOUISVILLE, TOLEDO)).toBe(true);
    // Flint is north of Detroit, heading south: the plain ellipse took it on the first run.
    expect(inCone(DETROIT, LOUISVILLE, FLINT)).toBe(false);
  });

  it("refuses a point just behind the start, which the ellipse alone would take", () => {
    // About 556 km due south; a point 44 km north of the start is inside the
    // ellipse (44 + 600 < 1.25 x 556) but leaves you farther from the destination.
    const from = { lat: 40, lng: -90 };
    const to = { lat: 35, lng: -90 };
    const behind = { lat: 40.4, lng: -90 };
    expect(detourKm(from, to, behind) + 556).toBeLessThan(CONE_RATIO * 556);
    expect(inCone(from, to, behind)).toBe(false);
  });

  it("refuses a place well off to the side", () => {
    expect(inCone(DETROIT, LOUISVILLE, CHICAGO)).toBe(false);
    expect(inCone(DETROIT, LOUISVILLE, CLEVELAND)).toBe(false);
  });

  it("is the ellipse at the ratio: just inside passes, just outside does not", () => {
    // A point at the midpoint's latitude, pushed east until the detour crosses 25 %.
    const mid = { lat: (DETROIT.lat + LOUISVILLE.lat) / 2, lng: (DETROIT.lng + LOUISVILLE.lng) / 2 };
    let inside = mid;
    for (let dLng = 0; dLng < 5; dLng += 0.01) {
      const p = { lat: mid.lat, lng: mid.lng + dLng };
      if (!inCone(DETROIT, LOUISVILLE, p)) break;
      inside = p;
    }
    const straight = detourKm(DETROIT, LOUISVILLE, DETROIT) + 0; // 0, a guard on detourKm's floor
    expect(straight).toBe(0);
    expect(inCone(DETROIT, LOUISVILLE, inside, CONE_RATIO)).toBe(true);
    expect(inCone(DETROIT, LOUISVILLE, { lat: inside.lat, lng: inside.lng + 0.05 }, CONE_RATIO)).toBe(false);
  });

  it("is empty when here is the destination", () => {
    expect(inCone(DETROIT, DETROIT, TOLEDO)).toBe(false);
  });
});

describe("detourKm and estimateMinutes", () => {
  it("is zero on the line and grows off it, never negative", () => {
    expect(detourKm(DETROIT, LOUISVILLE, DETROIT)).toBe(0);
    expect(detourKm(DETROIT, LOUISVILLE, CLEVELAND)).toBeGreaterThan(detourKm(DETROIT, LOUISVILLE, TOLEDO));
  });

  it("turns km into whole minutes at a pace, never negative", () => {
    expect(estimateMinutes(100, 0.74)).toBe(74);
    expect(estimateMinutes(-5, 0.74)).toBe(0);
  });
});

describe("coneBox", () => {
  it("holds every point of the cone within today's reach", () => {
    const reachKm = 400;
    const box = coneBox(DETROIT, LOUISVILLE, reachKm)!;
    for (let lat = 37; lat <= 44; lat += 0.1) {
      for (let lng = -88; lng <= -80; lng += 0.1) {
        const p = { lat, lng };
        const km = Math.hypot((lat - DETROIT.lat) * 111.32, (lng - DETROIT.lng) * 111.32 * Math.cos((DETROIT.lat * Math.PI) / 180));
        if (inCone(DETROIT, LOUISVILLE, p) && km < reachKm * 0.95) {
          expect(lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng).toBe(true);
        }
      }
    }
  });

  it("is a box about a point by km", () => {
    const b = boxAround({ lat: 0, lng: 0 }, 111.32);
    expect(b.maxLat).toBeCloseTo(1, 5);
    expect(b.maxLng).toBeCloseTo(1, 5);
  });
});
