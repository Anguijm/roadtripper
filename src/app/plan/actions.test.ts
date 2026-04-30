import { describe, test, expect, vi, beforeEach } from "vitest";

const { checkDailyQuotaMock, isQuotaDuplicateMock, markQuotaRequestIdMock } = vi.hoisted(() => {
  const checkDailyQuotaMock = vi.fn(() => ({
    ok: true as const,
    remaining: 5,
    retryAfterSeconds: 0,
  }));
  const isQuotaDuplicateMock = vi.fn((_ip: string, _requestId: string) => false);
  const markQuotaRequestIdMock = vi.fn();
  return { checkDailyQuotaMock, isQuotaDuplicateMock, markQuotaRequestIdMock };
});

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/routing/directions", () => ({
  computeRouteWithStops: vi.fn().mockResolvedValue({
    encodedPolyline: "abc",
    bounds: { northeast: { lat: 1, lng: 1 }, southwest: { lat: 0, lng: 0 } },
    totalDistanceMeters: 500_000,
    totalDurationSeconds: 18_000,
    legs: [],
  }),
  RoutesApiError: class RoutesApiError extends Error {},
}));

vi.mock("@/lib/routing/radial", () => ({
  findCitiesInRadius: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/routing/recommend", () => ({
  fetchWaypointsForCandidates: vi.fn().mockResolvedValue({
    status: "fresh",
    cities: [],
    waypoints: [],
    neighborhoods: {},
  }),
}));

vi.mock("@/lib/routing/rate-limit", () => ({
  checkRateLimit: () => ({ ok: true, remaining: 10, retryAfterSeconds: 0 }),
  checkDailyQuota: (...args: unknown[]) => checkDailyQuotaMock(...(args as [])),
  checkRecomputeSpacing: () => ({ ok: true, remaining: 0, retryAfterSeconds: 0 }),
  getClientIp: () => "127.0.0.1",
  maybeSweep: vi.fn(),
  isQuotaDuplicate: (...args: [string, string]) => isQuotaDuplicateMock(...args),
  markQuotaRequestId: (...args: [string, string]) => markQuotaRequestIdMock(...args),
}));

import { recomputeAndRefreshAction } from "./actions";

const VALID_ORIGIN = { lat: 37.77, lng: -122.42 };
const VALID_DEST = { lat: 34.05, lng: -118.24 };
const VALID_REQUEST_ID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const VALID_REQUEST_ID_2 = "b2c3d4e5-f6a7-4b8c-9d0e-1a2b3c4d5e6f";

describe("recomputeAndRefreshAction — idempotency", () => {
  beforeEach(() => {
    checkDailyQuotaMock.mockClear();
    isQuotaDuplicateMock.mockClear();
    markQuotaRequestIdMock.mockClear();
    isQuotaDuplicateMock.mockReturnValue(false);
  });

  test("first call with requestId consumes quota and marks it seen", async () => {
    const result = await recomputeAndRefreshAction(
      VALID_ORIGIN, VALID_DEST, [], 8, undefined, VALID_REQUEST_ID
    );
    expect(result.ok).toBe(true);
    expect(checkDailyQuotaMock).toHaveBeenCalledTimes(1);
    expect(markQuotaRequestIdMock).toHaveBeenCalledWith("127.0.0.1", VALID_REQUEST_ID);
  });

  test("second call with the same requestId skips quota decrement", async () => {
    isQuotaDuplicateMock
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8, undefined, VALID_REQUEST_ID);
    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8, undefined, VALID_REQUEST_ID);

    expect(checkDailyQuotaMock).toHaveBeenCalledTimes(1);
  });

  test("different requestId always consumes quota", async () => {
    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8, undefined, VALID_REQUEST_ID);
    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8, undefined, VALID_REQUEST_ID_2);
    expect(checkDailyQuotaMock).toHaveBeenCalledTimes(2);
  });

  test("call without requestId always consumes quota", async () => {
    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8);
    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8);
    expect(checkDailyQuotaMock).toHaveBeenCalledTimes(2);
    expect(markQuotaRequestIdMock).not.toHaveBeenCalled();
  });

  test("malformed requestId is ignored and quota is consumed", async () => {
    await recomputeAndRefreshAction(VALID_ORIGIN, VALID_DEST, [], 8, undefined, "not-a-uuid");
    expect(checkDailyQuotaMock).toHaveBeenCalledTimes(1);
    expect(markQuotaRequestIdMock).not.toHaveBeenCalled();
  });
});
