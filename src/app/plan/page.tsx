import { headers } from "next/headers";
import Link from "next/link";
import RouteMap, { type CandidateMarker } from "@/components/RouteMap";
import {
  computeRoute,
  formatDistance,
  formatDuration,
} from "@/lib/routing/directions";
import { findCandidateCities } from "@/lib/routing/candidates";
import {
  validateRouteParams,
  detourCapForBudget,
  InvalidRouteParamsError,
} from "@/lib/routing/validation";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";

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

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-4 bg-[#0d1117]">
      <div className="border border-[#f85149] bg-[#161b22] p-6 max-w-md">
        <p className="text-xs font-mono uppercase tracking-widest text-[#f85149] mb-2">
          {title}
        </p>
        <p className="text-sm text-[#b0b9c2]">{message}</p>
      </div>
      <Link
        href="/"
        className="text-sm font-mono uppercase tracking-widest border border-[#30363d] hover:border-[#6e7681] px-4 py-2 text-[#f0f6fc] transition-colors"
      >
        ← Back
      </Link>
    </div>
  );
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<PlanSearchParams>;
}) {
  const params = await searchParams;
  const requestHeaders = await headers();

  // Rate limit BEFORE doing anything expensive
  maybeSweep();
  const ip = getClientIp(requestHeaders);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return (
      <ErrorScreen
        title="Rate Limit"
        message={`Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`}
      />
    );
  }

  // Validate ALL inputs before any API calls
  let validated;
  try {
    validated = validateRouteParams(
      params.fromLat,
      params.fromLng,
      params.toLat,
      params.toLng,
      params.budget
    );
  } catch (e) {
    if (e instanceof InvalidRouteParamsError) {
      return <ErrorScreen title="Invalid Parameters" message={e.message} />;
    }
    throw e;
  }

  const { origin, destination, budgetHours } = validated;
  const fromName = params.fromName ?? "Start";
  const toName = params.toName ?? "End";
  const maxDetourMinutes = detourCapForBudget(budgetHours);

  let routeError: string | null = null;
  let route = null;
  let candidateMarkers: CandidateMarker[] = [];
  let candidateError: string | null = null;

  try {
    route = await computeRoute(origin, destination);
  } catch (e) {
    routeError = e instanceof Error ? e.message : "Failed to compute route";
  }

  if (route) {
    try {
      const validatedCandidates = await findCandidateCities(route.encodedPolyline, {
        maxDetourMinutes,
      });
      candidateMarkers = validatedCandidates.map((c) => ({
        id: c.city.id,
        name: c.city.name,
        lat: c.city.lat,
        lng: c.city.lng,
        detourMinutes: c.roundTripDetourMinutes,
      }));
    } catch (e) {
      candidateError = e instanceof Error ? e.message : "Failed to find candidates";
    }
  }

  const totalDays =
    route && budgetHours > 0
      ? Math.ceil(route.totalDurationSeconds / 3600 / budgetHours)
      : 0;

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
                    Days @ {budgetHours}h
                  </p>
                  <p className="text-sm text-[#f0f6fc] mt-1">{totalDays}</p>
                </div>
              </div>
              <div className="border-t border-[#30363d] pt-2">
                <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] mb-1">
                  Candidate Cities ({candidateMarkers.length}) · max {maxDetourMinutes}min detour
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
                    Urban Explorer covers ~22 North American cities, mostly major metros.
                    No coverage along this route — try East Coast, West Coast, or
                    Southwest corridors.
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
