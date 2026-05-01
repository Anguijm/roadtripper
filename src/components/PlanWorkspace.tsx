"use client";

import React, {
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
  type SearchArc,
} from "@/components/RouteMap";
import PersonaSelector from "@/components/PersonaSelector";
import RecommendationList, {
  type AddCityPayload,
} from "@/components/RecommendationList";
import Itinerary from "@/components/Itinerary";
import NeighborhoodPanel from "@/components/NeighborhoodPanel";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId } from "@/lib/personas/types";
import type { WaypointFetchResult, NeighborhoodLoadState } from "@/lib/routing/scoring";
import { formatDistance, formatDuration } from "@/lib/routing/format";
import {
  recomputeAndRefreshAction,
  fetchNeighborhoodsAction,
  type RecomputeErrorCode,
} from "@/app/plan/actions";
import { HOP_REACH_MAX_MINUTES } from "@/lib/routing/validation";
import type { DirectionsResult } from "@/lib/routing/directions";
import { buildTripState, computeDeadlinePressure, type TripState, type TripLeg } from "@/lib/plan/trip-state";
import { totalDays as dateTotalDays } from "@/lib/plan/types";

// ~80 km/h avg road speed: 80,000 m / 60 min ≈ 1333 m/min
const METERS_PER_DRIVE_MINUTE = 1333;

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
  startDate?: string;
  endDate?: string;
  initialCandidateFetchFailed?: boolean;
}

// 7 stops balances itinerary richness against UI clarity and API cost per recompute.
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

function computeBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  // Normalise to [-180, 180] so routes crossing the antimeridian point the right way.
  const dLngDeg = ((to.lng - from.lng + 540) % 360) - 180;
  const dLng = (dLngDeg * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

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
  startDate,
  endDate,
  initialCandidateFetchFailed = false,
}: PlanWorkspaceProps) {
  // Persona state — see Session 5 architectural lesson in commit ae3601f.
  const [activePersonaId, setActivePersonaId] = useState<PersonaId>(initialPersonaId);
  const [highlightedCityId, setHighlightedCityId] = useState<string | null>(null);

  // Total trip budget derived from date range (stable for the life of this component).
  // Default to 1 day when no date range is provided — ensures a non-zero budget is
  // always available for calculation on legacy URLs that predate the date fields.
  const tripDays = startDate && endDate ? dateTotalDays({ startDate, endDate }) : 1;
  const totalBudgetMins = tripDays * budgetHours * 60;

  // Trip + recompute state.
  // `liveRoute === null` / `liveWaypointFetch === null` means "use the
  // initial server-rendered values" (Council ISC-S6-ARCH-3, S7-ARCH-2).
  const [tripStops, setTripStops] = useState<TripStopMarker[]>([]);
  // TripState tracks accumulated leg times + budget status. Built from
  // route legs returned by recomputeAndRefreshAction; empty until first stop.
  const [tripState, setTripState] = useState<TripState>(() =>
    buildTripState([], totalBudgetMins, initialDurationSeconds / 60)
  );
  const [candidatePoolAnnouncement, setCandidatePoolAnnouncement] = useState("");
  const [liveRoute, setLiveRoute] = useState<DirectionsResult | null>(null);
  const [liveWaypointFetch, setLiveWaypointFetch] =
    useState<WaypointFetchResult | null>(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  // Inline notice when the route updated but the recommendation refresh
  // failed — keeps prior recs visible (Council S7-ARCH-2 / S7-PROD-1).
  const [recommendationsDegraded, setRecommendationsDegraded] = useState(false);
  // Bumped on each successful refresh — drives the brief panel highlight
  // that proves to the user the recommendations actually updated
  // (Council S7-PROD-2).
  const [refreshTick, setRefreshTick] = useState(0);
  // Only the most-recent failed stop is ever surfaced in the Itinerary,
  // so a single nullable id replaces the prior `Set<string>`.
  const [failedStopId, setFailedStopId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Which stop's neighborhoods to show in the panel. Defaults to the most
  // recently added stop; updated on click or add/remove.
  const [panelCityId, setPanelCityId] = useState<string | null>(null);
  // On-demand neighborhood cache for stops the user clicked that weren't
  // pre-fetched by recomputeAndRefreshAction.
  const [localNeighborhoods, setLocalNeighborhoods] = useState<
    Record<string, NeighborhoodLoadState>
  >({});
  // Screen-reader announcement for panel loading / content updates (WCAG 4.1.3).
  const [panelAnnouncement, setPanelAnnouncement] = useState("");

  // Council ISC-S6-ARCH-5 — incrementing request id, latest wins.
  const requestIdRef = useRef(0);

  // Mobile bottom sheet snap state.
  // 0 = peek (20vh), 1 = half (55vh, default), 2 = full (92vh).
  const SNAP_Y = [80, 45, 8] as const; // translateY % for each snap
  const SNAP_LABELS = ["peeked", "half-open", "fully open"] as const;
  const [sheetSnap, setSheetSnap] = useState<0 | 1 | 2>(1);
  const [sheetAnnouncement, setSheetAnnouncement] = useState("");
  const sheetRef = useRef<HTMLElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  // Base translateY% captured at drag start — avoids stale closure on sheetSnap.
  const dragBasePctRef = useRef<number>(SNAP_Y[1]);

  // Announce snap changes to screen readers after each state update.
  useEffect(() => {
    setSheetAnnouncement(`Panel now ${SNAP_LABELS[sheetSnap]}.`);
  }, [sheetSnap]);

  const cycleSnap = useCallback(() => {
    setSheetSnap((s) => ((s + 1) % 3) as 0 | 1 | 2);
  }, []);

  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    // Read base position from CSS var (set by React style prop) so we never
    // depend on the sheetSnap closure value during move.
    const raw = sheetRef.current?.style.getPropertyValue("--sheet-y") ?? "";
    const parsed = parseFloat(raw);
    dragBasePctRef.current = isNaN(parsed) ? SNAP_Y[1] : parsed;
    sheetRef.current?.style.setProperty("--sheet-duration", "0ms");
  }, []);

  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartYRef.current === null || !sheetRef.current) return;
    const vh = window.innerHeight;
    if (vh === 0) return;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    const deltaPct = (deltaY / vh) * 100;
    const clamped = Math.max(0, Math.min(95, dragBasePctRef.current + deltaPct));
    sheetRef.current.style.setProperty("--sheet-y", `${clamped}%`);
  }, []);

  const handleSheetTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartYRef.current === null || !sheetRef.current) return;
      const rawDelta = touchStartYRef.current - e.changedTouches[0].clientY;
      touchStartYRef.current = null;
      sheetRef.current.style.setProperty("--sheet-duration", "300ms");
      // Treat tiny movements as taps — cycle snap without drag logic.
      if (Math.abs(rawDelta) < 5) {
        setSheetSnap((s) => ((s + 1) % 3) as 0 | 1 | 2);
        return;
      }
      const threshold = window.innerHeight * 0.08;
      let nextSnap = sheetSnap;
      if (rawDelta > threshold && sheetSnap < 2) nextSnap = (sheetSnap + 1) as 1 | 2;
      else if (rawDelta < -threshold && sheetSnap > 0) nextSnap = (sheetSnap - 1) as 0 | 1;
      setSheetSnap(nextSnap);
    },
    [sheetSnap]
  );

  // Browser cancels the touch (system gesture, incoming call) — restore state
  // so transitions stay enabled and the sheet isn't stuck at a mid-drag position.
  const handleSheetTouchCancel = useCallback(() => {
    if (!sheetRef.current) return;
    touchStartYRef.current = null;
    sheetRef.current.style.setProperty("--sheet-duration", "300ms");
    sheetRef.current.style.setProperty("--sheet-y", `${SNAP_Y[sheetSnap]}%`);
  }, [sheetSnap]);

  const accent = PERSONAS[activePersonaId].accentColor;

  // Derived live values — fall back to the server-rendered initials.
  // `bounds` (initial corridor) is the only camera input — recomputes
  // redraw the polyline in place without re-fitting (Council ARCH-2).
  const livePolyline = liveRoute?.encodedPolyline ?? encodedPolyline;
  const liveDistance = liveRoute?.totalDistanceMeters ?? initialDistanceMeters;
  const liveDuration = liveRoute?.totalDurationSeconds ?? initialDurationSeconds;
  const totalDistanceText = formatDistance(liveDistance);
  const totalDurationText = formatDuration(liveDuration);

  // The recommendation set the user actually sees — refreshed when present,
  // initial server prop otherwise (Council ISC-S7-ARCH-2).
  const effectiveWaypointFetch = liveWaypointFetch ?? waypointFetch;

  // Live candidate markers derived from the effective waypoint set so the
  // map updates after each refresh (Council ISC-S7-ARCH-1 lat/lng now on
  // CityContext, no client-side lookup needed).
  const liveCandidateMarkers = useMemo<CandidateMarker[]>(() => {
    if (liveWaypointFetch === null) return candidateMarkers;
    return liveWaypointFetch.cities.map((c) => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      detourMinutes: c.detourMinutes,
    }));
  }, [liveWaypointFetch, candidateMarkers]);

  // cityId → {lat,lng} lookup so RecommendationList can build TripStops.
  // Sources from the effective set so refreshed cities become addable.
  const cityCoords = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const c of liveCandidateMarkers) {
      m.set(c.id, { lat: c.lat, lng: c.lng });
    }
    return m;
  }, [liveCandidateMarkers]);

  const addedCityIds = useMemo(
    () => new Set(tripStops.map((s) => s.cityId)),
    [tripStops]
  );

  // Deadline pressure: how much harder the user needs to drive each remaining
  // day to reach the destination by the end date. Only shown when a date range
  // was provided and at least one stop has been added.
  const deadlinePressure = useMemo(() => {
    if (!startDate || !endDate) return null;
    return computeDeadlinePressure(
      tripState.legs,
      tripDays,
      budgetHours,
      tripState.directMinutesToDestination
    );
  }, [tripState, tripDays, budgetHours, startDate, endDate]);

  // Arc shows the search semicircle ahead of the frontier stop (last added, or origin).
  const searchArc = useMemo<SearchArc>(() => {
    const arcCenter =
      tripStops.length > 0
        ? { lat: tripStops[tripStops.length - 1].lat, lng: tripStops[tripStops.length - 1].lng }
        : { lat: origin.lat, lng: origin.lng };
    return {
      center: arcCenter,
      radiusMeters: Math.max(0, Math.min(maxDetourMinutes, HOP_REACH_MAX_MINUTES)) * METERS_PER_DRIVE_MINUTE,
      headingDeg: computeBearing(arcCenter, { lat: destination.lat, lng: destination.lng }),
    };
  }, [tripStops, origin, destination, maxDetourMinutes]);

  // Merged neighborhood data: recompute-fetched + on-demand local fetches.
  const effectiveNeighborhoods = useMemo(
    () => ({ ...effectiveWaypointFetch.neighborhoods, ...localNeighborhoods }),
    [effectiveWaypointFetch.neighborhoods, localNeighborhoods]
  );

  // The stop whose neighborhoods are shown in the panel.
  const panelStop = tripStops.find((s) => s.cityId === panelCityId) ?? null;

  const panelCityWaypoints = useMemo(
    () =>
      panelCityId
        ? effectiveWaypointFetch.waypoints.filter(
            (w) => w.cityId === panelCityId
          )
        : [],
    [effectiveWaypointFetch.waypoints, panelCityId]
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
    // Auto-select the newly added stop for the neighborhood panel.
    setPanelCityId(city.cityId);
  }, []);

  const handleRemoveCity = useCallback((cityId: string) => {
    setTripStops((curr) => curr.filter((s) => s.cityId !== cityId));
    setFailedStopId((curr) => (curr === cityId ? null : curr));
  }, []);

  const handleStopClick = useCallback((cityId: string) => {
    setPanelCityId(cityId);
  }, []);

  // Tap a candidate marker → add to trip.
  // Tap an already-added stop marker → open its neighborhood panel.
  const handleMapClick = useCallback((cityId: string) => {
    if (addedCityIds.has(cityId)) {
      handleStopClick(cityId);
      return;
    }
    const marker = liveCandidateMarkers.find((m) => m.id === cityId);
    if (!marker) return;
    handleAddCity({ cityId: marker.id, cityName: marker.name, lat: marker.lat, lng: marker.lng });
  }, [addedCityIds, liveCandidateMarkers, handleAddCity, handleStopClick]);

  // ── Recompute + refresh effect ─────────────────────────────────────────
  // Fires whenever the user changes the trip-stops list.
  // Empty-stops branch restores the server-rendered route AND
  // recommendations via the `liveRoute = null` / `liveWaypointFetch = null`
  // pattern (Council ISC-S6-ARCH-3, S7-ARCH-2). The `requestIdRef` increment
  // is gated behind that early-return so empty resets don't burn IDs
  // (Council S7-ARCH-5).
  useEffect(() => {
    if (tripStops.length === 0) {
      if (liveRoute !== null) setLiveRoute(null);
      if (liveWaypointFetch !== null) setLiveWaypointFetch(null);
      if (recomputeError !== null) setRecomputeError(null);
      if (recommendationsDegraded) setRecommendationsDegraded(false);
      if (failedStopId !== null) setFailedStopId(null);
      setTripState(buildTripState([], totalBudgetMins, initialDurationSeconds / 60));
      return;
    }

    const myId = ++requestIdRef.current;
    const stopsForRequest = tripStops.map((s) => ({
      cityId: s.cityId,
      lat: s.lat,
      lng: s.lng,
    }));
    const lastStopCityId = stopsForRequest[stopsForRequest.length - 1]?.cityId;
    // Generated before the transition so any retry of this specific action
    // reuses the same key — prevents double-charging daily quota on re-submits.
    const actionRequestId = crypto.randomUUID();

    startTransition(async () => {
      const result = await recomputeAndRefreshAction(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        stopsForRequest,
        budgetHours,
        lastStopCityId,
        actionRequestId
      );

      // Stale-response guard — wraps BOTH state updates so a stale
      // response can't half-update (Council ISC-S7-ARCH-5).
      if (myId !== requestIdRef.current) return;

      if (result.ok) {
        // Council ISC-S7-ARCH-4 — atomic batching: setters fire on adjacent
        // lines after the final await with NO intervening await. React 19
        // batches into a single render commit.
        setLiveRoute(result.route);

        // Build TripState from per-leg route data.
        // legs[i] = drive from stop[i-1] (or origin) to stop[i].
        // legs[N] = drive from last stop to destination = directMinutesToDestination.
        const routeLegs = result.route.legs;
        // "__origin__" is the sentinel cityId for the trip's start point, which
        // has no Urban Explorer city entry.
        const tripLegs: TripLeg[] = stopsForRequest.map((stop, i) => ({
          originCityId: i === 0 ? "__origin__" : stopsForRequest[i - 1].cityId,
          destinationCityId: stop.cityId,
          durationSeconds: routeLegs[i]?.durationSeconds ?? 0,
          distanceMeters: routeLegs[i]?.distanceMeters ?? 0,
        }));
        // routeLegs[N] is the final leg (last stop → destination); fall back to
        // the initial direct-route duration if per-leg data is unexpectedly absent.
        const directMinsToDest = routeLegs[stopsForRequest.length]
          ? routeLegs[stopsForRequest.length].durationSeconds / 60
          : initialDurationSeconds / 60;
        setTripState(buildTripState(tripLegs, totalBudgetMins, directMinsToDest));

        if (result.waypointStatus === "fresh") {
          setLiveWaypointFetch(result.waypointFetch);
          setRecommendationsDegraded(false);
          setRefreshTick((t) => t + 1);
          const count = result.waypointFetch.cities.length;
          setCandidatePoolAnnouncement(
            `Candidate pool updated: ${count} cit${count === 1 ? "y" : "ies"} found.`
          );
        } else {
          // Degraded — keep the prior liveWaypointFetch (Council S7-ARCH-2).
          setRecommendationsDegraded(true);
        }
        setRecomputeError(null);
        setFailedStopId(null);
      } else {
        // Council ISC-S6-PROD-3: do NOT roll back tripStops; keep prior
        // polyline AND prior recommendations; mark the most recently
        // added stop as failed.
        setRecomputeError(ERROR_LABELS[result.error]);
        const lastStop = stopsForRequest[stopsForRequest.length - 1];
        setFailedStopId(lastStop ? lastStop.cityId : null);
      }
    });
    // origin/destination/budgetHours are stable for the life of this
    // PlanWorkspace (server props don't mutate client-side). live*,
    // recomputeError, recommendationsDegraded, failedStopId are
    // intentionally excluded — setting them inside the effect would
    // cause a feedback loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStops]);

  // If the paneled city is removed, reset to the new last stop (or null).
  useEffect(() => {
    setPanelCityId((curr) => {
      if (curr === null) return curr;
      if (tripStops.some((s) => s.cityId === curr)) return curr;
      return tripStops[tripStops.length - 1]?.cityId ?? null;
    });
  }, [tripStops]);

  // Fetch neighborhoods on demand when panelCityId changes and data is absent.
  useEffect(() => {
    if (!panelCityId) return;
    if (effectiveNeighborhoods[panelCityId] !== undefined) return;

    // Find city name for aria announcements.
    const cityName =
      tripStops.find((s) => s.cityId === panelCityId)?.cityName ?? panelCityId;

    let cancelled = false;
    setPanelAnnouncement(`Loading ${cityName} neighborhoods`);
    fetchNeighborhoodsAction(panelCityId)
      .then((result) => {
        if (cancelled) return;
        setLocalNeighborhoods((prev) => ({
          ...prev,
          [result.cityId]: result.ok ? result.loadState : { kind: "failed" },
        }));
        setPanelAnnouncement(
          result.ok ? `Showing neighborhoods for ${cityName}` : `Could not load neighborhoods for ${cityName}`
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLocalNeighborhoods((prev) => ({
          ...prev,
          [panelCityId]: { kind: "failed" },
        }));
        setPanelAnnouncement(`Could not load neighborhoods for ${cityName}`);
      });
    return () => { cancelled = true; };
  }, [panelCityId, effectiveNeighborhoods]);

  // Brief recommendation panel highlight after each successful refresh
  // (Council ISC-S7-PROD-2 — positive proof of refresh).
  const [highlightRefresh, setHighlightRefresh] = useState(false);
  useEffect(() => {
    if (refreshTick === 0) return;
    setHighlightRefresh(true);
    const timer = window.setTimeout(() => setHighlightRefresh(false), 800);
    return () => window.clearTimeout(timer);
  }, [refreshTick]);

  const handleRetry = useCallback(() => {
    // Force a fresh recompute by bumping the request id; the effect's
    // dep is `tripStops`, so we re-run via state churn: clone the array.
    setTripStops((curr) => curr.slice());
  }, []);

  const tripCount = tripStops.length;
  const showItinerary = tripCount > 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Screen-reader live regions */}
      <div aria-live="polite" className="sr-only">{panelAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{candidatePoolAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{sheetAnnouncement}</div>

      {/* Side panel / mobile bottom sheet */}
      <aside
        ref={sheetRef}
        style={{ "--sheet-y": `${SNAP_Y[sheetSnap]}%` } as React.CSSProperties}
        className="plan-sheet md:static md:w-[360px] md:z-auto border-t md:border-t-0 md:border-r border-[#30363d] bg-[#0d1117] flex flex-col min-h-0"
      >
        {/* Drag handle — mobile only */}
        <div
          className="flex justify-center items-center min-h-[44px] cursor-grab active:cursor-grabbing touch-none md:hidden"
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onTouchCancel={handleSheetTouchCancel}
          role="button"
          tabIndex={0}
          aria-label={`Panel ${SNAP_LABELS[sheetSnap]}. Tap to ${sheetSnap < 2 ? "expand" : "collapse"}.`}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") cycleSnap(); }}
        >
          <div className="w-8 h-1 rounded-full bg-[#6e7681]" aria-hidden />
        </div>

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
                Budget left
              </p>
              <p className={[
                "mt-0.5",
                tripState.status.kind === "over_budget"
                  ? "text-[#f85149]"
                  : tripState.status.kind === "warning"
                  ? "text-[#d29922]"
                  : "text-[#f0f6fc]",
              ].join(" ")}>
                {tripState.status.kind === "empty"
                  ? formatDuration(totalBudgetMins * 60)
                  : tripState.status.kind === "over_budget"
                  ? `−${formatDuration(tripState.status.overageMinutes * 60)}`
                  : formatDuration(tripState.status.remainingBudgetMinutes * 60)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
              Candidates ({effectiveWaypointFetch.cities.length}) · max{" "}
              {maxDetourMinutes}min
            </p>
            {isPending && (
              <p
                className="text-[10px] font-mono uppercase tracking-widest text-[#d29922] animate-pulse"
                aria-live="polite"
              >
                Updating route + recs…
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* Itinerary — ABOVE recommendations once trip is non-empty (Council ISC-S6-PROD-2) */}
          {showItinerary && (
            <Itinerary
              fromName={fromName}
              toName={toName}
              stops={tripStops}
              legDurations={tripState.legs.map((l) => l.durationSeconds)}
              failedStopId={failedStopId}
              selectedCityId={panelCityId}
              pending={isPending}
              onRemoveStop={handleRemoveCity}
              onStopClick={handleStopClick}
              accent={accent}
            />
          )}

          {/* Neighborhood panel — follows panelCityId (click any Itinerary stop).
               Loading: data absent (fetch in flight or not yet started).
               Loaded / empty / failed: delegated to NeighborhoodPanel. */}
          {panelCityId && panelStop && (
            effectiveNeighborhoods[panelCityId] == null ? (
              <div className="border border-[#30363d] bg-[#0d1117] mt-2 px-3 py-3">
                <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] motion-safe:animate-pulse">
                  Loading {panelStop.cityName}…
                </p>
              </div>
            ) : (
              <NeighborhoodPanel
                cityId={panelCityId}
                cityName={panelStop.cityName}
                loadState={effectiveNeighborhoods[panelCityId]}
                waypoints={panelCityWaypoints}
                failures={
                  effectiveWaypointFetch.status === "degraded"
                    ? effectiveWaypointFetch.failures
                    : []
                }
              />
            )
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

          {/* Recommendation refresh failed — keep prior recs visible
              (Council ISC-S7-ARCH-2 / S7-PROD-1). */}
          {recommendationsDegraded && (
            <div className="px-3 py-2 border border-[#d29922] bg-[#161b22]">
              <p className="text-xs text-[#d29922] leading-snug">
                Couldn&apos;t refresh recommendations — showing previous.
              </p>
            </div>
          )}

          {/* Budget warning — assertive so screen readers interrupt current speech
              (time-sensitive: user needs to know before adding more stops). */}
          {(tripState.status.kind === "warning" || tripState.status.kind === "over_budget") && (
            <div
              role="alert"
              className={`px-3 py-2 border bg-[#161b22] ${
                tripState.status.kind === "over_budget"
                  ? "border-[#f85149]"
                  : "border-[#d29922]"
              }`}
            >
              <p className={`text-xs leading-snug ${
                tripState.status.kind === "over_budget"
                  ? "text-[#f85149]"
                  : "text-[#d29922]"
              }`}>
                {tripState.status.kind === "over_budget"
                  ? `Over budget by ${formatDuration(tripState.status.overageMinutes * 60)}.`
                  : `Budget tight — ${formatDuration(tripState.status.directMinutesToDestination * 60)} direct to ${toName} with ${formatDuration(tripState.status.remainingBudgetMinutes * 60)} remaining.`}
              </p>
            </div>
          )}

          {/* Deadline pressure — fires earlier than the budget warning, as soon
              as the required daily pace exceeds what the user budgeted. */}
          {deadlinePressure && deadlinePressure.daysLate >= 0.25 && (
            <div
              role="alert"
              className={`px-3 py-2 border bg-[#161b22] overflow-hidden ${
                deadlinePressure.daysLate >= 1
                  ? "border-[#f85149]"
                  : "border-[#d29922]"
              }`}
            >
              <p className={`text-xs leading-snug break-words ${
                deadlinePressure.daysLate >= 1 ? "text-[#f85149]" : "text-[#d29922]"
              }`}>
                {deadlinePressure.daysRemaining <= 0
                  ? `No days left — ${formatDuration(tripState.directMinutesToDestination * 60)} still needed to reach ${toName}.`
                  : `Won't make ${toName} on time — need ${formatDuration(deadlinePressure.requiredMinutesPerDay * 60)}/day for ${Math.ceil(deadlinePressure.daysRemaining)} day${Math.ceil(deadlinePressure.daysRemaining) === 1 ? "" : "s"}, ${formatDuration((deadlinePressure.requiredMinutesPerDay - deadlinePressure.budgetMinutesPerDay) * 60)} over budget.`}
              </p>
            </div>
          )}

          {/* Distinguish API error from genuine empty-radius result. */}
          {initialCandidateFetchFailed && liveWaypointFetch === null && (
            <div className="px-3 py-2 border border-[#f85149] bg-[#161b22]" role="alert">
              <p className="text-xs text-[#f85149] leading-snug">
                Couldn&apos;t load nearby cities — route is still available.
              </p>
            </div>
          )}
          {!initialCandidateFetchFailed &&
            liveWaypointFetch === null &&
            effectiveWaypointFetch.cities.length === 0 && (
              <div className="px-3 py-2">
                <p className="text-xs font-mono text-[#b0b9c2]">
                  No nearby cities found within range.
                </p>
              </div>
            )}

          {/* Frontier label — tells the user which stop the next candidates
              are radiating from so the changing list makes sense. */}
          {effectiveWaypointFetch.cities.length > 0 && (
            <p aria-live="polite" className="text-[10px] font-mono uppercase tracking-widest text-[#7d8590] px-1 pt-1">
              {tripStops.length > 0
                ? `Next stop from ${tripStops[tripStops.length - 1].cityName}`
                : `First stop from ${fromName}`}
            </p>
          )}

          {/* Council ISC-S7-PROD-2 — brief panel highlight on each
              successful refresh proves the list actually updated. */}
          <div
            className={
              highlightRefresh
                ? "transition-shadow duration-700 shadow-[0_0_0_1px_rgba(210,153,34,0.6)]"
                : "transition-shadow duration-700"
            }
          >
            <RecommendationList
              fetchResult={effectiveWaypointFetch}
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
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 relative">
        <RouteMap
          origin={origin}
          destination={destination}
          encodedPolyline={livePolyline}
          bounds={bounds}
          candidates={liveCandidateMarkers}
          routeColor={accent}
          highlightedCandidateId={highlightedCityId}
          onCandidateClick={handleMapClick}
          tripStops={tripStops}
          pending={isPending}
          searchArc={searchArc}
        />
      </main>
    </div>
  );
}
