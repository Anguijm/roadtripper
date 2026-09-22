// Isomorphic by construction: every function tolerates `window` being absent,
// so this can be imported from a component that server-renders.
import {
  SaveTripInputSchema,
  TripIdSchema,
  type SaveTripInput,
  type SavedTrip,
} from "./types";
import { z } from "zod/v4";

/**
 * Saved trips live in the browser.
 *
 * They used to live in Firestore under `users/{userId}/saved_trips`, reached
 * through Clerk-authenticated server actions. That was removed on 2026-09-23:
 * this app is used by two people who do not need accounts, and sign-in was a
 * dependency that could fail from a motel parking lot in Amarillo while adding
 * nothing they wanted.
 *
 * What is lost: trips no longer follow you between devices, and clearing site
 * data clears them. That is the deal, and it is worth naming rather than
 * discovering.
 *
 * What is kept: the Zod schemas. Validation still matters, because the value
 * being parsed is now a string a user (or a broken older build) could have put
 * there, which is no more trustworthy than a Firestore document was.
 */

const KEY = "roadtripper.trips.v1";

/** Same cap the Firestore version enforced, for the same reason: bounded UI. */
export const MAX_SAVED_TRIPS = 50;

const StoredTripSchema = SaveTripInputSchema.extend({
  id: TripIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const available = (): Storage | null => {
  // Private mode, blocked site data, SSR, and thumbnail capture all land here.
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = "__rt_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Every trip that parses. A single corrupt entry drops itself rather than
 * taking the whole list down, which is the behaviour the Firestore loader had.
 */
export function loadTrips(): SavedTrip[] {
  const store = available();
  if (!store) return [];
  let raw: unknown;
  try {
    const text = store.getItem(KEY);
    if (!text) return [];
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: SavedTrip[] = [];
  for (const item of raw) {
    const parsed = StoredTripSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type SaveResult =
  | { ok: true; trip: SavedTrip }
  | { ok: false; error: "unavailable" | "invalid_input" | "limit_exceeded" | "quota" };

/**
 * Upsert by id, so retrying a failed save overwrites instead of duplicating.
 * That idempotency was the reason the old server action took a client UUID,
 * and it still matters when a user taps Save twice.
 */
export function saveTrip(input: SaveTripInput, id: string, now: Date = new Date()): SaveResult {
  const store = available();
  if (!store) return { ok: false, error: "unavailable" };

  const validInput = SaveTripInputSchema.safeParse(input);
  const validId = TripIdSchema.safeParse(id);
  if (!validInput.success || !validId.success) return { ok: false, error: "invalid_input" };

  const existing = loadTrips();
  const idx = existing.findIndex((t) => t.id === validId.data);
  if (idx === -1 && existing.length >= MAX_SAVED_TRIPS) {
    return { ok: false, error: "limit_exceeded" };
  }

  const iso = now.toISOString();
  const trip: SavedTrip = {
    ...validInput.data,
    id: validId.data,
    createdAt: idx === -1 ? iso : existing[idx].createdAt,
    updatedAt: iso,
  };
  const next = idx === -1 ? [trip, ...existing] : existing.map((t, i) => (i === idx ? trip : t));

  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // QuotaExceededError, or storage disabled between the probe and this write.
    return { ok: false, error: "quota" };
  }
  return { ok: true, trip };
}

export function deleteTrip(id: string): boolean {
  const store = available();
  if (!store) return false;
  const next = loadTrips().filter((t) => t.id !== id);
  try {
    store.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
