"use server";
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { roadtripperDb } from "@/lib/firebaseAdmin";
import { SaveTripInputSchema, type SaveTripInput, type SavedTrip } from "@/lib/trips/types";

export type SaveTripError = "not_authenticated" | "invalid_input" | "internal_error";
export type LoadTripsError = "not_authenticated" | "internal_error";
export type DeleteTripError = "not_authenticated" | "not_found" | "internal_error";

function tripsCollection(userId: string) {
  return roadtripperDb.collection(`users/${userId}/saved_trips`);
}

export async function saveTrip(
  input: SaveTripInput
): Promise<{ ok: true; tripId: string } | { ok: false; error: SaveTripError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  const parsed = SaveTripInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  try {
    const ref = await tripsCollection(userId).add({
      ...parsed.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, tripId: ref.id };
  } catch {
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
      .limit(50)
      .get();

    const trips: SavedTrip[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
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
        createdAt: (d.createdAt as Timestamp).toDate().toISOString(),
        updatedAt: (d.updatedAt as Timestamp).toDate().toISOString(),
      };
    });

    return { ok: true, trips };
  } catch {
    return { ok: false, error: "internal_error" };
  }
}

export async function deleteTrip(
  tripId: string
): Promise<{ ok: true } | { ok: false; error: DeleteTripError }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "not_authenticated" };

  if (!tripId || typeof tripId !== "string" || tripId.length > 200) {
    return { ok: false, error: "not_found" };
  }

  try {
    const ref = tripsCollection(userId).doc(tripId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "not_found" };
    await ref.delete();
    return { ok: true };
  } catch {
    return { ok: false, error: "internal_error" };
  }
}
