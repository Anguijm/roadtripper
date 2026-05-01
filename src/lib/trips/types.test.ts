import { describe, it, expect } from "vitest";
import { SaveTripInputSchema, SavedTripStopSchema } from "./types";

// ── SavedTripStopSchema ───────────────────────────────────────────────────────

describe("SavedTripStopSchema", () => {
  const valid = { cityId: "okc", cityName: "Oklahoma City", lat: 35.46, lng: -97.51 };

  it("accepts a valid stop", () => {
    expect(SavedTripStopSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty cityId", () => {
    expect(SavedTripStopSchema.safeParse({ ...valid, cityId: "" }).success).toBe(false);
  });

  it("rejects lat out of range", () => {
    expect(SavedTripStopSchema.safeParse({ ...valid, lat: 91 }).success).toBe(false);
    expect(SavedTripStopSchema.safeParse({ ...valid, lat: -91 }).success).toBe(false);
  });

  it("rejects lng out of range", () => {
    expect(SavedTripStopSchema.safeParse({ ...valid, lng: 181 }).success).toBe(false);
    expect(SavedTripStopSchema.safeParse({ ...valid, lng: -181 }).success).toBe(false);
  });
});

// ── SaveTripInputSchema ───────────────────────────────────────────────────────

describe("SaveTripInputSchema", () => {
  const validStop = { cityId: "okc", cityName: "Oklahoma City", lat: 35.46, lng: -97.51 };
  const valid = {
    fromName: "Dallas, TX",
    toName: "Chicago, IL",
    fromLat: 32.77,
    fromLng: -96.79,
    toLat: 41.88,
    toLng: -87.62,
    budgetHours: 5,
    personaId: "adventurer",
    stops: [validStop],
  };

  it("accepts a valid input with no dates", () => {
    expect(SaveTripInputSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts valid dates", () => {
    const result = SaveTripInputSchema.safeParse({
      ...valid,
      startDate: "2026-06-01",
      endDate: "2026-06-07",
    });
    expect(result.success).toBe(true);
  });

  it("rejects budgetHours = 0", () => {
    expect(SaveTripInputSchema.safeParse({ ...valid, budgetHours: 0 }).success).toBe(false);
  });

  it("rejects budgetHours > 24", () => {
    expect(SaveTripInputSchema.safeParse({ ...valid, budgetHours: 25 }).success).toBe(false);
  });

  it("rejects non-integer budgetHours", () => {
    expect(SaveTripInputSchema.safeParse({ ...valid, budgetHours: 4.5 }).success).toBe(false);
  });

  it("rejects more than 7 stops", () => {
    const tooMany = Array(8).fill(validStop);
    expect(SaveTripInputSchema.safeParse({ ...valid, stops: tooMany }).success).toBe(false);
  });

  it("accepts 0 stops (trip not yet started)", () => {
    expect(SaveTripInputSchema.safeParse({ ...valid, stops: [] }).success).toBe(true);
  });

  it("rejects empty fromName", () => {
    expect(SaveTripInputSchema.safeParse({ ...valid, fromName: "" }).success).toBe(false);
  });

  it("rejects invalid startDate format", () => {
    expect(
      SaveTripInputSchema.safeParse({ ...valid, startDate: "not-a-date" }).success
    ).toBe(false);
  });
});
