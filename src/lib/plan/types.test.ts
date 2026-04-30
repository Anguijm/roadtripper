import { describe, it, expect } from "vitest";
import { LatLngSchema, TripInputSchema, TripParamsSchema, MAX_TRIP_DAYS, totalDays, totalBudgetMinutes } from "./types";

const VALID_INPUT = {
  origin: { lat: 34.05, lng: -118.24 },
  originName: "Los Angeles",
  destination: { lat: 40.71, lng: -74.0 },
  destinationName: "New York",
  startDate: "2026-06-01",
  endDate: "2026-06-08",
  dailyBudgetHours: 8,
};

// ── LatLngSchema ─────────────────────────────────────────────────────────────

describe("LatLngSchema", () => {
  it("accepts valid coordinates", () => {
    expect(LatLngSchema.safeParse({ lat: 34.05, lng: -118.24 }).success).toBe(true);
  });

  it("accepts boundary values", () => {
    expect(LatLngSchema.safeParse({ lat: 90, lng: 180 }).success).toBe(true);
    expect(LatLngSchema.safeParse({ lat: -90, lng: -180 }).success).toBe(true);
  });

  it("rejects lat > 90", () => {
    expect(LatLngSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
  });

  it("rejects lat < -90", () => {
    expect(LatLngSchema.safeParse({ lat: -91, lng: 0 }).success).toBe(false);
  });

  it("rejects lng > 180", () => {
    expect(LatLngSchema.safeParse({ lat: 0, lng: 181 }).success).toBe(false);
  });

  it("rejects lng < -180", () => {
    expect(LatLngSchema.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
  });

  it("rejects non-numbers", () => {
    expect(LatLngSchema.safeParse({ lat: "34", lng: -118 }).success).toBe(false);
  });
});

// ── TripInputSchema ───────────────────────────────────────────────────────────

describe("TripInputSchema", () => {
  it("accepts valid input", () => {
    expect(TripInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it("accepts same start and end date", () => {
    const input = { ...VALID_INPUT, endDate: "2026-06-01" };
    expect(TripInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects startDate after endDate", () => {
    const input = { ...VALID_INPUT, startDate: "2026-06-10", endDate: "2026-06-01" };
    const result = TripInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("endDate"))).toBe(true);
    }
  });

  it("rejects non-ISO date strings", () => {
    const input = { ...VALID_INPUT, startDate: "June 1 2026" };
    expect(TripInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects dailyBudgetHours below 1", () => {
    expect(TripInputSchema.safeParse({ ...VALID_INPUT, dailyBudgetHours: 0 }).success).toBe(false);
  });

  it("rejects dailyBudgetHours above 16", () => {
    expect(TripInputSchema.safeParse({ ...VALID_INPUT, dailyBudgetHours: 17 }).success).toBe(false);
  });

  it("rejects non-integer dailyBudgetHours", () => {
    expect(TripInputSchema.safeParse({ ...VALID_INPUT, dailyBudgetHours: 4.5 }).success).toBe(false);
  });

  it("rejects empty originName", () => {
    expect(TripInputSchema.safeParse({ ...VALID_INPUT, originName: "" }).success).toBe(false);
  });
});

// ── Date math ─────────────────────────────────────────────────────────────────

describe("totalDays", () => {
  it("counts both start and end date (June 1–8 = 8 days)", () => {
    expect(totalDays({ startDate: "2026-06-01", endDate: "2026-06-08" })).toBe(8);
  });

  it("returns 1 for same-day trip", () => {
    expect(totalDays({ startDate: "2026-06-01", endDate: "2026-06-01" })).toBe(1);
  });

  it("returns 2 for consecutive-day trip", () => {
    expect(totalDays({ startDate: "2026-06-01", endDate: "2026-06-02" })).toBe(2);
  });

  it("handles month boundary", () => {
    expect(totalDays({ startDate: "2026-05-28", endDate: "2026-06-04" })).toBe(8);
  });

  it("handles year boundary", () => {
    expect(totalDays({ startDate: "2026-12-31", endDate: "2027-01-01" })).toBe(2);
  });

  it("handles US spring-forward DST boundary (Mar 8 2026)", () => {
    // Clocks spring forward at 2 AM on Mar 8 — UTC parsing must not lose a day.
    expect(totalDays({ startDate: "2026-03-07", endDate: "2026-03-15" })).toBe(9);
  });
});

describe("totalBudgetMinutes", () => {
  it("computes correctly for 8-day 8h/day trip", () => {
    expect(
      totalBudgetMinutes({ startDate: "2026-06-01", endDate: "2026-06-08", dailyBudgetHours: 8 })
    ).toBe(8 * 8 * 60);
  });

  it("scales with dailyBudgetHours", () => {
    const base = { startDate: "2026-06-01", endDate: "2026-06-04" }; // 4 days
    expect(totalBudgetMinutes({ ...base, dailyBudgetHours: 4 })).toBe(4 * 4 * 60);
    expect(totalBudgetMinutes({ ...base, dailyBudgetHours: 8 })).toBe(4 * 8 * 60);
  });

  it("returns daily budget for same-day trip", () => {
    expect(
      totalBudgetMinutes({ startDate: "2026-06-01", endDate: "2026-06-01", dailyBudgetHours: 8 })
    ).toBe(1 * 8 * 60);
  });
});

// ── TripParamsSchema ──────────────────────────────────────────────────────────

const VALID_PARAMS = { startDate: "2026-06-01", endDate: "2026-06-08", dailyBudgetHours: 8 };

describe("TripParamsSchema", () => {
  it("accepts valid params", () => {
    expect(TripParamsSchema.safeParse(VALID_PARAMS).success).toBe(true);
  });

  it("accepts a trip of exactly MAX_TRIP_DAYS", () => {
    // Start 2026-06-01, add MAX_TRIP_DAYS-1 days to get the inclusive end date.
    const end = new Date("2026-06-01T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + MAX_TRIP_DAYS - 1);
    const endDate = end.toISOString().slice(0, 10);
    expect(TripParamsSchema.safeParse({ ...VALID_PARAMS, startDate: "2026-06-01", endDate }).success).toBe(true);
  });

  it("rejects a trip of MAX_TRIP_DAYS + 1", () => {
    const end = new Date("2026-06-01T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + MAX_TRIP_DAYS);
    const endDate = end.toISOString().slice(0, 10);
    const result = TripParamsSchema.safeParse({ ...VALID_PARAMS, startDate: "2026-06-01", endDate });
    expect(result.success).toBe(false);
  });

  it("accepts a valid leap day (2024-02-29)", () => {
    expect(
      TripParamsSchema.safeParse({ ...VALID_PARAMS, startDate: "2024-02-28", endDate: "2024-02-29" }).success
    ).toBe(true);
  });

  it("rejects an invalid leap day (2025-02-29)", () => {
    expect(
      TripParamsSchema.safeParse({ ...VALID_PARAMS, startDate: "2025-02-28", endDate: "2025-02-29" }).success
    ).toBe(false);
  });

  it("rejects startDate after endDate", () => {
    const result = TripParamsSchema.safeParse({ ...VALID_PARAMS, startDate: "2026-06-10", endDate: "2026-06-01" });
    expect(result.success).toBe(false);
  });

  it("rejects dailyBudgetHours out of range", () => {
    expect(TripParamsSchema.safeParse({ ...VALID_PARAMS, dailyBudgetHours: 0 }).success).toBe(false);
    expect(TripParamsSchema.safeParse({ ...VALID_PARAMS, dailyBudgetHours: 17 }).success).toBe(false);
  });
});
