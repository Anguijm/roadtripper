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
 * - `empty`        — no legs added yet; no budget consumed.
 * - `in_progress`  — legs added, budget comfortable.
 * - `warning`      — remaining budget ≤ directMinutesToDestination + WARNING_BUFFER_MINUTES;
 *                    user should consider heading to the destination soon.
 * - `over_budget`  — accumulated leg time already exceeds the total budget.
 */
export type TripStatus =
  | { kind: "empty" }
  | { kind: "in_progress"; remainingBudgetMinutes: number; directMinutesToDestination: number }
  | { kind: "warning"; remainingBudgetMinutes: number; directMinutesToDestination: number }
  | { kind: "over_budget"; overageMinutes: number };

export interface TripState {
  legs: TripLeg[];
  totalBudgetMinutes: number;
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
 * daysLate formula: (daysAlreadyUsed + drivingDaysStillNeeded) − tripDays
 *   where drivingDaysStillNeeded = directMinutesToDestination / budgetPerDay
 *
 * requiredMinutesPerDay = Infinity when daysRemaining = 0 — callers must
 * guard this case before formatting or comparing to budget.
 *
 * Thresholds used by PlanWorkspace:
 *   ≥ 0.25 days late → amber (a quarter-day gives the user time to react)
 *   ≥ 1.0  days late → red   (a full day over is unrecoverable without skipping stops)
 */
export function computeDeadlinePressure(
  legs: readonly TripLeg[],
  tripDays: number,
  budgetHours: number,
  directMinutesToDestination: number
): DeadlinePressure | null {
  if (legs.length === 0) return null;
  if (budgetHours <= 0) return null; // avoid divide-by-zero
  if (!Number.isFinite(directMinutesToDestination) || directMinutesToDestination < 0) return null;
  const budgetMinutesPerDay = budgetHours * 60;
  const daysUsed = legsTotalMinutes(legs) / budgetMinutesPerDay;
  const daysRemaining = Math.max(0, tripDays - daysUsed);
  // Infinity signals to callers that no pace can meet the deadline — guard before formatting.
  const requiredMinutesPerDay =
    daysRemaining > 0 ? directMinutesToDestination / daysRemaining : Infinity;
  // daysLate = daysUsed + drivingDaysStillNeeded − tripDays; clamped at 0 when on or ahead of pace.
  const daysLate = Math.max(
    0,
    daysUsed + directMinutesToDestination / budgetMinutesPerDay - tripDays
  );
  return { daysRemaining, requiredMinutesPerDay, budgetMinutesPerDay, daysLate };
}

/** Total drive minutes accumulated across all legs. */
export function legsTotalMinutes(legs: readonly TripLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.durationSeconds / 60, 0);
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
  totalBudgetMinutes: number,
  directMinutesToDestination: number
): TripStatus {
  if (legs.length === 0) return { kind: "empty" };

  const remaining = remainingBudgetMinutes(legs, totalBudgetMinutes);

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
  totalBudgetMinutes: number,
  directMinutesToDestination: number
): TripState {
  return {
    legs: [...legs],
    totalBudgetMinutes,
    directMinutesToDestination,
    status: computeTripStatus(legs, totalBudgetMinutes, directMinutesToDestination),
  };
}

/** Returns a new TripState with `leg` appended and status re-derived. */
export function appendLeg(
  state: TripState,
  leg: TripLeg,
  directMinutesToDestination: number
): TripState {
  return buildTripState([...state.legs, leg], state.totalBudgetMinutes, directMinutesToDestination);
}
