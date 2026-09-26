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

/**
 * The localStorage key. Versioned so a future shape change can read the old
 * key, migrate, and write the new one rather than silently misparsing. Renaming
 * it without a migration orphans every saved trip on every device.
 */
const KEY = "roadtripper.trips.v1";

/**
 * Same cap the Firestore version enforced, for the same reason: bounded UI.
 * It is a count, not a size. localStorage is typically ~5 MB per origin and a
 * trip is well under 1 KB, so the count bites long before the quota does.
 * Updates to an existing id bypass it on purpose: a retry of a failed save
 * must never be refused for hitting a limit the first attempt already passed.
 */
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
 * Everything under the key, split into what parses and what does not.
 *
 * The unparseable entries are kept verbatim, not dropped. Before this, every
 * writer read through `loadTrips`, which discards anything failing the schema,
 * and then wrote the survivors back, so one corrupt or newer-shaped entry was
 * silently purged by the next unrelated save. Council caught it. Now a write
 * carries the opaque entries through untouched; only a reader hides them.
 *
 * The one thing that still cannot be preserved is a key whose whole value is
 * not a JSON array at all. There is no entry boundary to keep, so a write
 * replaces it. That is junk, not data, and is documented rather than pretended
 * away.
 */
function readAll(store: Storage): { parsed: SavedTrip[]; opaque: unknown[] } {
  const none = { parsed: [] as SavedTrip[], opaque: [] as unknown[] };
  let raw: unknown;
  try {
    const text = store.getItem(KEY);
    if (!text) return none;
    raw = JSON.parse(text);
  } catch {
    return none;
  }
  if (!Array.isArray(raw)) return none;
  const parsed: SavedTrip[] = [];
  const opaque: unknown[] = [];
  for (const item of raw) {
    const r = StoredTripSchema.safeParse(item);
    if (r.success) parsed.push(r.data);
    else opaque.push(item);
  }
  return { parsed, opaque };
}

/** Every trip that parses, newest first. Corrupt entries are hidden here and
 *  preserved on disk; see `readAll`. */
export function loadTrips(): SavedTrip[] {
  const store = available();
  if (!store) return [];
  return readAll(store).parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

  const { parsed: existing, opaque } = readAll(store);
  const idx = existing.findIndex((t) => t.id === validId.data);
  // Only trips that parse count toward the cap. Opaque entries are not usable
  // trips, and refusing a save because of entries the user cannot even see
  // would be a confusing failure with no action they could take.
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
    store.setItem(KEY, JSON.stringify([...next, ...opaque]));
  } catch {
    // QuotaExceededError, or storage disabled between the probe and this write.
    return { ok: false, error: "quota" };
  }
  invalidate();
  return { ok: true, trip };
}

export function deleteTrip(id: string): boolean {
  const store = available();
  if (!store) return false;
  const { parsed, opaque } = readAll(store);
  const next = parsed.filter((t) => t.id !== id);
  try {
    store.setItem(KEY, JSON.stringify([...next, ...opaque]));
    invalidate();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Subscription layer, so React can read this as an external store.
//
// Reading in a `useEffect` and calling `setState` trips
// `react-hooks/set-state-in-effect`, which cost Session 24 three extra council
// rounds and is recorded in .harness/learnings.md. `useSyncExternalStore` is
// what that rule is steering toward: React pulls the value itself.
//
// getSnapshot must return a referentially stable value or React re-renders
// forever, and `loadTrips()` builds a fresh array every call. So the snapshot
// is cached and only rebuilt when something here invalidates it.
// ---------------------------------------------------------------------------

let snapshot: SavedTrip[] | null = null;
const listeners = new Set<() => void>();

/** Empty on the server: there is no localStorage there, and a stable constant
 *  keeps the server and first client render agreeing. */
const SERVER_SNAPSHOT: SavedTrip[] = [];

function invalidate(): void {
  snapshot = null;
  for (const l of listeners) l();
}

export function subscribeToTrips(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab writing to the same key fires `storage`. Without this, deleting
  // a trip in one tab leaves a stale list in the other.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) invalidate();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function getTripsSnapshot(): SavedTrip[] {
  if (snapshot === null) snapshot = loadTrips();
  return snapshot;
}

export function getTripsServerSnapshot(): SavedTrip[] {
  return SERVER_SNAPSHOT;
}

export type StorageStatus = "unknown" | "available" | "blocked";

/**
 * Whether the browser will let this origin persist anything. Distinct from
 * "no trips saved yet", which `loadTrips` cannot tell apart from "storage is
 * switched off": both come back as an empty list. The page shows a banner on
 * `blocked` so a user in a private window learns why Save does nothing.
 *
 * Read through `useSyncExternalStore` with an `unknown` server snapshot, so the
 * server render and the first client render agree and there is no hydration
 * mismatch; the real answer arrives on the client's first subscribed render.
 */
export function getStorageStatusSnapshot(): StorageStatus {
  return available() ? "available" : "blocked";
}

export function getStorageStatusServerSnapshot(): StorageStatus {
  return "unknown";
}
