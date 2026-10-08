import { foldVisitLegs } from "./visits";
// Pure isomorphic trip state — safe for both client components and server modules.
// No server-only imports.

export interface TripLeg {
  originCityId: string;
  destinationCityId: string;
  /** Drive time returned by the Routes API for this leg. */
  durationSeconds: number;
  distanceMeters: number;
}

/**
 * Budget warning: surface when the user's remaining budget would not comfortably
 * cover the final drive to the destination plus this buffer. 30 min is roughly
 * one gas-stop + short break — a meaningful cushion without being overly conservative.
 */
export const WARNING_BUFFER_MINUTES = 30;

/**
 * The trip's total driving budget, or that it has none (Gauntlet U13).
 *
 * A trip with dates has a total: its days times the hours a day. A trip
 * without dates has no total — it takes the days it takes — and is
 * `undated`, not "one day long". Until U13 the plan sheet passed a number
 * either way, inventing one day for an undated trip "so a non-zero budget
 * is always available on legacy URLs", and an undated multi-day trip was
 * then scored tight or over budget against a single day. U11's false
 * "Tight" box was that number shown on a screen. A union rather than a
 * number, so nothing can compute against a budget that does not exist
 * without first being told by the compiler that it might not.
 */
export type TripBudget = { kind: "dated"; totalMinutes: number } | { kind: "undated" };

/**
 * The budget for a trip of `dayCount` days, or none when it has no dates.
 *
 * The one place an undated trip is told apart from a dated one, so the
 * sheet cannot quietly go back to inventing a day: the first cut of U13 did
 * it inline, and a mutation that wrote `(tripDayCount ?? 1)` there passed
 * every test, because since U11 nothing on screen reads an undated trip's
 * status. A trap that re-arms invisibly is the one worth guarding.
 */
export function tripBudgetFor(dayCount: number | null, budgetHours: number): TripBudget {
  return dayCount === null ? { kind: "undated" } : { kind: "dated", totalMinutes: dayCount * budgetHours * 60 };
}

/**
 * - `empty`        — no legs added yet; no budget consumed.
 * - `undated`      — legs added, but the trip has no total budget to be
 *                    measured against (no dates), so it is never tight or
 *                    over. Its own kind so no reader can mistake it for one
 *                    of the three below (U13).
 * - `in_progress`  — legs added, budget comfortable.
 * - `warning`      — remaining budget ≤ directMinutesToDestination + WARNING_BUFFER_MINUTES;
 *                    user should consider heading to the destination soon.
 * - `over_budget`  — accumulated leg time already exceeds the total budget.
 */
export type TripStatus =
  | { kind: "empty" }
  | { kind: "undated" }
  | { kind: "in_progress"; remainingBudgetMinutes: number; directMinutesToDestination: number }
  | { kind: "warning"; remainingBudgetMinutes: number; directMinutesToDestination: number }
  | { kind: "over_budget"; overageMinutes: number };

export interface TripState {
  legs: TripLeg[];
  budget: TripBudget;
  directMinutesToDestination: number;
  status: TripStatus;
}

/**
 * How far off-pace the trip is relative to the end-date deadline.
 * Only meaningful when a date range is provided (tripDays > 0).
 *
 * `daysLate`             — how many extra days of driving are needed beyond
 *                          the remaining budget days (0 when on track).
 * `requiredMinutesPerDay`— pace needed each remaining day to arrive on time.
 * `budgetMinutesPerDay`  — user's stated daily limit.
 */
export interface DeadlinePressure {
  daysRemaining: number;
  requiredMinutesPerDay: number;
  budgetMinutesPerDay: number;
  daysLate: number;
}

/**
 * Returns deadline pressure for the current trip position, or null when there
 * are no legs yet or the inputs are degenerate (budgetHours=0, invalid
 * directMinutesToDestination). Uses only data already computed by the Routes
 * API — makes no additional calls.
 *
 * Overnight quantization: each leg is an overnight stay, so a 6h leg on a
 * 5h budget costs 2 days, not 1.2. Both daysUsed and drivingDaysStillNeeded
 * use ceil() — you can't spend half a night at a stop.
 *
 * daysLate formula: (daysAlreadyUsed + drivingDaysStillNeeded) − tripDays
 *   where daysAlreadyUsed      = Σ ceil(leg_minutes / budgetPerDay)
 *   and   drivingDaysStillNeeded = ceil(directMinutesToDestination / budgetPerDay)
 *
 * requiredMinutesPerDay = Infinity when daysRemaining = 0 — callers must
 * guard this case before formatting or comparing to budget.
 *
 * Thresholds used by PlanWorkspace:
 *   ≥ 0.25 days late → amber (a quarter-day gives the user time to react)
 *   ≥ 1.0  days late → red   (a full day over is unrecoverable without skipping stops)
 */
/**
 * The days a dated trip has to spare (Gauntlet U21): the days between its
 * dates, less the days its stops have used, less the days the rest of the
 * drive needs at the budget's pace. Counted the way the deadline counts
 * them (visits folded into their stretch, each overnight leg rounded up
 * to whole days), so the two can never disagree. Null for a trip with no
 * dates, which has no slack to measure; never below zero.
 */
export function spareDays(
  legs: readonly TripLeg[],
  tripDays: number | null,
  budgetHours: number,
  directMinutesToDestination: number
): number | null {
  if (tripDays === null || !(budgetHours > 0) || !Number.isFinite(directMinutesToDestination)) return null;
  const folded = foldVisitLegs(legs, Math.max(0, directMinutesToDestination));
  const perDay = budgetHours * 60;
  const used = legsQuantizedDays(folded.legs, perDay);
  const still = folded.directMinutesToDestination > 0 ? stretchDays(folded.directMinutesToDestination, perDay) : 0;
  return Math.max(0, tripDays - used - still);
}

