import { z } from "zod";

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

export const TripInputSchema = z
  .object({
    origin: LatLngSchema,
    originName: z.string().min(1),
    destination: LatLngSchema,
    destinationName: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
    // Min 1h required to make progress; max 16h is a sanity limit for realistic planning.
    dailyBudgetHours: z.number().int().min(1).max(16),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "startDate must be before or equal to endDate",
    path: ["endDate"],
  });

export type TripInput = z.infer<typeof TripInputSchema>;

// Returns the number of calendar days in the trip, inclusive of both start
// and end dates. A trip starting and ending on the same day is 1 day.
// Uses explicit UTC midnight parsing to avoid DST boundary errors.
export function totalDays(input: Pick<TripInput, "startDate" | "endDate">): number {
  const ms =
    new Date(input.endDate + "T00:00:00Z").getTime() -
    new Date(input.startDate + "T00:00:00Z").getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

export function totalBudgetMinutes(input: Pick<TripInput, "startDate" | "endDate" | "dailyBudgetHours">): number {
  return totalDays(input) * input.dailyBudgetHours * 60;
}

// Maximum trip duration enforced at the server boundary to prevent resource
// exhaustion from unbounded date ranges passed via URL params.
export const MAX_TRIP_DAYS = 90;

// Validates the trip-planning URL params that arrive as raw strings from the
// request. Coordinate params are handled separately by validateRouteParams.
export const TripParamsSchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    // Daily driving hours: min 1h to make progress, max 16h sanity limit.
    dailyBudgetHours: z.number().int().min(1).max(16),
  })
  .refine((d) => d.startDate <= d.endDate, {
    message: "Start date must be on or before end date.",
    path: ["endDate"],
  })
  .refine((d) => totalDays({ startDate: d.startDate, endDate: d.endDate }) <= MAX_TRIP_DAYS, {
    message: `Trip duration cannot exceed ${MAX_TRIP_DAYS} days.`,
    path: ["endDate"],
  });

// Validates URL params for arrival-mode planning (endDate only; startDate is
// derived server-side after route computation).
// NOTE: MAX_TRIP_DAYS is intentionally not validated here — the start date is
// unknown until the route is computed. This check must be performed imperatively
// in /app/plan/page.tsx after deriveStartDate() resolves the start date.
export const ArrivalTripParamsSchema = z.object({
  endDate: z.string().date(),
  // Daily driving hours: min 1h to make progress, max 16h sanity limit.
  dailyBudgetHours: z.number().int().min(1).max(16),
});
export type ArrivalTripParams = z.infer<typeof ArrivalTripParamsSchema>;

// Derives the trip start date from a fixed arrival (end) date using overnight
// quantization: each leg costs ceil(leg_minutes / budget_minutes) days, so a
// 6 h drive on a 5 h budget costs 2 days, not 1.2. `daysNeeded` is at least 1
// (even a zero-length route needs a departure day). The departure date is
// endDate − (daysNeeded − 1) because the arrival day itself counts as day 1.
// UTC midnight parsing avoids DST boundary errors.
export function deriveStartDate(
  endDate: string,
  directDurationSeconds: number,
  dailyBudgetHours: number
): string {
  if (dailyBudgetHours <= 0) throw new Error("dailyBudgetHours must be positive");
  if (!Number.isFinite(directDurationSeconds) || directDurationSeconds < 0)
    throw new Error("directDurationSeconds must be a non-negative finite number");
  const budgetMinutes = dailyBudgetHours * 60;
  const daysNeeded = Math.max(1, Math.ceil(directDurationSeconds / 60 / budgetMinutes));
  const d = new Date(endDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (daysNeeded - 1));
  return d.toISOString().split("T")[0];
}
