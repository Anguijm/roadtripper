import { describe, it, expect } from "vitest";
import {
  legsTotalMinutes,
  remainingBudgetMinutes,
  computeTripStatus,
  buildTripState,
  appendLeg,
  computeDeadlinePressure,
  WARNING_BUFFER_MINUTES,
  type TripLeg,
  type TripStatus,
} from "./trip-state";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function leg(durationSeconds: number, distanceMeters = 100_000): TripLeg {
  return { originCityId: "a", destinationCityId: "b", durationSeconds, distanceMeters };
}

const LEG_60 = leg(3_600);   // exactly 60 min
const LEG_30 = leg(1_800);   // exactly 30 min
const LEG_90 = leg(5_400);   // exactly 90 min

// ── legsTotalMinutes ──────────────────────────────────────────────────────────

describe("legsTotalMinutes", () => {
  it("returns 0 for empty leg list", () => {
    expect(legsTotalMinutes([])).toBe(0);
  });

  it("converts durationSeconds to minutes for a single leg", () => {
    expect(legsTotalMinutes([LEG_60])).toBe(60);
  });

  it("sums multiple legs", () => {
    expect(legsTotalMinutes([LEG_60, LEG_30])).toBe(90);
  });

  it("handles fractional seconds correctly", () => {
    expect(legsTotalMinutes([leg(90)])).toBeCloseTo(1.5);
  });
});

// ── remainingBudgetMinutes ────────────────────────────────────────────────────

describe("remainingBudgetMinutes", () => {
  it("equals total budget when no legs have been added", () => {
    expect(remainingBudgetMinutes([], 480)).toBe(480);
  });

  it("subtracts accumulated leg time from total budget", () => {
    expect(remainingBudgetMinutes([LEG_60, LEG_30], 480)).toBe(390);
  });

  it("returns a negative value when legs exceed total budget", () => {
    expect(remainingBudgetMinutes([LEG_90], 60)).toBe(-30);
  });
});

// ── computeTripStatus ─────────────────────────────────────────────────────────

describe("computeTripStatus", () => {
  it("returns 'empty' when no legs", () => {
    const status = computeTripStatus([], 480, 60);
    expect(status.kind).toBe("empty");
  });

  it("returns 'in_progress' when budget is comfortable", () => {
    // 60 min spent → 420 remaining; 60 min to dest → buffer gap = 360 > 30
    const status = computeTripStatus([LEG_60], 480, 60) as Extract<TripStatus, { kind: "in_progress" }>;
    expect(status.kind).toBe("in_progress");
    expect(status.remainingBudgetMinutes).toBeCloseTo(420);
    expect(status.directMinutesToDestination).toBe(60);
  });

  it("returns 'warning' when remaining barely covers destination + buffer", () => {
    // 60 min spent → 60 remaining; 50 min to dest → 60 - 50 = 10 ≤ WARNING_BUFFER_MINUTES (30)
    const status = computeTripStatus([LEG_60], 120, 50) as Extract<TripStatus, { kind: "warning" }>;
    expect(status.kind).toBe("warning");
    expect(status.remainingBudgetMinutes).toBeCloseTo(60);
    expect(status.directMinutesToDestination).toBe(50);
  });

  it("returns 'warning' at the exact buffer boundary", () => {
    // 60 min spent → 90 remaining; 60 min to dest → 90 - 60 = 30 = WARNING_BUFFER_MINUTES exactly
    const status = computeTripStatus([LEG_60], 150, 60);
    expect(status.kind).toBe("warning");
  });

  it("returns 'in_progress' just above the buffer boundary", () => {
    // remaining - direct = 31 > 30
    const status = computeTripStatus([LEG_60], 151, 60);
    expect(status.kind).toBe("in_progress");
  });

  it("returns 'warning' when remaining is positive but insufficient to reach destination", () => {
    // 60 min spent → 50 remaining; 60 min to dest → remaining - direct = -10 ≤ 30 → warning
    const status = computeTripStatus([LEG_60], 110, 60) as Extract<TripStatus, { kind: "warning" }>;
    expect(status.kind).toBe("warning");
    expect(status.remainingBudgetMinutes).toBeCloseTo(50);
  });

  it("returns 'over_budget' when legs exceed total budget", () => {
    // 90 min spent, 60 min total → 30 min over
    const status = computeTripStatus([LEG_90], 60, 10) as Extract<TripStatus, { kind: "over_budget" }>;
    expect(status.kind).toBe("over_budget");
    expect(status.overageMinutes).toBeCloseTo(30);
  });

  it("over_budget takes precedence over warning check", () => {
    // Even with directMinutesToDestination being small, over_budget fires first
    const status = computeTripStatus([LEG_90], 60, 5);
    expect(status.kind).toBe("over_budget");
  });

  it("WARNING_BUFFER_MINUTES is 30 (documented contract)", () => {
    expect(WARNING_BUFFER_MINUTES).toBe(30);
  });
});

