import { describe, it, expect } from "vitest";
import { LatLngSchema, TripInputSchema, totalDays, totalBudgetMinutes } from "./types";

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
  it("returns correct number of days", () => {
    expect(totalDays({ startDate: "2026-06-01", endDate: "2026-06-08" })).toBe(7);
  });

  it("returns 0 for same-day trip", () => {
    expect(totalDays({ startDate: "2026-06-01", endDate: "2026-06-01" })).toBe(0);
  });

  it("returns 1 for overnight trip", () => {
    expect(totalDays({ startDate: "2026-06-01", endDate: "2026-06-02" })).toBe(1);
  });

  it("handles month boundary", () => {
    expect(totalDays({ startDate: "2026-05-28", endDate: "2026-06-04" })).toBe(7);
  });
});

describe("totalBudgetMinutes", () => {
  it("computes correctly for 7-day 8h/day trip", () => {
    expect(
      totalBudgetMinutes({ startDate: "2026-06-01", endDate: "2026-06-08", dailyBudgetHours: 8 })
    ).toBe(7 * 8 * 60);
  });

  it("scales with dailyBudgetHours", () => {
    const base = { startDate: "2026-06-01", endDate: "2026-06-04" };
    expect(totalBudgetMinutes({ ...base, dailyBudgetHours: 4 })).toBe(3 * 4 * 60);
    expect(totalBudgetMinutes({ ...base, dailyBudgetHours: 8 })).toBe(3 * 8 * 60);
  });

  it("returns 0 for same-day trip regardless of budget", () => {
    expect(
      totalBudgetMinutes({ startDate: "2026-06-01", endDate: "2026-06-01", dailyBudgetHours: 8 })
    ).toBe(0);
  });
});
