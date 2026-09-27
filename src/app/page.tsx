import Link from "next/link";
import RouteInput from "@/components/RouteInput";
import type { CitySelection } from "@/components/CityAutocomplete";
import { LatLngSchema } from "@/lib/plan/types";

interface HomeSearchParams {
  fromName?: string;
  fromLat?: string;
  fromLng?: string;
  toName?: string;
  toLat?: string;
  toLng?: string;
}

/** A place handed in by the URL, or nothing. Never trusts the text past 80 characters. */
function selectionFrom(name: string | undefined, lat: string | undefined, lng: string | undefined, prefix: string): CitySelection | undefined {
  if (lat === undefined || lng === undefined) return undefined;
  const point = LatLngSchema.safeParse({ lat: Number(lat), lng: Number(lng) });
  if (!point.success) return undefined;
  const label = (name ?? "").trim().slice(0, 80) || `${prefix}`;
  return { placeId: `geo:${point.data.lat.toFixed(5)},${point.data.lng.toFixed(5)}`, name: label, ...point.data };
}

export default async function Home({ searchParams }: { searchParams: Promise<HomeSearchParams> }) {
  // The today screen hands a start and an end here ("plan a trip to
  // Albuquerque from where you are"), so the form opens filled in.
  const params = await searchParams;
  const initialFrom = selectionFrom(params.fromName, params.fromLat, params.fromLng, "Start");
  const initialTo = selectionFrom(params.toName, params.toLat, params.toLng, "End");
  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <h1 className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2]">
          Roadtripper
        </h1>
        <nav className="flex items-center gap-4">
          <Link
            href="/today"
            className="text-xs font-mono uppercase tracking-widest text-[#8b949e] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
          >
            Just today
          </Link>
          <Link
            href="/trips"
            className="text-xs font-mono uppercase tracking-widest text-[#8b949e] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
          >
            Saved trips
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-mono tracking-tight text-[#f0f6fc] mb-2">
              Plan your road trip
            </h2>
            <p className="text-sm text-[#7d8590]">
              Set your start, destination, and daily drive budget. We&apos;ll suggest
              themed stops along the way.
            </p>
          </div>
          <RouteInput initialFrom={initialFrom} initialTo={initialTo} />
          <p className="mt-6 text-xs text-center text-[#4a5159] font-mono">
            Powered by Urban Explorer — 258 cities, thousands of waypoints
          </p>
        </div>
      </main>
    </div>
  );
}
