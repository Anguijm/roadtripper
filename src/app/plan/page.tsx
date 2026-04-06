import Link from "next/link";
import RouteMap, { type CandidateMarker } from "@/components/RouteMap";
import {
  computeRoute,
  formatDistance,
  formatDuration,
} from "@/lib/routing/directions";
import { findCandidateCities } from "@/lib/routing/candidates";

interface PlanSearchParams {
  from?: string;
  fromName?: string;
  fromLat?: string;
  fromLng?: string;
  to?: string;
  toName?: string;
  toLat?: string;
  toLng?: string;
  budget?: string;
}

export const dynamic = "force-dynamic";

function parseLatLng(latStr?: string, lngStr?: string) {
  if (!latStr || !lngStr) return null;
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<PlanSearchParams>;
}) {
  const params = await searchParams;
  const origin = parseLatLng(params.fromLat, params.fromLng);
  const destination = parseLatLng(params.toLat, params.toLng);
  const fromName = params.fromName ?? "Start";
  const toName = params.toName ?? "End";
  const budget = parseInt(params.budget ?? "4", 10);

  if (!origin || !destination) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-4">
        <h1 className="text-lg font-mono uppercase tracking-widest text-[#f0f6fc]">
          Missing Route Parameters
        </h1>
        <p className="text-sm text-[#7d8590]">
          Please return to the home page and select start and end cities.
        </p>
        <Link
          href="/"
          className="text-sm font-mono uppercase tracking-widest border border-[#30363d] hover:border-[#6e7681] px-4 py-2 text-[#f0f6fc] transition-colors"
        >
          ← Back
        </Link>
      </div>
    );
  }

  let routeError: string | null = null;
  let route = null;
  let candidateMarkers: CandidateMarker[] = [];
  let candidateError: string | null = null;

  try {
    route = await computeRoute(origin, destination);
  } catch (e) {
    routeError = e instanceof Error ? e.message : String(e);
  }

  if (route) {
    try {
      const validated = await findCandidateCities(route.encodedPolyline, {
        maxDetourMinutes: 60,
      });
      candidateMarkers = validated.map((c) => ({
        id: c.city.id,
        name: c.city.name,
        lat: c.city.lat,
        lng: c.city.lng,
        detourMinutes: c.roundTripDetourMinutes,
      }));
    } catch (e) {
      candidateError = e instanceof Error ? e.message : String(e);
    }
  }

  const totalDays =
    route && budget > 0 ? Math.ceil(route.totalDurationSeconds / 3600 / budget) : 0;

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors"
        >
          ← Roadtripper
        </Link>
        <div className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
          {fromName} → {toName}
        </div>
      </header>

      <main className="flex-1 relative">
        {route ? (
          <RouteMap
            origin={origin}
            destination={destination}
            encodedPolyline={route.encodedPolyline}
            bounds={route.bounds}
            candidates={candidateMarkers}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-[#0d1117]">
            <div className="border border-[#f85149] bg-[#161b22] p-6 max-w-md">
              <p className="text-xs font-mono uppercase tracking-widest text-[#f85149] mb-2">
                Route Error
              </p>
              <p className="text-sm text-[#b0b9c2]">{routeError}</p>
            </div>
          </div>
        )}

        {route && (
          <div className="absolute bottom-6 left-4 right-4 pointer-events-none">
            <div className="bg-[#161b22]/95 border border-[#30363d] p-4 max-w-md pointer-events-auto rounded-sm">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
                    Distance
                  </p>
                  <p className="text-sm text-[#f0f6fc] mt-1">
                    {formatDistance(route.totalDistanceMeters)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
                    Drive Time
                  </p>
                  <p className="text-sm text-[#f0f6fc] mt-1">
                    {formatDuration(route.totalDurationSeconds)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
                    Days @ {budget}h
                  </p>
                  <p className="text-sm text-[#f0f6fc] mt-1">{totalDays}</p>
                </div>
              </div>
              <div className="border-t border-[#30363d] pt-2">
                <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] mb-1">
                  Candidate Cities ({candidateMarkers.length})
                </p>
                {candidateError ? (
                  <p className="text-xs text-[#f85149]">{candidateError}</p>
                ) : candidateMarkers.length > 0 ? (
                  <p className="text-xs text-[#b0b9c2]">
                    {candidateMarkers
                      .slice(0, 5)
                      .map((c) => c.name)
                      .join(" · ")}
                    {candidateMarkers.length > 5
                      ? ` · +${candidateMarkers.length - 5} more`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-[#7d8590]">
                    No Urban Explorer cities along this route
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
