import { headers } from "next/headers";
import Link from "next/link";
import PlanWorkspace from "@/components/PlanWorkspace";
import type { CandidateMarker } from "@/components/RouteMap";
import { computeRoute } from "@/lib/routing/directions";
import { findCitiesInRadius } from "@/lib/routing/radial";
import { fetchWaypointsForCandidates } from "@/lib/routing/recommend";
import type { WaypointFetchResult } from "@/lib/routing/scoring";
import {
  validateRouteParams,
  detourCapForBudget,
  InvalidRouteParamsError,
} from "@/lib/routing/validation";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";
import { parsePersonaId } from "@/lib/personas";
import { totalDays, TripParamsSchema } from "@/lib/plan/types";

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
  persona?: string;
  startDate?: string;
  endDate?: string;
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
  const activePersonaId = parsePersonaId(params.persona);

  // Parse and validate trip params (dates + budget) via comprehensive schema.
  // Both date params must be present and valid if either is supplied.
  let startDate: string | undefined;
  let endDate: string | undefined;
  if (params.startDate !== undefined || params.endDate !== undefined) {
    const tripParsed = TripParamsSchema.safeParse({
      startDate: params.startDate,
      endDate: params.endDate,
      dailyBudgetHours: budgetHours,
    });
    if (!tripParsed.success) {
      const msg = tripParsed.error.issues[0]?.message ?? "Invalid trip parameters.";
      return <ErrorScreen title="Invalid Parameters" message={msg} />;
    }
    startDate = tripParsed.data.startDate;
    endDate = tripParsed.data.endDate;
  }

  // Total trip days scales the per-stop detour cap so longer trips can reach
  // further stops. Falls back to 1 day for legacy URLs without date params.
  // detourCapForBudget already hard-caps at 120 min regardless of input size.
  const tripDays = startDate && endDate ? totalDays({ startDate, endDate }) : 1;
  const maxDetourMinutes = detourCapForBudget(tripDays * budgetHours);

  let routeError: string | null = null;
  let route: Awaited<ReturnType<typeof computeRoute>> | null = null;
  let candidateMarkers: CandidateMarker[] = [];
  let waypointFetch: WaypointFetchResult = {
    status: "fresh",
    cities: [],
    waypoints: [],
    neighborhoods: {},
  };

  try {
    route = await computeRoute(origin, destination);
  } catch (e) {
    routeError = e instanceof Error ? e.message : "Failed to compute route";
  }

  if (route) {
    try {
      const radialCandidates = await findCitiesInRadius(origin, destination, maxDetourMinutes);
      candidateMarkers = radialCandidates.map((c) => ({
        id: c.city.id,
        name: c.city.name,
        lat: c.city.lat,
        lng: c.city.lng,
        detourMinutes: c.driveMinutes,
      }));

      waypointFetch = await fetchWaypointsForCandidates(radialCandidates);
    } catch (e) {
      console.error("[plan] candidate/waypoint pipeline failed:", e);
      // Non-fatal: still render the route, just without recommendations
    }
  }

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

      {route ? (
        <PlanWorkspace
          origin={origin}
          destination={destination}
          encodedPolyline={route.encodedPolyline}
          bounds={route.bounds}
          candidateMarkers={candidateMarkers}
          waypointFetch={waypointFetch}
          initialPersonaId={activePersonaId}
          budgetHours={budgetHours}
          initialDistanceMeters={route.totalDistanceMeters}
          initialDurationSeconds={route.totalDurationSeconds}
          fromName={fromName}
          toName={toName}
          maxDetourMinutes={maxDetourMinutes}
          startDate={startDate}
          endDate={endDate}
        />
      ) : (
        <main className="flex-1 flex items-center justify-center bg-[#0d1117]">
          <div className="border border-[#f85149] bg-[#161b22] p-6 max-w-md">
            <p className="text-xs font-mono uppercase tracking-widest text-[#f85149] mb-2">
              Route Error
            </p>
            <p className="text-sm text-[#b0b9c2]">{routeError}</p>
          </div>
        </main>
      )}
    </div>
  );
}
