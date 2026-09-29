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
import { parseMoods } from "@/lib/roadside/tags";
import { moodsFromLegacyPersona } from "@/lib/personas/moodProfile";
import { TripParamsSchema, ArrivalTripParamsSchema, deriveStartDate, totalDays, MAX_TRIP_DAYS } from "@/lib/plan/types";
import { formatDeadline, localTodayIso } from "@/lib/plan/deadline";
import Figures from "@/components/Figures";
import { roadsideForRoute } from "@/lib/roadside/store";

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
  /** `string[]` when the link repeats the parameter; `parseMoods` reads both. */
  moods?: string | string[];
  /** Written by links made before U6; read only as a fallback, never written. */
  persona?: string | string[];
  startDate?: string;
  endDate?: string;
  dateMode?: string;
}

export const dynamic = "force-dynamic";

/** Sentence case in the body face at 16 px (quality bar, rules 1 and 2). */
function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-4 bg-[#0d1117]">
      <div className="border border-[#f85149] bg-[#161b22] p-5 max-w-md">
        <p className="text-lg text-[#f85149] mb-2">
          {title}
        </p>
        <p className="text-base text-[#b0b9c2]">{message}</p>
      </div>
      <Link
        href="/"
        className="min-h-[44px] flex items-center text-base border border-[#30363d] hover:border-[#6e7681] px-4 py-2 text-[#f0f6fc] transition-colors"
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
        title="Slow down"
        message={`Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`}
      />
    );
  }
  const daily = checkDailyQuota(ip);
  if (!daily.ok) {
    return (
      <ErrorScreen
        title="That is all for today"
        message={`Today's routes are used up. Try again in ${daily.retryAfterSeconds} seconds.`}
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
      return <ErrorScreen title="Something is off with this link" message={e.message} />;
    }
    throw e;
  }

  const { origin, destination, budgetHours } = validated;
  const fromName = params.fromName ?? "Start";
  const toName = params.toName ?? "End";
  // The chosen moods, through parseMoods (src/lib/roadside/tags.ts): a
  // comma-separated list, everything unreadable dropped rather than
  // defaulted, at most MAX_MOODS of them. An arbitrary string reads as
  // none, which is the sheet at rest, with no error screen. The home has
  // sent this since U6, only when a chip was tapped; before U6 it sent
  // `persona`, and an old saved trip still links that way — the parameter
  // is simply not read any more, which is why an unknown one cannot fail.
  // The invalid case is pinned in src/app/plan/__tests__/page.ssr.test.tsx.
  // A link made before U6 carries `?persona=` instead, and `TripCard`
  // still writes it for a trip saved then. Read as a fallback only, so a
  // saved trip reopens with something like what it was saved with rather
  // than with nothing; `moodsFromLegacyPersona` says which of those
  // mappings are judgement rather than derivation.
  const parsedMoods = parseMoods(params.moods);
  const chosenMoods = parsedMoods.length > 0 ? parsedMoods : moodsFromLegacyPersona(params.persona);

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
      return <ErrorScreen title="Something is off with this link" message={msg} />;
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
      return <ErrorScreen title="Something is off with this link" message={msg} />;
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
        ? "Couldn't plan the route, so the start date could not be worked out. Try again."
        : "Couldn't plan the route. Try again.";
    } else {
      route = routeValue;
    }
    // Derive startDate from the direct route duration in arrival mode.
    if (isArrivalMode && endDate) {
      if (!route || !Number.isFinite(route.totalDurationSeconds)) {
        // Malformed Routes API response — treat as a route failure rather than
        // passing a NaN duration to deriveStartDate, which would crash SSR.
        route = null;
        routeError = "Couldn't plan the route, so the start date could not be worked out. Try again.";
      } else {
        startDate = deriveStartDate(endDate, route.totalDurationSeconds, budgetHours);
        // MAX_TRIP_DAYS check deferred from ArrivalTripParamsSchema — enforce now
        // that startDate is known.
        if (totalDays({ startDate, endDate }) > MAX_TRIP_DAYS) {
          return (
            <ErrorScreen
              title="Something is off with this link"
              message={`A trip can be ${MAX_TRIP_DAYS} days at most.`}
            />
          );
        }
      }
    }
  } else {
    controller.abort();
    routeError = isArrivalMode
      ? "Couldn't plan the route, so the start date could not be worked out. Try again."
      : "Couldn't plan the route. Try again.";
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
      {/* The masthead in sentence case, the body face, 16 px: "Roadtripper",
          "Amarillo to Austin" (quality bar, rules 1 and 2). The names wrap;
          nothing is cut with an ellipsis. No vertical padding: the link's
          44 px is the row, so on a phone the masthead is 45 px, 49 with a
          second line on the right, and the map's strip above the sheet at
          rest keeps the room the fit needs (PLAN_HEADER_PX in RouteMap.tsx;
          Gauntlet U3). The arrival deadline is a sentence on the sheet, not
          here, for the same reason. */}
      <header className="flex items-center justify-between gap-4 px-4 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="min-h-[44px] flex items-center shrink-0 text-base text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors"
        >
          ← Roadtripper
        </Link>
        <div className="min-w-0 text-base text-[#8b949e] text-right">
          <div className="break-words">{fromName} to {toName}</div>
          {/* A range's dates, the figures in the mono face and the months
              in the body face; an arrival date is the sheet's sentence. */}
          {!isArrivalMode && startDate && endDate ? (
            <div><Figures text={`${formatDeadline(startDate)} to ${formatDeadline(endDate)}`} /></div>
          ) : null}
        </div>
      </header>

      {route ? (
        <PlanWorkspace
          origin={origin}
          destination={destination}
          encodedPolyline={route.encodedPolyline}
          roadsideStops={roadsideForRoute(route.encodedPolyline)}
          bounds={route.bounds}
          candidateMarkers={candidateMarkers}
          waypointFetch={waypointFetch}
          initialMoods={chosenMoods}
          budgetHours={budgetHours}
          initialDistanceMeters={route.totalDistanceMeters}
          initialDurationSeconds={route.totalDurationSeconds}
          fromName={fromName}
          toName={toName}
          startDate={startDate}
          endDate={endDate}
          dateMode={isArrivalMode ? "arrival" : undefined}
          today={localTodayIso()}
          initialCandidateFetchFailed={candidateFetchFailed}
        />
      ) : (
        <main className="flex-1 flex items-center justify-center bg-[#0d1117]">
          <div className="border border-[#f85149] bg-[#161b22] p-5 max-w-md">
            <p className="text-lg text-[#f85149] mb-2">
              Couldn&apos;t plan the route
            </p>
            <p className="text-base text-[#b0b9c2]">{routeError}</p>
          </div>
        </main>
      )}
    </div>
  );
}
