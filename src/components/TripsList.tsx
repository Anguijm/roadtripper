"use client";

import TripCard from "@/components/TripCard";
import type { SavedTrip } from "@/lib/trips/types";

/**
 * Presentational. State moved up to the page when trips left the server: the
 * page owns localStorage and re-reads after a delete, so a local copy here
 * would be a second source of truth that can disagree with the store.
 */
export default function TripsList({
  trips,
  onDelete,
}: {
  trips: SavedTrip[];
  onDelete: (tripId: string, spoken: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onDeleted={onDelete} />
      ))}
    </div>
  );
}
