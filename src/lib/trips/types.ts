// Isomorphic — safe for both client and server. No server-only imports.
import { z } from "zod/v4";

export const SavedTripStopSchema = z.object({
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
  budgetHours: z.number().int().min(1).max(24),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  personaId: z.string().min(1).max(100),
  stops: z.array(SavedTripStopSchema).max(7),
});
export type SaveTripInput = z.infer<typeof SaveTripInputSchema>;

/** Shape returned by loadTrips — extends SaveTripInput with server-assigned fields. */
export interface SavedTrip extends SaveTripInput {
  id: string;
  /** ISO 8601 string — Firestore Timestamp converted server-side. */
  createdAt: string;
  updatedAt: string;
}
