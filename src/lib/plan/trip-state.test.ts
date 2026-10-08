import { stretchDays, FOLD_MINUTES, spareDays as spare } from "./trip-state";
import { describe, it, expect } from "vitest";
import {
  legsTotalMinutes,
  legsQuantizedDays,
  remainingBudgetMinutes,
  computeTripStatus,
  buildTripState,
  tripBudgetFor,
  appendLeg,
  computeDeadlinePressure,
  WARNING_BUFFER_MINUTES,
  type TripLeg,
  type TripStatus,
} from "./trip-state";

/** A dated trip's total budget, in minutes (U13: a budget is dated or undated, never a bare number). */
const dated = (totalMinutes: number) => ({ kind: "dated" as const, totalMinutes });

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

// ── legsQuantizedDays ─────────────────────────────────────────────────────────

describe("legsQuantizedDays", () => {
  it("returns 0 for empty leg list", () => {
    expect(legsQuantizedDays([], 300)).toBe(0);
  });

  it("counts an exact-budget leg as 1 day", () => {
    // 5h leg on a 5h/day budget = exactly 1 day
    expect(legsQuantizedDays([leg(300 * 60)], 300)).toBe(1);
  });

  it("rounds a sub-budget leg up to 1 day", () => {
    // 4h leg on a 5h/day budget: ceil(240/300) = 1, not 0.8
    expect(legsQuantizedDays([leg(240 * 60)], 300)).toBe(1);
  });

  it("rounds an over-budget leg up to 2 days", () => {
    // 6h leg on a 5h/day budget: ceil(360/300) = 2, not 1.2
    expect(legsQuantizedDays([leg(360 * 60)], 300)).toBe(2);
  });

  it("sums quantized days across multiple legs", () => {
    // 4h + 3h + 6h on 5h budget: ceil(0.8)+ceil(0.6)+ceil(1.2) = 1+1+2 = 4
    expect(
      legsQuantizedDays([leg(240 * 60), leg(180 * 60), leg(360 * 60)], 300)
    ).toBe(4);
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
    const status = computeTripStatus([], dated(480), 60);
    expect(status.kind).toBe("empty");
  });

  it("returns 'in_progress' when budget is comfortable", () => {
    // 60 min spent → 420 remaining; 60 min to dest → buffer gap = 360 > 30
    const status = computeTripStatus([LEG_60], dated(480), 60) as Extract<TripStatus, { kind: "in_progress" }>;
    expect(status.kind).toBe("in_progress");
    expect(status.remainingBudgetMinutes).toBeCloseTo(420);
    expect(status.directMinutesToDestination).toBe(60);
  });

  it("returns 'warning' when remaining barely covers destination + buffer", () => {
    // 60 min spent → 60 remaining; 50 min to dest → 60 - 50 = 10 ≤ WARNING_BUFFER_MINUTES (30)
    const status = computeTripStatus([LEG_60], dated(120), 50) as Extract<TripStatus, { kind: "warning" }>;
    expect(status.kind).toBe("warning");
    expect(status.remainingBudgetMinutes).toBeCloseTo(60);
    expect(status.directMinutesToDestination).toBe(50);
  });

  it("returns 'warning' at the exact buffer boundary", () => {
    // 60 min spent → 90 remaining; 60 min to dest → 90 - 60 = 30 = WARNING_BUFFER_MINUTES exactly
    const status = computeTripStatus([LEG_60], dated(150), 60);
    expect(status.kind).toBe("warning");
  });

  it("returns 'in_progress' just above the buffer boundary", () => {
    // remaining - direct = 31 > 30
    const status = computeTripStatus([LEG_60], dated(151), 60);
    expect(status.kind).toBe("in_progress");
  });

  it("returns 'warning' when remaining is positive but insufficient to reach destination", () => {
    // 60 min spent → 50 remaining; 60 min to dest → remaining - direct = -10 ≤ 30 → warning
    const status = computeTripStatus([LEG_60], dated(110), 60) as Extract<TripStatus, { kind: "warning" }>;
    expect(status.kind).toBe("warning");
    expect(status.remainingBudgetMinutes).toBeCloseTo(50);
  });

  it("returns 'over_budget' when legs exceed total budget", () => {
    // 90 min spent, 60 min total → 30 min over
    const status = computeTripStatus([LEG_90], dated(60), 10) as Extract<TripStatus, { kind: "over_budget" }>;
    expect(status.kind).toBe("over_budget");
    expect(status.overageMinutes).toBeCloseTo(30);
  });

  it("over_budget takes precedence over warning check", () => {
    // Even with directMinutesToDestination being small, over_budget fires first
    const status = computeTripStatus([LEG_90], dated(60), 5);
    expect(status.kind).toBe("over_budget");
  });

  it("WARNING_BUFFER_MINUTES is 30 (documented contract)", () => {
    expect(WARNING_BUFFER_MINUTES).toBe(30);
  });
});

