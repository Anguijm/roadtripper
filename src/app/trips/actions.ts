"use server";
import "server-only";

import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { roadtripperDb } from "@/lib/firebaseAdmin";
import { checkRateLimit, getClientIp } from "@/lib/routing/rate-limit";
import {
  SaveTripInputSchema,
  TripIdSchema,
  type SaveTripInput,
  type SavedTrip,
} from "@/lib/trips/types";

const MAX_SAVED_TRIPS = 50;

export type SaveTripError = "not_authenticated" | "rate_limited" | "invalid_input" | "limit_exceeded" | "internal_error";
export type LoadTripsError = "not_authenticated" | "rate_limited" | "internal_error";
export type DeleteTripError = "not_authenticated" | "rate_limited" | "invalid_input" | "not_found" | "internal_error";

function tripsCollection(userId: string) {
  return roadtripperDb.collection(`users/${userId}/saved_trips`);
}

/**
 * Saves a trip for the authenticated user. Idempotent: the caller must supply
 * a stable `tripId` (e.g., `crypto.randomUUID()` generated once before the
 * first attempt). Retrying with the same `tripId` overwrites the same document
 * instead of creating a duplicate.
 */
export async function saveTrip(
  input: SaveTripInput,
  tripId: string
): Promise<{ ok: true; tripId: string } | { ok: false; error: SaveTripError }> {
  const ip = getClientIp(await headers());
  if (!checkRateLimit(ip).ok) return { ok: false, error: "rate_limited" };

  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  const parsed = SaveTripInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const parsedId = TripIdSchema.safeParse(tripId);
  if (!parsedId.success) return { ok: false, error: "invalid_input" };

  const ref = tripsCollection(userId).doc(parsedId.data);
  // Read count before the transaction (advisory — V1 TOCTOU acceptable; the cap
  // may be exceeded by a small margin if concurrent saves race).
  const countSnap = await tripsCollection(userId).count().get();
  const existingCount = countSnap.data().count;

  try {
    // Transaction: preserve createdAt on re-saves; use update() to avoid
    // clobbering fields added by newer app versions on an existing doc.
    await roadtripperDb.runTransaction(async (txn) => {
      const existing = await txn.get(ref);
      if (existing.exists) {
        txn.update(ref, { ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
      } else {
        if (existingCount >= MAX_SAVED_TRIPS) {
          throw Object.assign(new Error("limit_exceeded"), { limitExceeded: true });
        }
        txn.set(ref, {
          ...parsed.data,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return { ok: true, tripId: parsedId.data };
  } catch (err) {
    if ((err as { limitExceeded?: boolean }).limitExceeded) {
      return { ok: false, error: "limit_exceeded" };
    }
    console.error("[saveTrip] Firestore write failed:", (err as Error).message);
    return { ok: false, error: "internal_error" };
  }
}

export async function loadTrips(): Promise<
  | { ok: true; trips: SavedTrip[]; failedToLoadCount: number }
  | { ok: false; error: LoadTripsError }
> {
  const ip = getClientIp(await headers());
  if (!checkRateLimit(ip).ok) return { ok: false, error: "rate_limited" };

  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  try {
    const snap = await tripsCollection(userId)
      .orderBy("updatedAt", "desc")
      // 50 most recent trips — keeps JSON payload under ~50 KB and list render
      // time fast on mobile. If raised, verify trips-list scroll performance and
      // total serialization size before deploying.
      .limit(50)
      .get();

    const trips: SavedTrip[] = [];
    let failedToLoadCount = 0;

    for (const doc of snap.docs) {
      const d = doc.data();
      const parsed = SaveTripInputSchema.safeParse({
        fromName: d.fromName,
        toName: d.toName,
        fromLat: d.fromLat,
        fromLng: d.fromLng,
        toLat: d.toLat,
        toLng: d.toLng,
        budgetHours: d.budgetHours,
        startDate: d.startDate,
        endDate: d.endDate,
        personaId: d.personaId,
        stops: d.stops ?? [],
      });
      if (!parsed.success) {
        console.error(`[loadTrips] doc ${doc.id} failed schema validation — skipping`, parsed.error.issues);
        failedToLoadCount++;
        continue;
      }
      // Returns ISO string or null if the value can't be parsed as a date.
      // Null causes the doc to be skipped — silently returning a corrupt date
      // (e.g. epoch) is worse than treating the doc as unloadable.
      const toIso = (v: unknown, field: string): string | null => {
        if (v instanceof Timestamp) return v.toDate().toISOString();
        if (typeof v === "string") {
          const d = new Date(v);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        console.warn(`[loadTrips] doc ${doc.id} field "${field}" is not a valid Timestamp or ISO string`);
        return null;
      };
      const createdAt = toIso(d.createdAt, "createdAt");
      const updatedAt = toIso(d.updatedAt, "updatedAt");
      if (createdAt === null || updatedAt === null) {
        failedToLoadCount++;
        continue;
      }
      trips.push({ id: doc.id, ...parsed.data, createdAt, updatedAt });
    }

    return { ok: true, trips, failedToLoadCount };
  } catch (err) {
    console.error("[loadTrips] Firestore read failed:", (err as Error).message);
    return { ok: false, error: "internal_error" };
  }
}

export async function deleteTrip(
  tripId: string
): Promise<{ ok: true } | { ok: false; error: DeleteTripError }> {
  const ip = getClientIp(await headers());
  if (!checkRateLimit(ip).ok) return { ok: false, error: "rate_limited" };

  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  // Firestore IDs are 20 chars; UUIDs 36; 128-char cap blocks oversized/malicious inputs.
  const parsedId = TripIdSchema.safeParse(tripId);
  if (!parsedId.success) return { ok: false, error: "invalid_input" };

  try {
    const ref = tripsCollection(userId).doc(parsedId.data);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "not_found" };
    await ref.delete();
    return { ok: true };
  } catch (err) {
    console.error("[deleteTrip] Firestore delete failed:", (err as Error).message);
    return { ok: false, error: "internal_error" };
  }
}
