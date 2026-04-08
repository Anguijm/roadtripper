"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useTransition,
} from "react";
import RouteMap, {
  type CandidateMarker,
  type TripStopMarker,
} from "@/components/RouteMap";
import PersonaSelector from "@/components/PersonaSelector";
import RecommendationList, {
  type AddCityPayload,
} from "@/components/RecommendationList";
import Itinerary from "@/components/Itinerary";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId } from "@/lib/personas/types";
import type { WaypointFetchResult } from "@/lib/routing/scoring";
import { formatDistance, formatDuration } from "@/lib/routing/format";
import {
  recomputeRouteAction,
  type RecomputeErrorCode,
} from "@/app/plan/actions";
import type { DirectionsResult } from "@/lib/routing/directions";

interface PlanWorkspaceProps {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  encodedPolyline: string;
  bounds?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  candidateMarkers: CandidateMarker[];
  waypointFetch: WaypointFetchResult;
  initialPersonaId: PersonaId;
  budgetHours: number;
  initialDistanceMeters: number;
  initialDurationSeconds: number;
  fromName: string;
  toName: string;
  maxDetourMinutes: number;
}

const MAX_TRIP_STOPS = 7;

// Compile-time exhaustiveness — adding a new RecomputeErrorCode forces a label.
const ERROR_LABELS: Record<RecomputeErrorCode, string> = {
  invalid_input: "Couldn't update route — invalid stop coordinates.",
  too_many_stops: "Trip is at the maximum number of stops.",
  rate_limited: "Slow down — too many recompute requests. Try again in a moment.",
  quota_exceeded: "Daily route-recompute quota reached. Try again tomorrow.",
  upstream_unavailable: "Routes service is unavailable. Retry in a moment.",
  internal_error: "Something went wrong recomputing the route.",
};

