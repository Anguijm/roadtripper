import { describe, it, expect, vi, beforeEach } from "vitest";

const { rateLimitOk } = vi.hoisted(() => ({ rateLimitOk: { value: true } }));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/routing/rate-limit", () => ({
  checkRateLimit: () => ({ ok: rateLimitOk.value, remaining: 10, retryAfterSeconds: 0 }),
  getClientIp: () => "127.0.0.1",
  maybeSweep: vi.fn(),
}));

import { snapOriginAction } from "../snapOrigin";

// Real atlas, real cities: the test is that the wiring reaches SQLite.
const DOWNTOWN_AMARILLO = { lat: 35.2073, lng: -101.8338 };
const MIDDLE_OF_THE_PACIFIC = { lat: 30.0, lng: -150.0 };

describe("snapOriginAction", () => {
  beforeEach(() => { rateLimitOk.value = true; });

  it("snaps a point to its atlas city with the distance", async () => {
    const r = await snapOriginAction(DOWNTOWN_AMARILLO);
    expect(r.ok).toBe(true);
    if (!r.ok || !r.snap) throw new Error("expected a snap");
    expect(r.snap.city.name).toMatch(/^Amarillo/);
    expect(r.snap.distanceKm).toBeLessThan(5);
    expect(r.snap.city).toEqual(expect.objectContaining({ id: expect.any(String), lat: expect.any(Number), lng: expect.any(Number) }));
  });

  it("answers null, not an error, when no city is within reach", async () => {
    expect(await snapOriginAction(MIDDLE_OF_THE_PACIFIC)).toEqual({ ok: true, snap: null });
  });

  it("rejects anything that is not a lat/lng before touching the atlas", async () => {
    for (const bad of [null, {}, { lat: "35", lng: -101 }, { lat: 95, lng: 0 }, { lat: 0, lng: 181 }, "35,-101"]) {
      expect(await snapOriginAction(bad)).toEqual({ ok: false, code: "invalid" });
    }
  });

  it("is rate limited like the plan page", async () => {
    rateLimitOk.value = false;
    expect(await snapOriginAction(DOWNTOWN_AMARILLO)).toEqual({ ok: false, code: "rate_limited" });
  });
});