// ── buildTripState ────────────────────────────────────────────────────────────

describe("buildTripState", () => {
  it("builds an empty-status state from an empty leg list", () => {
    const state = buildTripState([], dated(480), 60);
    expect(state.legs).toEqual([]);
    expect(state.budget).toEqual(dated(480));
    expect(state.status.kind).toBe("empty");
  });

  it("derives status correctly from provided legs", () => {
    const state = buildTripState([LEG_60], dated(480), 60);
    expect(state.legs).toHaveLength(1);
    expect(state.status.kind).toBe("in_progress");
  });

  it("returns a new array for legs (does not share reference with input)", () => {
    const input = [LEG_60];
    const state = buildTripState(input, dated(480), 60);
    expect(state.legs).not.toBe(input);
    expect(state.legs).toEqual(input);
  });
});

// ── appendLeg ─────────────────────────────────────────────────────────────────

describe("appendLeg", () => {
  it("appends a leg and recalculates status", () => {
    const initial = buildTripState([], dated(480), 60);
    const next = appendLeg(initial, LEG_60, 60);
    expect(next.legs).toHaveLength(1);
    expect(next.legs[0]).toEqual(LEG_60);
    expect(next.status.kind).toBe("in_progress");
  });

  it("accumulates legs across multiple appends", () => {
    const s0 = buildTripState([], dated(480), 60);
    const s1 = appendLeg(s0, LEG_60, 60);
    const s2 = appendLeg(s1, LEG_30, 60);
    expect(s2.legs).toHaveLength(2);
    const remaining = (s2.status as Extract<TripStatus, { kind: "in_progress" }>).remainingBudgetMinutes;
    expect(remaining).toBeCloseTo(390); // 480 - 60 - 30
  });

  it("does not mutate the original state", () => {
    const original = buildTripState([], dated(480), 60);
    appendLeg(original, LEG_60, 60);
    expect(original.legs).toHaveLength(0);
  });

  it("transitions to warning when budget tightens", () => {
    // Start with 120 min budget, add a 60 min leg, 50 min left to destination
    const s0 = buildTripState([], dated(120), 50);
    const s1 = appendLeg(s0, LEG_60, 50);
    // 60 remaining, 50 to dest → 10 ≤ 30 → warning
    expect(s1.status.kind).toBe("warning");
  });

  it("transitions to over_budget when legs exceed total", () => {
    const s0 = buildTripState([], dated(60), 10);
    const s1 = appendLeg(s0, LEG_90, 10); // 90 min leg on 60 min budget
    expect(s1.status.kind).toBe("over_budget");
  });

  it("stores directMinutesToDestination on TripState", () => {
    const s = buildTripState([LEG_30], dated(300), 42);
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

  it("returns null when budgetHours is 0 (avoid divide-by-zero)", () => {
    expect(computeDeadlinePressure([LEG_300], 4, 0, 600)).toBeNull();
  });

  it("returns null when directMinutesToDestination is negative", () => {
    expect(computeDeadlinePressure([LEG_300], 4, 5, -1)).toBeNull();
  });

  it("returns null when directMinutesToDestination is non-finite", () => {
    expect(computeDeadlinePressure([LEG_300], 4, 5, Infinity)).toBeNull();
    expect(computeDeadlinePressure([LEG_300], 4, 5, NaN)).toBeNull();
  });

  it("quantizes a sub-budget leg to 1 full day used", () => {
    // 4h leg on 5h budget: daysUsed=ceil(240/300)=1, not 0.8
    // tripDays=4, daysRemaining=3, dest=600min → requiredMinutesPerDay=200
    const dp = computeDeadlinePressure([leg(240 * 60)], 4, 5, 600);
    expect(dp!.daysRemaining).toBe(3);
    expect(dp!.daysLate).toBe(0);
    expect(dp!.requiredMinutesPerDay).toBeCloseTo(200);
  });

  it("quantizes an over-budget leg to 2 days used", () => {
    // 6h leg on 5h budget: daysUsed=ceil(360/300)=2, not 1.2
    // tripDays=4, daysRemaining=2, dest=300min → on pace
    const dp = computeDeadlinePressure([leg(360 * 60)], 4, 5, 300);
    expect(dp!.daysRemaining).toBe(2);
    expect(dp!.daysLate).toBe(0);
  });

  it("flags late when remaining drive also needs an extra overnight", () => {
    // 4h+3h+6h legs on 5h budget: daysUsed=1+1+2=4, tripDays=4
    // dest=360min (6h): ceil(360/300)=2 days still needed → daysLate=2
    const dp = computeDeadlinePressure(
      [leg(240 * 60), leg(180 * 60), leg(360 * 60)],
      4, 5, 360
    );
    expect(dp!.daysLate).toBe(2);
    expect(dp!.daysRemaining).toBe(0);
  });
});

describe("a trip with no dates has no total budget (U13)", () => {
  // The plan sheet used to give an undated trip one day's budget "so a
  // non-zero budget is always available on legacy URLs", and an undated
  // multi-day trip then scored tight or over budget against that one day.
  // U11's false "Tight" box was that status on a screen.
  const UNDATED = { kind: "undated" as const };

  it("is never tight or over, however long the drive", () => {
    expect(computeTripStatus([LEG_90], UNDATED, 6000).kind).toBe("undated");
    expect(computeTripStatus([LEG_60, LEG_90, LEG_30], UNDATED, 6000).kind).toBe("undated");
  });

  it("is empty before anything is added, like a dated one", () => {
    expect(computeTripStatus([], UNDATED, 60)).toEqual({ kind: "empty" });
  });

  it("carries the undated budget through the state and an appended leg", () => {
    const s0 = buildTripState([], UNDATED, 60);
    expect(s0.budget).toEqual(UNDATED);
    const s1 = appendLeg(s0, LEG_90, 6000);
    expect(s1.budget).toEqual(UNDATED);
    expect(s1.status.kind).toBe("undated");
  });

  it("still scores a dated trip of the same legs, so the change is only the undated case", () => {
    expect(computeTripStatus([LEG_90], dated(60), 10).kind).toBe("over_budget");
  });
});

describe("the budget a trip gets from its dates (U13)", () => {
  it("is undated when the trip has no dates, never one invented day", () => {
    expect(tripBudgetFor(null, 4)).toEqual({ kind: "undated" });
  });

  it("is the days times the hours when it has them", () => {
    expect(tripBudgetFor(3, 4)).toEqual({ kind: "dated", totalMinutes: 720 });
    expect(tripBudgetFor(1, 4)).toEqual({ kind: "dated", totalMinutes: 240 });
  });

  it("is what the plan sheet builds its budget from", async () => {
    // Since U11 nothing on screen reads an undated trip's status, so the
    // sheet going back to inventing a day — `(tripDayCount ?? 1)` — would
    // pass every rendered test. Reading the source is the guard that
    // catches it; the first cut of U13 had no guard, and that mutation
    // passed.
    const { readFileSync } = await import("node:fs");
    const sheet = readFileSync(new URL("../../components/PlanWorkspace.tsx", import.meta.url), "utf8");
    expect(sheet).toContain("const tripBudget = tripBudgetFor(tripDayCount, budgetHours);");
    expect(sheet).not.toMatch(/tripDayCount \?\? 1/);
  });
});


describe("a short last day folds into the one before (U35)", () => {
  it("counts a budget's worth a day, and folds a last day under an hour", () => {
    expect(FOLD_MINUTES).toBe(60);
    expect(stretchDays(200, 240)).toBe(1);
    expect(stretchDays(240, 240)).toBe(1);
    expect(stretchDays(241, 240)).toBe(1); // a minute over: drive on
    expect(stretchDays(299, 240)).toBe(1);
    expect(stretchDays(300, 240)).toBe(2); // an hour over: a night
    expect(stretchDays(517, 240)).toBe(2); // KC to Denver at 4 h: 37 min left, folded
    expect(stretchDays(780, 240)).toBe(4);
    expect(stretchDays(0, 240)).toBe(1);
    expect(stretchDays(300, 0)).toBe(1);
  });
  it("is the count the deadline and the spare days use, so they agree with the day list", () => {
    // 4 h 5 min to the end on a one-day trip at 4 h: not a day late, it folds.
    const p = computeDeadlinePressure([{ originCityId: "__origin__", destinationCityId: "x", durationSeconds: 60 * 60, distanceMeters: 1 }], 2, 4, 245);
    expect(p?.daysLate).toBe(0);
    // A 2-day window for 8 h 37 min at 4 h: two days, folded; none to spare, none late.
    expect(spare([], 2, 4, 517)).toBe(0);
    expect(spare([], 3, 4, 517)).toBe(1);
  });
});
