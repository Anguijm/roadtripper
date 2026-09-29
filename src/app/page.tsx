import Link from "next/link";
import RouteInput from "@/components/RouteInput";
import type { CitySelection } from "@/components/CityAutocomplete";
import { pointFrom, placeNameFrom } from "@/lib/today/presets";
import { parseDateMode, parseIsoDate } from "@/lib/plan/deadline";
import { exampleLine } from "@/lib/plan/words";
import { homeExampleNames } from "@/lib/roadside/examples";

interface HomeSearchParams {
  fromName?: string;
  fromLat?: string;
  fromLng?: string;
  toName?: string;
  toLat?: string;
  toLng?: string;
  dateMode?: string;
  startDate?: string;
  endDate?: string;
}

/** A place handed in by the URL, or nothing. Same parsing and name bound as the today page. */
function selectionFrom(name: string | undefined, lat: string | undefined, lng: string | undefined, fallback: string): CitySelection | undefined {
  const point = pointFrom(lat, lng);
  if (!point) return undefined;
  // Same `geo:` id as a located origin builds, five decimals, about a metre;
  // nothing parses it, it only has to be stable and distinct. Explained at
  // length where it is first built, in src/lib/geo/locate.ts.
  return { placeId: `geo:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`, name: placeNameFrom(name, fallback), ...point };
}

export default async function Home({ searchParams }: { searchParams: Promise<HomeSearchParams> }) {
  // The today screen hands a start and an end here ("plan a trip to
  // Albuquerque from where you are"), so the form opens filled in.
  const params = await searchParams;
  const initialFrom = selectionFrom(params.fromName, params.fromLat, params.fromLng, "Start");
  const initialTo = selectionFrom(params.toName, params.toLat, params.toLng, "End");
  // A deadline handed in (from the today screen, or a saved link) opens the
  // picker already in arrive-by mode with the date set.
  const initialDateMode = parseDateMode(params.dateMode);
  const initialEndDate = parseIsoDate(params.endDate) ?? "";
  const initialStartDate = initialDateMode === "range" ? parseIsoDate(params.startDate) ?? "" : "";
  // The fold with the dates and the mood (Gauntlet U4) opens when the URL
  // carries any of them, however it parses: a link that names dates is a
  // link that wants them seen, even one whose date is wrong.
  const initialMoreOpen = params.dateMode !== undefined || params.startDate !== undefined || params.endDate !== undefined;
  // What comes back, with two real places from the roadside store (or the
  // two everybody knows when the store is not here). Read on the server,
  // no network, no model.
  const example = exampleLine(homeExampleNames());
  return (
    <div className="flex flex-col min-h-screen">
      {/* The masthead in sentence case, the body face, 16 px (quality bar,
          rules 1 and 2): no letter-spaced capitals anywhere on the screen. */}
      <header className="flex items-center justify-between gap-4 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <h1 className="text-base text-[#b0b9c2]">
          Roadtripper
        </h1>
        <nav className="flex items-center gap-4">
          <Link
            href="/today"
            className="min-h-[44px] flex items-center text-base text-[#8b949e] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
          >
            Just today
          </Link>
          <Link
            href="/trips"
            className="min-h-[44px] flex items-center text-base text-[#8b949e] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
          >
            Saved trips
          </Link>
        </nav>
      </header>

      {/* Top-aligned, not centred: the fold below the button opens
          downward and moves nothing above it, and on a 390 by 844 phone the
          button's bottom edge sits near 535 px, inside the first screen
          (Gauntlet U4; quality bar, rule 7). */}
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h2 className="text-2xl text-[#f0f6fc] mb-2">
              Plan your road trip
            </h2>
            <p className="text-base text-[#8b949e]">
              {example}
            </p>
          </div>
          <RouteInput
            initialFrom={initialFrom}
            initialTo={initialTo}
            initialDateMode={initialDateMode}
            initialStartDate={initialStartDate}
            initialEndDate={initialEndDate}
            initialMoreOpen={initialMoreOpen}
          />
          <p className="mt-6 text-base text-center text-[#7d8590]">
            Built on Urban Explorer: <span className="num">258</span> cities and thousands of places.
          </p>
        </div>
      </main>
    </div>
  );
}