export default function PlanWorkspace({
  origin,
  destination,
  encodedPolyline,
  bounds,
  candidateMarkers,
  waypointFetch,
  initialPersonaId,
  budgetHours,
  initialDistanceMeters,
  initialDurationSeconds,
  fromName,
  toName,
  maxDetourMinutes,
}: PlanWorkspaceProps) {
  // Persona state — see Session 5 architectural lesson in commit ae3601f.
  const [activePersonaId, setActivePersonaId] = useState<PersonaId>(initialPersonaId);
  const [highlightedCityId, setHighlightedCityId] = useState<string | null>(null);

  // Trip + recompute state.
  // `liveRoute === null` means "use the initial server-rendered values".
  // (Council ISC-S6-ARCH-3 / PROD-5)
  const [tripStops, setTripStops] = useState<TripStopMarker[]>([]);
  const [liveRoute, setLiveRoute] = useState<DirectionsResult | null>(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  // Only the most-recent failed stop is ever surfaced in the Itinerary,
  // so a single nullable id replaces the prior `Set<string>`.
  const [failedStopId, setFailedStopId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Council ISC-S6-ARCH-5 — incrementing request id, latest wins.
  const requestIdRef = useRef(0);

  const accent = PERSONAS[activePersonaId].accentColor;

  // Derived live values — fall back to the server-rendered initials.
  // `bounds` (initial corridor) is the only camera input — recomputes
  // redraw the polyline in place without re-fitting (Council ARCH-2).
  const livePolyline = liveRoute?.encodedPolyline ?? encodedPolyline;
  const liveDistance = liveRoute?.totalDistanceMeters ?? initialDistanceMeters;
  const liveDuration = liveRoute?.totalDurationSeconds ?? initialDurationSeconds;
  const totalDistanceText = formatDistance(liveDistance);
  const totalDurationText = formatDuration(liveDuration);
  const totalDays =
    budgetHours > 0 ? Math.ceil(liveDuration / 3600 / budgetHours) : 0;

  // cityId → {lat,lng} lookup so RecommendationList can build TripStops.
  const cityCoords = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const c of candidateMarkers) {
      m.set(c.id, { lat: c.lat, lng: c.lng });
    }
    return m;
  }, [candidateMarkers]);

  const addedCityIds = useMemo(
    () => new Set(tripStops.map((s) => s.cityId)),
    [tripStops]
  );

  // ── Persona / hover handlers ───────────────────────────────────────────
  const handlePersonaChange = useCallback((next: PersonaId) => {
    setActivePersonaId(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("persona", next);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const handleMapClick = useCallback((cityId: string) => {
    setHighlightedCityId((curr) => (curr === cityId ? null : cityId));
  }, []);

  // ── Trip add/remove ────────────────────────────────────────────────────
  const handleAddCity = useCallback((city: AddCityPayload) => {
    setTripStops((curr) => {
      if (curr.length >= MAX_TRIP_STOPS) return curr;
      if (curr.some((s) => s.cityId === city.cityId)) return curr;
      return [
        ...curr,
        {
          cityId: city.cityId,
          cityName: city.cityName,
          lat: city.lat,
          lng: city.lng,
        },
      ];
    });
  }, []);

  const handleRemoveCity = useCallback((cityId: string) => {
    setTripStops((curr) => curr.filter((s) => s.cityId !== cityId));
    setFailedStopId((curr) => (curr === cityId ? null : curr));
  }, []);

  // ── Recompute effect ───────────────────────────────────────────────────
  // Fires whenever the user changes the trip-stops list.
  // Skips when the list is empty AND we already have the initial polyline
  // (Council ISC-S6-ARCH-3 — restore via `liveRoute = null`).
  useEffect(() => {
    if (tripStops.length === 0) {
      // Reset to the initial server-rendered route. Guards prevent
      // wasted re-renders on the very first mount when these are
      // already at their reset values.
      if (liveRoute !== null) setLiveRoute(null);
      if (recomputeError !== null) setRecomputeError(null);
      if (failedStopId !== null) setFailedStopId(null);
      return;
    }

    const myId = ++requestIdRef.current;
    const stopsForRequest = tripStops.map((s) => ({
      cityId: s.cityId,
      lat: s.lat,
      lng: s.lng,
    }));

    startTransition(async () => {
      const result = await recomputeRouteAction(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        stopsForRequest
      );

      // Stale-response guard — bail if a newer request started.
      if (myId !== requestIdRef.current) return;

      if (result.ok) {
        setLiveRoute(result.route);
        setRecomputeError(null);
        setFailedStopId(null);
      } else {
        // Council ISC-S6-PROD-3: do NOT roll back tripStops; keep prior
        // polyline; mark the most recently added stop as failed.
        setRecomputeError(ERROR_LABELS[result.error]);
        const lastStop = stopsForRequest[stopsForRequest.length - 1];
        setFailedStopId(lastStop ? lastStop.cityId : null);
      }
    });
    // origin/destination/initialFromProps are stable for the life of this
    // PlanWorkspace (server props don't mutate client-side). liveRoute,
    // recomputeError, failedStopId are intentionally excluded — setting
    // them inside the effect would cause a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops]);

  const handleRetry = useCallback(() => {
    // Force a fresh recompute by bumping the request id; the effect's
    // dep is `tripStops`, so we re-run via state churn: clone the array.
    setTripStops((curr) => curr.slice());
  }, []);

  const tripCount = tripStops.length;
  const showItinerary = tripCount > 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Side panel */}
      <aside className="w-[360px] border-r border-[#30363d] bg-[#0d1117] flex flex-col min-h-0">
        <div className="p-3 border-b border-[#30363d] space-y-3">
          <PersonaSelector
            activePersonaId={activePersonaId}
            onChange={handlePersonaChange}
          />
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="font-mono uppercase tracking-widest text-[#7d8590]">
                Distance
              </p>
              <p className="text-[#f0f6fc] mt-0.5 flex items-center gap-1">
                {totalDistanceText}
                {isPending && (
                  <span className="text-[#d29922] text-[10px]">…</span>
                )}
              </p>
            </div>
            <div>
              <p className="font-mono uppercase tracking-widest text-[#7d8590]">
                Drive
              </p>
              <p className="text-[#f0f6fc] mt-0.5">{totalDurationText}</p>
            </div>
            <div>
              <p className="font-mono uppercase tracking-widest text-[#7d8590]">
                Days @ {budgetHours}h
              </p>
              <p className="text-[#f0f6fc] mt-0.5">{totalDays}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
              Candidates ({waypointFetch.cities.length}) · max {maxDetourMinutes}
              min detour
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Itinerary — ABOVE recommendations once trip is non-empty (Council ISC-S6-PROD-2) */}
          {showItinerary && (
            <Itinerary
              fromName={fromName}
              toName={toName}
              stops={tripStops}
              failedStopId={failedStopId}
              pending={isPending}
              onRemoveStop={handleRemoveCity}
              accent={accent}
            />
          )}

          {/* Recompute error banner with Retry */}
          {recomputeError && (
            <div className="px-3 py-2 border border-[#f85149] bg-[#161b22] flex items-start justify-between gap-2">
              <p className="text-xs text-[#f85149] leading-snug">{recomputeError}</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={isPending}
                className="text-[10px] font-mono uppercase tracking-widest border border-[#f85149] text-[#f85149] px-2 py-0.5 hover:bg-[#f85149] hover:text-[#0d1117] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          )}

          {/* Stale recommendations notice (Council ISC-S6-PROD-1) */}
          {showItinerary && (
            <div className="px-3 py-2 border border-[#d29922] bg-[#161b22]">
              <p className="text-xs text-[#d29922] leading-snug">
                Showing stops along your original route. Replan to refresh.
              </p>
            </div>
          )}

          <RecommendationList
            fetchResult={waypointFetch}
            activePersonaId={activePersonaId}
            highlightedCityId={highlightedCityId}
            onCityHover={setHighlightedCityId}
            cityCoords={cityCoords}
            addedCityIds={addedCityIds}
            onAddCity={handleAddCity}
            onRemoveCity={handleRemoveCity}
            pending={isPending}
            atCap={tripCount >= MAX_TRIP_STOPS}
          />
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 relative">
        <RouteMap
          origin={origin}
          destination={destination}
          encodedPolyline={livePolyline}
          bounds={bounds}
          candidates={candidateMarkers}
          routeColor={accent}
          highlightedCandidateId={highlightedCityId}
          onCandidateClick={handleMapClick}
          tripStops={tripStops}
          pending={isPending}
        />
      </main>
    </div>
  );
}
