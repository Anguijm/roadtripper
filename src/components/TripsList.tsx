"use client";

import { useState } from "react";
import TripCard from "@/components/TripCard";
import type { SavedTrip } from "@/lib/trips/types";

export default function TripsList({ initialTrips }: { initialTrips: SavedTrip[] }) {
  const [trips, setTrips] = useState(initialTrips);

  const handleDeleted = (tripId: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
  };

  if (trips.length === 0) {
    return (
      <p className="text-sm text-[#7d8590] font-mono text-center mt-8">
        All trips deleted.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onDeleted={handleDeleted} />
      ))}
    </div>
  );
}
