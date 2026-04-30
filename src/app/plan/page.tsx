import { headers } from "next/headers";
import Link from "next/link";
import PlanWorkspace from "@/components/PlanWorkspace";
import type { CandidateMarker } from "@/components/RouteMap";
import { computeRoute } from "@/lib/routing/directions";
import { findCandidateCities } from "@/lib/routing/candidates";
import { fetchWaypointsForCandidates } from "@/lib/routing/recommend";
import type { WaypointFetchResult } from "@/lib/routing/scoring";
import {
  validateRouteParams,
  detourCapForBudget,
  InvalidRouteParamsError,
} from "@/lib/routing/validation";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";
import { parsePersonaId } from "@/lib/personas";
import { z } from "zod/v4";

// Maximum trip duration enforced server-side to prevent resource exhaustion
// from unbounded date ranges passed via URL params.
const MAX_TRIP_DAYS = 90;

const PlanDatesSchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((d) => d.startDate <= d.endDate, {
    message: "Start date must be on or before end date.",
    path: ["endDate"],
  })
  .refine(
    (d) =>
      Math.round(
        (new Date(d.endDate + "T00:00:00Z").getTime() -
          new Date(d.startDate + "T00:00:00Z").getTime()) /
          (1000 * 60 * 60 * 24)
      ) +
        1 <=
      MAX_TRIP_DAYS,
    { message: `Trip duration cannot exceed ${MAX_TRIP_DAYS} days.`, path: ["endDate"] }
  );

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

  // Parse and validate trip dates via consolidated schema.
  // Both params must be present and valid if either is supplied.
  let startDate: string | undefined;
  let endDate: string | undefined;
  if (params.startDate !== undefined || params.endDate !== undefined) {
    const datesParsed = PlanDatesSchema.safeParse({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    if (!datesParsed.success) {
      const msg = datesParsed.error.issues[0]?.message ?? "Invalid date parameters.";
      return <ErrorScreen title="Invalid Parameters" message={msg} />;
    }
    startDate = datesParsed.data.startDate;
    endDate = datesParsed.data.endDate;
  }

  // Use total trip days × daily budget as the effective budget signal so that
  // longer trips receive proportionally more generous per-stop detour caps.
  // Falls back to daily budget alone when dates are absent (legacy URLs).
  const tripDays =
    startDate && endDate
      ? Math.round(
          (new Date(endDate + "T00:00:00Z").getTime() -
            new Date(startDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1
      : 1;
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

      waypointFetch = await fetchWaypointsForCandidates(validatedCandidates);
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