// ── buildTripState ────────────────────────────────────────────────────────────

describe("buildTripState", () => {
  it("builds an empty-status state from an empty leg list", () => {
    const state = buildTripState([], 480, 60);
    expect(state.legs).toEqual([]);
    expect(state.totalBudgetMinutes).toBe(480);
    expect(state.status.kind).toBe("empty");
  });

  it("derives status correctly from provided legs", () => {
    const state = buildTripState([LEG_60], 480, 60);
    expect(state.legs).toHaveLength(1);
    expect(state.status.kind).toBe("in_progress");
  });

  it("returns a new array for legs (does not share reference with input)", () => {
    const input = [LEG_60];
    const state = buildTripState(input, 480, 60);
    expect(state.legs).not.toBe(input);
    expect(state.legs).toEqual(input);
  });
});

// ── appendLeg ─────────────────────────────────────────────────────────────────

describe("appendLeg", () => {
  it("appends a leg and recalculates status", () => {
    const initial = buildTripState([], 480, 60);
    const next = appendLeg(initial, LEG_60, 60);
    expect(next.legs).toHaveLength(1);
    expect(next.legs[0]).toEqual(LEG_60);
    expect(next.status.kind).toBe("in_progress");
  });

  it("accumulates legs across multiple appends", () => {
    const s0 = buildTripState([], 480, 60);
    const s1 = appendLeg(s0, LEG_60, 60);
    const s2 = appendLeg(s1, LEG_30, 60);
    expect(s2.legs).toHaveLength(2);
    const remaining = (s2.status as Extract<TripStatus, { kind: "in_progress" }>).remainingBudgetMinutes;
    expect(remaining).toBeCloseTo(390); // 480 - 60 - 30
  });

  it("does not mutate the original state", () => {
    const original = buildTripState([], 480, 60);
    appendLeg(original, LEG_60, 60);
    expect(original.legs).toHaveLength(0);
  });

  it("transitions to warning when budget tightens", () => {
    // Start with 120 min budget, add a 60 min leg, 50 min left to destination
    const s0 = buildTripState([], 120, 50);
    const s1 = appendLeg(s0, LEG_60, 50);
    // 60 remaining, 50 to dest → 10 ≤ 30 → warning
    expect(s1.status.kind).toBe("warning");
  });

  it("transitions to over_budget when legs exceed total", () => {
    const s0 = buildTripState([], 60, 10);
    const s1 = appendLeg(s0, LEG_90, 10); // 90 min leg on 60 min budget
    expect(s1.status.kind).toBe("over_budget");
  });

  it("stores directMinutesToDestination on TripState", () => {
    const s = buildTripState([LEG_30], 300, 42);
    expect(s.directMinutesToDestination).toBe(42);
  });
});

// ── computeDeadlinePressure ──────────────────────────────────────────────────

const LEG_300 = leg(300 * 60); // one full 5h/day budget leg

describe("computeDeadlinePressure", () => {
  it("returns null when no legs yet", () => {
    expect(computeDeadlinePressure([], 4, 5, 900)).toBeNull();
  });

  it("returns on-track when pace is within budget", () => {
    // 1 day used (300 min), 3 days remaining, 600 min to dest → 200 min/day needed
    const dp = computeDeadlinePressure([LEG_300], 4, 5, 600);
    expect(dp).not.toBeNull();
    expect(dp!.daysLate).toBe(0);
    expect(dp!.requiredMinutesPerDay).toBeCloseTo(200);
    expect(dp!.budgetMinutesPerDay).toBe(300);
  });

  it("returns daysLate > 0 when pace exceeds budget", () => {
    // 1 day used (300 min), 3 days remaining, 1200 min to dest → needs 400/day vs 300 budget
    // daysLate = (1 + 1200/300) - 4 = (1 + 4) - 4 = 1
    const dp = computeDeadlinePressure([LEG_300], 4, 5, 1200);
    expect(dp).not.toBeNull();
    expect(dp!.daysLate).toBeCloseTo(1);
    expect(dp!.requiredMinutesPerDay).toBeCloseTo(400);
  });

  it("returns daysLate = 0 when exactly on pace", () => {
    // 1 day used, 3 days remaining, 900 min to dest → 300 min/day exactly
    const dp = computeDeadlinePressure([LEG_300], 4, 5, 900);
    expect(dp!.daysLate).toBe(0);
    expect(dp!.requiredMinutesPerDay).toBeCloseTo(300);
  });

  it("handles no days remaining gracefully", () => {
    // 4 days used but still 600 min to destination
    const fourLegs = [LEG_300, LEG_300, LEG_300, LEG_300];
    const dp = computeDeadlinePressure(fourLegs, 4, 5, 600);
    expect(dp!.daysRemaining).toBe(0);
    expect(dp!.daysLate).toBeGreaterThan(0);
    expect(dp!.requiredMinutesPerDay).toBe(Infinity);
  });
});
