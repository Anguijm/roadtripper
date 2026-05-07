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
  hopReachMinutes,
  InvalidRouteParamsError,
} from "@/lib/routing/validation";
import { checkRateLimit, checkDailyQuota, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";
import { parsePersonaId } from "@/lib/personas";
import { TripParamsSchema, ArrivalTripParamsSchema, deriveStartDate, totalDays, MAX_TRIP_DAYS } from "@/lib/plan/types";

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
  dateMode?: string;
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
  const daily = checkDailyQuota(ip);
  if (!daily.ok) {
    return (
      <ErrorScreen
        title="Daily Limit"
        message={`Daily route quota reached. Try again in ${daily.retryAfterSeconds} seconds.`}
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

  // Parse and validate date params. Three modes:
  //   arrival — endDate only; startDate derived after route computation
  //   range   — both startDate + endDate present (existing behaviour)
  //   none    — no dates; workspace shows without deadline pressure
  const isArrivalMode = params.dateMode === "arrival";
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (isArrivalMode) {
    const arrivalParsed = ArrivalTripParamsSchema.safeParse({
      endDate: params.endDate,
      dailyBudgetHours: budgetHours,
    });
    if (!arrivalParsed.success) {
      const msg = arrivalParsed.error.issues[0]?.message ?? "Invalid trip parameters.";
      return <ErrorScreen title="Invalid Parameters" message={msg} />;
    }
    endDate = arrivalParsed.data.endDate;
    // startDate derived after route computation below
  } else if (params.startDate !== undefined || params.endDate !== undefined) {
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

  // Hop reach = daily drive budget in minutes. The radial planner finds the
  // NEXT city to stop at — the right radius is how far you'll drive today,
  // not a detour tolerance. tripDays is unused: per-hop reach is per-day.
  const maxDetourMinutes = hopReachMinutes(budgetHours);

  let routeError: string | null = null;
  let route: Awaited<ReturnType<typeof computeRoute>> | null = null;
  let candidateMarkers: CandidateMarker[] = [];
  let candidateFetchFailed = false;
  let waypointFetch: WaypointFetchResult = {
    status: "fresh",
    cities: [],
    waypoints: [],
    neighborhoods: {},
  };

  // AbortController for the parallel fetch pair. findCitiesInRadius does not yet
  // propagate the signal, but the controller is wired in for future cancellation.
  const controller = new AbortController();

  // allSettled: if candidate fetching fails we still render the primary route
  // rather than a full error page. The two calls are independent (same inputs).
  const [routeResult, candidateResult] = await Promise.allSettled([
    computeRoute(origin, destination),
    findCitiesInRadius(origin, destination, maxDetourMinutes),
  ]);

  if (routeResult.status === "fulfilled") {
    const routeValue = routeResult.value;
    // Verify semantic success: a navigable route always carries an encodedPolyline.
    // An empty string here means the Routes API returned a result with no geometry
    // (e.g., a degenerate ZERO_RESULTS edge case not caught by computeRoute's own
    // guard), which must be treated as a failure rather than an empty-map render.
    if (!routeValue.encodedPolyline) {
      routeError = isArrivalMode
        ? "Could not compute route — departure date cannot be derived. Please try again."
        : "Could not compute route. Please try again.";
    } else {
      route = routeValue;
    }
    // Derive startDate from the direct route duration in arrival mode.
    if (isArrivalMode && endDate) {
      if (!route || !Number.isFinite(route.totalDurationSeconds)) {
        // Malformed Routes API response — treat as a route failure rather than
        // passing a NaN duration to deriveStartDate, which would crash SSR.
        route = null;
        routeError = "Could not compute route — departure date cannot be derived. Please try again.";
      } else {
        startDate = deriveStartDate(endDate, route.totalDurationSeconds, budgetHours);
        // MAX_TRIP_DAYS check deferred from ArrivalTripParamsSchema — enforce now
        // that startDate is known.
        if (totalDays({ startDate, endDate }) > MAX_TRIP_DAYS) {
          return (
            <ErrorScreen
              title="Invalid Parameters"
              message={`Trip duration cannot exceed ${MAX_TRIP_DAYS} days.`}
            />
          );
        }
      }
    }
  } else {
    controller.abort();
    routeError = isArrivalMode
      ? "Could not compute route — departure date cannot be derived. Please try again."
      : "Could not compute route. Please try again.";
  }

  if (route) {
    if (candidateResult.status === "fulfilled") {
      try {
        const radialCandidates = candidateResult.value;
        candidateMarkers = radialCandidates.map((c) => ({
          id: c.city.id,
          name: c.city.name,
          lat: c.city.lat,
          lng: c.city.lng,
          // Doubled: detourMinutes retains round-trip semantics for display compat.
          detourMinutes: c.oneWayDriveMinutes * 2,
        }));
        waypointFetch = await fetchWaypointsForCandidates(radialCandidates);
      } catch (e) {
        console.error("[plan] waypoint pipeline failed:", e instanceof Error ? e.constructor.name : "unknown");
        candidateFetchFailed = true;
      }
    } else {
      console.error("[plan] candidate search failed:", candidateResult.reason instanceof Error ? candidateResult.reason.constructor.name : "unknown");
      candidateFetchFailed = true;
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
          dateMode={isArrivalMode ? "arrival" : undefined}
          initialCandidateFetchFailed={candidateFetchFailed}
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
