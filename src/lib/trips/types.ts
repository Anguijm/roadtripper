// Isomorphic — safe for both client and server. No server-only imports.
import { z } from "zod/v4";
import { MAX_MOODS } from "@/lib/roadside/tags";

export const SavedTripStopSchema = z.object({
  // 200-char sanity limit: well within Firestore field limits; prevents abuse.
  cityId: z.string().min(1).max(200),
  cityName: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type SavedTripStop = z.infer<typeof SavedTripStopSchema>;

export const SaveTripInputSchema = z.object({
  // 200-char limit matches city/address name lengths returned by the Maps API.
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
  // "arrival" means endDate is a deadline and startDate was derived from the
  // route; reopening re-derives it. Absent (every trip saved before step 9)
  // means a plain range, which opens exactly as it always did.
  dateMode: z.enum(["range", "arrival"]).optional(),
  // 100 chars is well above any current personaId length; prevents outsized Firestore writes.
  //
  // Optional since U6, when the screens stopped choosing a persona and
  // started choosing moods. Every trip saved before that has one and still
  // parses; trips saved after it carry `moods` instead. Nothing displays
  // either — they build the resume link.
  personaId: z.string().min(1).max(100).optional(),
  /**
   * The chosen moods, oldest first (U6).
   *
   * `MAX_MOODS` rather than a literal 2: the screen's limit and what the
   * store will accept have to move together, and `MAX_MOODS` is where that
   * number is decided (`src/lib/roadside/tags.ts`, which also names the
   * chip component and the tests that pin its layout).
   *
   * 40 characters is well over the longest id the vocabulary has
   * ("trains_and_industry" is 19, and these are mood ids, shorter still);
   * it is a ceiling against an outsized Firestore write, in the same
   * spirit as the 100 on `personaId`, not a length anything is expected
   * to approach.
   *
   * Plain strings rather than the enum: a trip saved with a mood that is
   * later renamed must still load its route and its stops, and
   * `parseMoods` drops the unknown one when the link is opened.
   */
  moods: z.array(z.string().min(1).max(40)).max(MAX_MOODS).optional(),
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
