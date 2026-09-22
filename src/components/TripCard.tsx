"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteTrip } from "@/lib/trips/storage";
import type { SavedTrip } from "@/lib/trips/types";

// V1: stops are intentionally excluded from the resume URL.
// The /plan page initialises with empty stops; users re-add them interactively.
// Full stop serialisation can be added once the V1 flow is validated.
function resumeUrl(trip: SavedTrip): string {
  const p = new URLSearchParams({
    fromLat: trip.fromLat.toString(),
    fromLng: trip.fromLng.toString(),
    toLat: trip.toLat.toString(),
    toLng: trip.toLng.toString(),
    budget: trip.budgetHours.toString(),
    persona: trip.personaId,
    fromName: trip.fromName,
    toName: trip.toName,
  });
  if (trip.startDate) p.set("startDate", trip.startDate);
  if (trip.endDate) p.set("endDate", trip.endDate);
  return `/plan?${p.toString()}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

interface TripCardProps {
  trip: SavedTrip;
  onDeleted: (tripId: string) => void;
}

export default function TripCard({ trip, onDeleted }: TripCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Deleting is a synchronous localStorage write, so there is no pending state
  // to show and no transition to run. It can still fail when storage is
  // unavailable, which is why the error branch stays.

  const handleDelete = () => {
    if (deleteTrip(trip.id)) {
      setAnnouncement(`Trip from ${trip.fromName} to ${trip.toName} deleted.`);
      onDeleted(trip.id);
    } else {
      setError("Couldn't delete trip. Storage may be unavailable in this browser.");
    }
  };

  return (
    <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
      <div aria-live="polite" className="sr-only">{announcement}</div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[#f0f6fc] font-mono truncate">
            {trip.fromName} → {trip.toName}
          </p>
          <p className="text-xs text-[#7d8590] mt-0.5">
            {trip.budgetHours}h/day
            {trip.startDate && trip.endDate
              ? ` · ${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
              : ""}
            {trip.stops.length > 0
              ? ` · ${trip.stops.length} stop${trip.stops.length === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          aria-label={`Delete trip from ${trip.fromName} to ${trip.toName}`}
          className="text-[10px] font-mono uppercase tracking-widest text-[#7d8590] hover:text-[#f85149] disabled:opacity-40 transition-colors whitespace-nowrap flex-shrink-0 min-h-[44px] flex items-center"
        >
          {"Delete"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-[#f85149]" role="alert">{error}</p>
      )}

      <Link
        href={resumeUrl(trip)}
        className="text-xs font-mono uppercase tracking-widest border border-[#30363d] text-[#b0b9c2] px-3 min-h-[44px] flex items-center justify-center hover:border-[#555] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
      >
        Resume →
      </Link>
    </div>
  );
}
