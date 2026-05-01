import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadTrips } from "@/app/trips/actions";
import TripsList from "@/components/TripsList";

export default async function TripsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const result = await loadTrips();

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

      <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
        {!result.ok ? (
          <p className="text-sm text-[#f85149] font-mono" role="alert">
            Couldn&apos;t load trips. Try refreshing.
          </p>
        ) : result.trips.length === 0 ? (
          <div className="text-center mt-16">
            <p className="text-sm text-[#7d8590] font-mono mb-4">No saved trips yet.</p>
            <Link
              href="/"
              className="text-xs font-mono uppercase tracking-widest border border-[#30363d] text-[#b0b9c2] px-4 py-2 hover:border-[#555] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
            >
              Plan a trip →
            </Link>
          </div>
        ) : (
          <>
            {result.failedToLoadCount > 0 && (
              <p className="text-xs text-[#d29922] font-mono mb-4" role="alert">
                {result.failedToLoadCount} trip{result.failedToLoadCount === 1 ? "" : "s"} couldn&apos;t be loaded.
              </p>
            )}
            <TripsList initialTrips={result.trips} />
          </>
        )}
      </main>
    </div>
  );
}
