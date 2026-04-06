import { haversineKm, type LatLng } from "./polyline";

export class InvalidRouteParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRouteParamsError";
  }
}

const MAX_GREAT_CIRCLE_KM = 5000;
const MIN_BUDGET_HOURS = 1;
const MAX_BUDGET_HOURS = 24;

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
  if (!Number.isFinite(budget) || budget < MIN_BUDGET_HOURS || budget > MAX_BUDGET_HOURS) {
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

/**
 * Compute the maximum allowed round-trip detour minutes based on the user's
 * daily drive budget. A user with an 8h day can tolerate up to ~96 min detour
 * (12 min per budget hour, capped at 90).
 */
export function detourCapForBudget(budgetHours: number): number {
  return Math.min(90, Math.max(30, budgetHours * 12));
}
