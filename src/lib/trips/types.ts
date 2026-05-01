// Isomorphic — safe for both client and server. No server-only imports.
import { z } from "zod/v4";

export const SavedTripStopSchema = z.object({
  // 200-char sanity limit: well within Firestore field limits; prevents abuse.
  cityId: z.string().min(1).max(200),
  cityName: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type SavedTripStop = z.infer<typeof SavedTripStopSchema>;

export const SaveTripInputSchema = z.object({
  fromName: z.string().min(1).max(200),
  toName: z.string().min(1).max(200),
  fromLat: z.number().min(-90).max(90),
  fromLng: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  toLng: z.number().min(-180).max(180),
  // Daily driving hours: same range as the plan page inputs.
  budgetHours: z.number().int().min(1).max(24),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  personaId: z.string().min(1).max(100),
  // Max 7 stops — matches MAX_TRIP_STOPS in PlanWorkspace; Routes API waypoint cap.
  stops: z.array(SavedTripStopSchema).max(7),
});
export type SaveTripInput = z.infer<typeof SaveTripInputSchema>;

// Firestore auto-generated IDs are 20 alphanumeric chars; client UUIDs are
// 36 chars (hex + hyphens). Allow both, cap at 128 to block oversized inputs.
export const TripIdSchema = z.string().min(1).max(128).regex(/^[\w-]+$/);
export type TripId = z.infer<typeof TripIdSchema>;

/** Shape returned by loadTrips — extends SaveTripInput with server-assigned fields. */
export interface SavedTrip extends SaveTripInput {
  id: string;
  /** ISO 8601 string — Firestore Timestamp converted server-side. */
  createdAt: string;
  updatedAt: string;
}
