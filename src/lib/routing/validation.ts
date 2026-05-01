import { haversineKm, type LatLng } from "./polyline";

export class InvalidRouteParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRouteParamsError";
  }
}

const MAX_GREAT_CIRCLE_KM = 5000;
export const MIN_BUDGET_HOURS = 1;
export const MAX_BUDGET_HOURS = 24;

/** Single source of truth for the budget-hours range check.
 *  Pure number predicate — call from string-parsing validators
 *  (`validateBudget`) or RSC-boundary type guards (server actions). */
export function isBudgetHoursInRange(b: unknown): b is number {
  return (
    typeof b === "number" &&
    Number.isInteger(b) &&
    b >= MIN_BUDGET_HOURS &&
    b <= MAX_BUDGET_HOURS
  );
}

export interface ValidatedRouteParams {
  origin: LatLng;
  destination: LatLng;
  budgetHours: number;
}

export function validateLatLng(latStr?: string, lngStr?: string): LatLng {
  if (!latStr || !lngStr) {
    throw new InvalidRouteParamsError("Missing lat/lng");
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new InvalidRouteParamsError("lat/lng must be finite numbers");
  }
  if (lat < -90 || lat > 90) {
    throw new InvalidRouteParamsError(`lat out of range: ${lat}`);
  }
  if (lng < -180 || lng > 180) {
    throw new InvalidRouteParamsError(`lng out of range: ${lng}`);
  }

  return { lat, lng };
}

export function validateBudget(budgetStr?: string): number {
  const budget = parseInt(budgetStr ?? "4", 10);
  if (!isBudgetHoursInRange(budget)) {
    throw new InvalidRouteParamsError(
      `budget must be an integer between ${MIN_BUDGET_HOURS} and ${MAX_BUDGET_HOURS}`
    );
  }
  return budget;
}

export function validateRouteParams(
  fromLatStr?: string,
  fromLngStr?: string,
  toLatStr?: string,
  toLngStr?: string,
  budgetStr?: string
): ValidatedRouteParams {
  const origin = validateLatLng(fromLatStr, fromLngStr);
  const destination = validateLatLng(toLatStr, toLngStr);

  const distanceKm = haversineKm(origin, destination);
  if (distanceKm > MAX_GREAT_CIRCLE_KM) {
    throw new InvalidRouteParamsError(
      `Route too long: ${Math.round(distanceKm)}km (max ${MAX_GREAT_CIRCLE_KM}km)`
    );
  }
  if (distanceKm < 1) {
    throw new InvalidRouteParamsError("Origin and destination are the same");
  }

  const budgetHours = validateBudget(budgetStr);

  return { origin, destination, budgetHours };
}

// Maximum one-way drive time (minutes) the radial hop search will consider.
// This is the daily drive budget, not a detour tolerance. 8h hard cap keeps
// the haversine pre-filter and the 50-city Route Matrix fan-out from growing
// beyond what findCitiesInRadius already bounds via MAX_RADIAL_FAN_OUT.
export const HOP_REACH_MAX_MINUTES = 480;

// +30 min buffer: surface cities slightly beyond the daily budget (a user
// willing to drive 5h will often stretch to 5h30m for a compelling stop).
export function hopReachMinutes(budgetHours: number): number {
  return Math.min(Math.round(budgetHours * 60) + 30, HOP_REACH_MAX_MINUTES);
}
