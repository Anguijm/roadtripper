"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import TripsList from "@/components/TripsList";
import {
  deleteTrip,
  subscribeToTrips,
  getTripsSnapshot,
  getTripsServerSnapshot,
} from "@/lib/trips/storage";

/**
 * Saved trips live in this browser. No sign-in, no server call.
 *
 * Read through `useSyncExternalStore` rather than an effect that calls
 * `setState`: localStorage is an external store, that is the hook built for
 * one, and it keeps the server render (empty) and the first client render in
 * agreement without a hydration mismatch. It also picks up a delete made in
 * another tab, which an effect-on-mount would miss.
 */
export default function TripsPage() {
  const trips = useSyncExternalStore(
    subscribeToTrips,
    getTripsSnapshot,
    getTripsServerSnapshot
  );

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          ← Roadtripper
        </Link>
        <h1 className="text-sm font-mono uppercase tracking-widest text-[#7d8590]">
          Saved Trips
        </h1>
      </header>

      <main className="flex-1 p-4">
        {trips.length === 0 ? (
          <p className="text-xs font-mono text-[#7d8590]">
            No saved trips in this browser yet. Plan one and press Save.
          </p>
        ) : (
          <TripsList trips={trips} onDelete={deleteTrip} />
        )}
        <p className="mt-6 text-[10px] font-mono text-[#555]">
          Trips are stored in this browser only. Clearing site data clears them.
        </p>
      </main>
    </div>
  );
}