/** A day to spare is room for a town out of the way (U21). */
export const SPARE_DAYS_FOR_DETOURS = 1;

export function computeDeadlinePressure(
  legs: readonly TripLeg[],
  tripDays: number,
  budgetHours: number,
  directMinutesToDestination: number
): DeadlinePressure | null {
  if (legs.length === 0) return null;
  if (budgetHours <= 0) return null; // avoid divide-by-zero
  if (!Number.isFinite(directMinutesToDestination) || directMinutesToDestination < 0) return null;
  // Visits folded out here, not by the caller (Gauntlet U10): a roadside
  // stop is visited on the way and ends no day, and `legsQuantizedDays`
  // rounds each leg up to whole days, so an unfolded nine-minute leg cost
  // a day of its own. Folding inside means no caller can forget to — the
  // first cut folded at the one call site, and reverting that left every
  // test green.
  const folded = foldVisitLegs(legs, directMinutesToDestination);
  legs = folded.legs;
  directMinutesToDestination = folded.directMinutesToDestination;
  const budgetMinutesPerDay = budgetHours * 60;
  // Each leg is an overnight stay, once the visits are folded into the
  // stretch they lie on — ceil so a 6h leg on a 5h budget costs 2 days.
  const daysUsed = legsQuantizedDays(legs, budgetMinutesPerDay);
  const daysRemaining = Math.max(0, tripDays - daysUsed);
  // Infinity signals to callers that no pace can meet the deadline — guard before formatting.
  const requiredMinutesPerDay =
    daysRemaining > 0 ? directMinutesToDestination / daysRemaining : Infinity;
  // daysLate = daysUsed + drivingDaysStillNeeded − tripDays; clamped at 0 when on or ahead of pace.
  const daysLate = Math.max(
    0,
    daysUsed + (directMinutesToDestination > 0 ? stretchDays(directMinutesToDestination, budgetMinutesPerDay) : 0) - tripDays
  );
  return { daysRemaining, requiredMinutesPerDay, budgetMinutesPerDay, daysLate };
}

/** Total drive minutes accumulated across all legs. */
export function legsTotalMinutes(legs: readonly TripLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.durationSeconds / 60, 0);
}

/**
 * A stretch's last day shorter than this, in minutes, is folded into the
 * day before (Gauntlet U35, the operator's choice): drive on to the end
 * rather than stop for the night 37 min short of Denver. That day runs up
 * to this much over the budget.
 */
export const FOLD_MINUTES = 60;

/**
 * The days a stretch of `minutes` takes at `budgetMinutesPerDay`: one per
 * budget's worth, a final remainder under FOLD_MINUTES folded into the day
 * before. The one count every reader uses (the day list, the deadline, the
 * spare days), so they can never disagree. At least one day.
 */
export function stretchDays(minutes: number, budgetMinutesPerDay: number): number {
  if (!(budgetMinutesPerDay > 0) || !(minutes > 0)) return 1;
  const days = Math.ceil(minutes / budgetMinutesPerDay);
  const lastDay = minutes - (days - 1) * budgetMinutesPerDay;
  return days > 1 && lastDay < FOLD_MINUTES ? days - 1 : days;
}

/**
 * Overnight-quantized day count: each leg costs ceil(leg_minutes / budget)
 * days because you spend a night at every stop. A 6h leg on a 5h budget = 2
 * days, not 1.2. Used for deadline tracking and end-date derivation.
 */
export function legsQuantizedDays(
  legs: readonly TripLeg[],
  budgetMinutesPerDay: number
): number {
  return legs.reduce(
    (sum, leg) => sum + stretchDays(leg.durationSeconds / 60, budgetMinutesPerDay),
    0
  );
}

/** Budget minutes remaining after all current legs. May be negative if over budget. */
export function remainingBudgetMinutes(
  legs: readonly TripLeg[],
  totalBudgetMinutes: number
): number {
  return totalBudgetMinutes - legsTotalMinutes(legs);
}

/**
 * Derives TripStatus from legs, budget, and the direct drive time from the
 * current position to the final destination. `directMinutesToDestination` is
 * caller-supplied (from the most recent Routes API result or a haversine
 * estimate) — this function makes no API calls.
 */
export function computeTripStatus(
  legs: readonly TripLeg[],
  budget: TripBudget,
  directMinutesToDestination: number
): TripStatus {
  if (legs.length === 0) return { kind: "empty" };
  if (budget.kind === "undated") return { kind: "undated" };

  const remaining = remainingBudgetMinutes(legs, budget.totalMinutes);

  if (remaining < 0) {
    return { kind: "over_budget", overageMinutes: -remaining };
  }

  if (remaining - directMinutesToDestination <= WARNING_BUFFER_MINUTES) {
    return { kind: "warning", remainingBudgetMinutes: remaining, directMinutesToDestination };
  }

  return { kind: "in_progress", remainingBudgetMinutes: remaining, directMinutesToDestination };
}

/** Builds a TripState from its constituent parts. */
export function buildTripState(
  legs: readonly TripLeg[],
  budget: TripBudget,
  directMinutesToDestination: number
): TripState {
  return {
    legs: [...legs],
    budget,
    directMinutesToDestination,
    status: computeTripStatus(legs, budget, directMinutesToDestination),
  };
}

/** Returns a new TripState with `leg` appended and status re-derived. */
export function appendLeg(
  state: TripState,
  leg: TripLeg,
  directMinutesToDestination: number
): TripState {
  return buildTripState([...state.legs, leg], state.budget, directMinutesToDestination);
}
