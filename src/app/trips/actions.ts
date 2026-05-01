"use server";
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { roadtripperDb } from "@/lib/firebaseAdmin";
import {
  SaveTripInputSchema,
  TripIdSchema,
  type SaveTripInput,
  type SavedTrip,
} from "@/lib/trips/types";

export type SaveTripError = "not_authenticated" | "invalid_input" | "internal_error";
export type LoadTripsError = "not_authenticated" | "internal_error";
export type DeleteTripError = "not_authenticated" | "not_found" | "internal_error";

function tripsCollection(userId: string) {
  return roadtripperDb.collection(`users/${userId}/saved_trips`);
}

/**
 * Saves a trip for the authenticated user. Idempotent: pass the same `tripId`
 * on retry to overwrite the same document rather than creating a duplicate.
 * If `tripId` is omitted or invalid, a new UUID is generated server-side.
 */
export async function saveTrip(
  input: SaveTripInput,
  tripId?: string
): Promise<{ ok: true; tripId: string } | { ok: false; error: SaveTripError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  const parsed = SaveTripInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const parsedId = tripId ? TripIdSchema.safeParse(tripId) : null;
  const docId = parsedId?.success ? parsedId.data : crypto.randomUUID();

  try {
    await tripsCollection(userId).doc(docId).set({
      ...parsed.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, tripId: docId };
  } catch (err) {
    console.error("[saveTrip] Firestore write failed:", (err as Error).constructor.name);
    return { ok: false, error: "internal_error" };
  }
}

export async function loadTrips(): Promise<
  { ok: true; trips: SavedTrip[] } | { ok: false; error: LoadTripsError }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  try {
    const snap = await tripsCollection(userId)
      .orderBy("updatedAt", "desc")
      // 50 most recent trips — keeps payload size and list render time reasonable.
      .limit(50)
      .get();

    const trips: SavedTrip[] = [];
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
        console.error(`[loadTrips] doc ${doc.id} failed schema validation — skipping`);
        continue;
      }
      const toIso = (v: unknown) =>
        v instanceof Timestamp ? v.toDate().toISOString() : new Date(0).toISOString();
      trips.push({
        id: doc.id,
        ...parsed.data,
        createdAt: toIso(d.createdAt),
        updatedAt: toIso(d.updatedAt),
      });
    }

    return { ok: true, trips };
  } catch (err) {
    console.error("[loadTrips] Firestore read failed:", (err as Error).constructor.name);
    return { ok: false, error: "internal_error" };
  }
}

export async function deleteTrip(
  tripId: string
): Promise<{ ok: true } | { ok: false; error: DeleteTripError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  // Firestore IDs are 20 chars; UUIDs 36; 128-char cap blocks oversized/malicious inputs.
  const parsedId = TripIdSchema.safeParse(tripId);
  if (!parsedId.success) return { ok: false, error: "not_found" };

  try {
    const ref = tripsCollection(userId).doc(parsedId.data);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "not_found" };
    await ref.delete();
    return { ok: true };
  } catch (err) {
    console.error("[deleteTrip] Firestore delete failed:", (err as Error).constructor.name);
    return { ok: false, error: "internal_error" };
  }
}
