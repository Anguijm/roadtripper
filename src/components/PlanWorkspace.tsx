"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useTransition,
} from "react";
import type { RoadsideMarker } from "@/lib/roadside/along";
import RouteMap, {
  type CandidateMarker,
  type TripStopMarker,
} from "@/components/RouteMap";
import PersonaSelector from "@/components/PersonaSelector";
import RecommendationList, {
  type AddCityPayload,
} from "@/components/RecommendationList";
import Itinerary from "@/components/Itinerary";
import NeighborhoodPanel from "@/components/NeighborhoodPanel";
import { panelCityFor, nextPanelCityId } from "@/lib/plan/panel-city";
import { itinerarySummary } from "@/lib/plan/itinerary-summary";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId } from "@/lib/personas/types";
import type { WaypointFetchResult, NeighborhoodLoadState } from "@/lib/routing/scoring";
import { formatDistance, formatDuration, formatDurationPlain } from "@/lib/routing/format";
import {
  recomputeAndRefreshAction,
  fetchNeighborhoodsAction,
  type RecomputeErrorCode,
} from "@/app/plan/actions";
import type { DirectionsResult } from "@/lib/routing/directions";
import { buildTripState, computeDeadlinePressure, type TripState, type TripLeg } from "@/lib/plan/trip-state";
import { totalDays as dateTotalDays } from "@/lib/plan/types";
import { saveTrip, MAX_SAVED_TRIPS } from "@/lib/trips/storage";
import type { SaveTripInput } from "@/lib/trips/types";

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
  /**
   * Not read since Gauntlet U1 round 2: the frontier line lost its counts
   * ("max 270 min" is in the glossary's never column). U2 decides whether
   * "up to four and a half hours off the road" comes back, and drops the
   * prop from here and the plan page if not.
   */
  maxDetourMinutes: number;
  startDate?: string;
  endDate?: string;
  dateMode?: string;
  initialCandidateFetchFailed?: boolean;
  /** Roadside survivors along the planned route, in road order. Empty when no pulled corridor is near it. */
  roadsideStops?: RoadsideMarker[];
  /**
   * The roadside stop whose card is open on the first render. Only the SSR
   * tests pass it: the card is normally opened by a tap, and a server
   * render cannot tap. The page never sets it.
   */
  initialSelectedRoadsideId?: string;
}

/**
 * One empty list, made once. A `= []` default in the destructuring would be
 * a new array on every render, and RouteMap's roadside effect keys on the
 * array's identity, so every keystroke in the workspace would tear the
 * markers down and put them back. The server hands a stable array when
 * there are stops; this is the stable one when there are none.
 */
const NO_ROADSIDE: RoadsideMarker[] = [];

/** The kinds as the sheet says them, one or two plain words; anything unknown is "place". */
const ROADSIDE_KIND_WORDS: Record<RoadsideMarker["kind"], string> = {
  attraction: "attraction", museum: "museum", viewpoint: "viewpoint", artwork: "artwork", theme_park: "theme park", zoo: "zoo",
  historic: "historic place", lighthouse: "lighthouse", tower: "tower", waterfall: "waterfall", arch: "arch", cave: "cave", park: "park",
  notable: "well-known place", other: "place",
};

/**
 * The card's line when the store has no write-up. It says so, rather than
 * turning the kind into a sentence ("A historic place."), which only
 * repeated the kind line beneath it (round-1 critic, rule 4).
 */
export const ROADSIDE_NO_WRITEUP = "No write-up for this one.";

/** How far along the road a stop sits, as the card says it: "212 km in". */
export function roadsideAlongText(alongKm: number): string {
  const km = Math.round(alongKm);
  return km < 1 ? "Right at the start" : `${km} km in`;
}

/**
 * How many roadside stops the list shows before "Show all": the strongest
 * ten. A corridor holds a few hundred survivors and the diamonds on the
 * map already say where; ten is a screen's worth on a phone.
 */
export const ROADSIDE_SHOWN_FIRST = 10;

function roadsideMapsUrl(s: Pick<RoadsideMarker, "lat" | "lng">): string {
  return `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
}

/**
 * The card for one roadside stop (Gauntlet U1). Pure: the five parts from
 * what the store gives, nothing fetched. The name, the line about it (the
 * store's, or the kind as a sentence when the store has none), the kind in
 * plain words with how far along the road, and one link-button that opens
 * the place in Google Maps. `about` and `name` are untrusted text and are
 * rendered as text.
 */
export function RoadsideCard({ stop, onClose }: { stop: RoadsideMarker; onClose?: () => void }) {
  return (
    <section
      data-roadside-card={stop.id}
      aria-label={stop.name}
      className="font-sans border border-[#e3b341] bg-[#161b22] px-3 py-3 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg leading-snug text-[#f0f6fc] break-words min-w-0">{stop.name}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${stop.name}`}
          className="shrink-0 min-w-[44px] min-h-[44px] -mt-2 -mr-2 text-2xl leading-none text-[#8b949e] hover:text-[#f0f6fc] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      <p data-roadside-line className="text-base leading-snug text-[#c9d1d9] break-words">
        {stop.about ?? ROADSIDE_NO_WRITEUP}
      </p>
      <p data-roadside-where className="text-base text-[#8b949e]">
        {ROADSIDE_KIND_WORDS[stop.kind] ?? "place"} · {roadsideAlongText(stop.alongKm)}
      </p>
      <a
        href={roadsideMapsUrl(stop)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-full min-h-[44px] text-base border border-[#e3b341] text-[#e3b341] hover:bg-[#e3b341] hover:text-[#0d1117] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
      >
        Open in Maps
      </a>
    </section>
  );
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
  startDate,
  endDate,
  dateMode,
  initialCandidateFetchFailed = false,
  roadsideStops = NO_ROADSIDE,
  initialSelectedRoadsideId,
}: PlanWorkspaceProps) {

  // Stable UUID per component mount, passed to saveTrip on every attempt so a
  // retry (or a double tap) overwrites the same entry instead of creating a
  // second one. That idempotency mattered when this wrote to Firestore and
  // still matters writing to localStorage.
  const saveTripIdRef = useRef<string>(crypto.randomUUID());
  // No "saving" state. Writing to localStorage is synchronous and sub-millisecond,
  // so a transitional label would never be painted; it was carried over from the
  // async server action this replaced. Removing it rather than forcing a paint
  // with a timer is the honest fix.
  type SaveState = "idle" | "saved" | "error";
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveAnnouncement, setSaveAnnouncement] = useState("");

  // Persona state — see Session 5 architectural lesson in commit ae3601f.
  const [activePersonaId, setActivePersonaId] = useState<PersonaId>(initialPersonaId);
  const [highlightedCityId, setHighlightedCityId] = useState<string | null>(null);

  // In arrival mode, startDate is re-derived after each recompute as stops are
  // added. In range mode it's fixed for the component's lifetime.
  const [effectiveStartDate, setEffectiveStartDate] = useState<string | undefined>(startDate);
  const [startDateAnnouncement, setStartDateAnnouncement] = useState("");
  const [startDateDerivationFailed, setStartDateDerivationFailed] = useState(false);

  // Total trip budget derived from date range.
  // Default to 1 day when no date range is provided — ensures a non-zero budget is
  // always available for calculation on legacy URLs that predate the date fields.
  const tripDays = effectiveStartDate && endDate ? dateTotalDays({ startDate: effectiveStartDate, endDate }) : 1;
  const totalBudgetMins = tripDays * budgetHours * 60;

  // Trip + recompute state.
  // `liveRoute === null` / `liveWaypointFetch === null` means "use the
  // initial server-rendered values" (Council ISC-S6-ARCH-3, S7-ARCH-2).
  const [tripStops, setTripStops] = useState<TripStopMarker[]>([]);
  const [routeSealed, setRouteSealed] = useState(false);
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
  // The itinerary opens on request; collapsed it is one line above the
  // candidates, so the first card's reason stays near the top (step 14).
  const [itineraryOpen, setItineraryOpen] = useState(false);
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
  const onTheRoadText = formatDurationPlain(liveDuration);

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
    if (!effectiveStartDate || !endDate) return null;
    return computeDeadlinePressure(
      tripState.legs,
      tripDays,
      budgetHours,
      tripState.directMinutesToDestination
    );
  }, [tripState, tripDays, budgetHours, effectiveStartDate, endDate]);

  // ── Roadside stops (Gauntlet U1) ───────────────────────────────────────
  // The card: one stop, opened by a tap on its diamond or its row, closed
  // by a second tap on the same one or the card's close control.
  const [selectedRoadsideId, setSelectedRoadsideId] = useState<string | null>(initialSelectedRoadsideId ?? null);
  const [showAllRoadside, setShowAllRoadside] = useState(false);
  // The list shows the strongest first, not road order: the diamonds on the
  // map already say where, and a person scanning ten rows wants the best ten.
  const roadsideByStrength = useMemo(
    () => [...roadsideStops].sort((a, b) => b.p - a.p || a.alongKm - b.alongKm || a.name.localeCompare(b.name, "en")),
    [roadsideStops]
  );
  const roadsideShown = showAllRoadside ? roadsideByStrength : roadsideByStrength.slice(0, ROADSIDE_SHOWN_FIRST);
  const selectedRoadside = useMemo(
    () => (selectedRoadsideId ? roadsideStops.find((s) => s.id === selectedRoadsideId) ?? null : null),
    [roadsideStops, selectedRoadsideId]
  );
  const handleRoadsideSelect = useCallback((id: string) => {
    setSelectedRoadsideId((curr) => (curr === id ? null : id));
  }, []);
  const clearRoadside = useCallback(() => setSelectedRoadsideId(null), []);
  const roadsideCardRef = useRef<HTMLDivElement>(null);
  // A tap on the map has to be answered where the person can see it: the
  // card sits above the roadside list, below the town list, so the sheet
  // scrolls to it, and a peeked sheet rises to half so the card is on
  // screen at all. Nothing moves when the card closes.
  useEffect(() => {
    if (!selectedRoadsideId) return;
    setSheetSnap((s) => (s === 0 ? 1 : s));
    roadsideCardRef.current?.scrollIntoView({ block: "start" });
  }, [selectedRoadsideId]);

  // Merged neighborhood data: recompute-fetched + on-demand local fetches.
  const effectiveNeighborhoods = useMemo(
    () => ({ ...effectiveWaypointFetch.neighborhoods, ...localNeighborhoods }),
    [effectiveWaypointFetch.neighborhoods, localNeighborhoods]
  );

  // The city whose neighborhoods are shown in the panel: a stop, or a
  // candidate being read about before it is added (step 13).
  const panelCity = useMemo(
    () => panelCityFor(panelCityId, tripStops, candidateMarkers),
    [panelCityId, tripStops, candidateMarkers]
  );
  const panelCityName = panelCity?.cityName ?? null;

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
    // A click is also a retry: a city whose on-demand read failed (a rate
    // limit from clicking through the list quickly, a blip) is forgotten so
    // the effect fetches it again instead of showing the old failure.
    setLocalNeighborhoods((prev) => {
      if (prev[cityId]?.kind !== "failed") return prev;
      const rest = { ...prev };
      delete rest[cityId];
      return rest;
    });
    setPanelCityId(cityId);
  }, []);

  // Tap a candidate marker → add to trip.
  // Tap an already-added stop marker → open its neighborhood panel.
  // Kept as-is when the list gained "See what's here" (step 13): on a phone
  // a tap on the map is the fastest way to add, and changing what it means
  // is a product decision, not a side effect of a list button.
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
        actionRequestId,
        dateMode === "arrival" ? endDate : undefined
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
        if (result.dateDerivation?.status === "ok") {
          setEffectiveStartDate(result.dateDerivation.date);
          setStartDateDerivationFailed(false);
          setStartDateAnnouncement(`Departure date updated to ${result.dateDerivation.date}`);
        } else if (result.dateDerivation?.status === "failed") {
          setStartDateDerivationFailed(true);
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
    // Stays on a stop or a candidate; moves to the last stop only when the
    // city has left both lists (see nextPanelCityId).
    setPanelCityId((curr) => nextPanelCityId(curr, tripStops, candidateMarkers));
  }, [tripStops, candidateMarkers]);

  // Whether the panel's city already has data. A boolean on purpose: the
  // merged neighborhoods object is rebuilt whenever any city's result lands,
  // and depending on it would cancel and restart the fetch in flight for the
  // panel's city every time another city's answer arrived.
  const panelHasData = panelCityId === null || effectiveNeighborhoods[panelCityId] !== undefined;

  // Fetch neighborhoods on demand when panelCityId changes and data is absent.
  useEffect(() => {
    if (!panelCityId) return;
    if (panelHasData) return;

    // City name for aria announcements, from the trip or the candidates.
    const cityName = panelCityName ?? panelCityId;

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
    // Depends on the name, a string, not on the resolved object: the object
    // is rebuilt whenever the lists change, and a rebuilt object would cancel
    // and restart a fetch in flight for the same city.
  }, [panelCityId, panelCityName, panelHasData]);

  // Brief recommendation panel highlight after each successful refresh
  // (Council ISC-S7-PROD-2 — positive proof of refresh).
  const [highlightRefresh, setHighlightRefresh] = useState(false);
  useEffect(() => {
    if (refreshTick === 0) return;
    setHighlightRefresh(true);
    const timer = window.setTimeout(() => setHighlightRefresh(false), 800);
    return () => window.clearTimeout(timer);
  }, [refreshTick]);

  // Reset "Saved ✓" when the user changes the trip after a successful save.
  useEffect(() => {
    setSaveState((s) => (s === "saved" ? "idle" : s));
  }, [tripStops, activePersonaId]);

  // Unseal when stops change — user is back to planning mode.
  useEffect(() => {
    setRouteSealed(false);
  }, [tripStops]);

  const handleSave = useCallback(() => {
    const input: SaveTripInput = {
      fromName,
      toName,
      fromLat: origin.lat,
      fromLng: origin.lng,
      toLat: destination.lat,
      toLng: destination.lng,
      budgetHours,
      startDate: effectiveStartDate,
      endDate,
      dateMode: dateMode === "arrival" ? "arrival" : undefined,
      personaId: activePersonaId,
      stops: tripStops.map((s) => ({
        cityId: s.cityId,
        cityName: s.cityName,
        lat: s.lat,
        lng: s.lng,
      })),
    };
    const result = saveTrip(input, saveTripIdRef.current);
    if (result.ok) {
      setSaveState("saved");
      setSaveAnnouncement("Trip saved to this browser.");
      return;
    }
    setSaveState("error");
    setSaveAnnouncement(
      result.error === "unavailable"
        ? "Can't save: this browser is blocking storage."
        : result.error === "quota"
        ? "Can't save: browser storage is full."
        : result.error === "limit_exceeded"
        ? `Can't save: ${MAX_SAVED_TRIPS} saved trips is the limit. Delete one first.`
        : "Can't save: the trip didn't validate."
    );
  }, [fromName, toName, origin, destination, budgetHours, effectiveStartDate, endDate, activePersonaId, tripStops]);

  const handleRetry = useCallback(() => {
    // Force a fresh recompute by bumping the request id; the effect's
    // dep is `tripStops`, so we re-run via state churn: clone the array.
    setTripStops((curr) => curr.slice());
  }, []);

  // The header's second line: the glossary's sentence for what was a
  // "Budget left" stat. The budget is the whole trip's, so "today" is only
  // right on a one-day trip; a longer trip says the span.
  const daySpan = tripDays === 1 ? "today" : `over ${tripDays} days`;
  const drivingLeftText =
    tripState.status.kind === "empty"
      ? `${formatDurationPlain(totalBudgetMins * 60)} of driving left ${daySpan}`
      : tripState.status.kind === "over_budget"
      ? `${formatDurationPlain(tripState.status.overageMinutes * 60)} more driving than fits ${daySpan}`
      : `${formatDurationPlain(tripState.status.remainingBudgetMinutes * 60)} of driving left ${daySpan}`;

  const tripCount = tripStops.length;
  const showItinerary = tripCount > 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Screen-reader live regions */}
      <div aria-live="polite" className="sr-only">{panelAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{candidatePoolAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{sheetAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{saveAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{startDateAnnouncement}</div>

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

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {/* The header (the mood chips, the numbers) scrolls with the
              content rather than staying pinned under the handle (Gauntlet
              U1, round 2). At rest nothing moves. Scrolled, the whole sheet
              is the list: on a 390 by 844 phone at the full snap a section
              scrolled to the top gets about 670 px, which holds the roadside
              heading, ten rows of 44 px or more and the "Show all" control;
              pinned, the header took about 180 of those and eight rows fit.
              The step-14 fold budget (the first town's reason above the fold
              at the middle snap) shrinks by about 70 px at rest, because the
              chips now wrap to two rows of 44 px; U2's shorter chip words
              give that back. Every button here keeps the 44 px target. */}
          <div className="px-1 pt-1 pb-3 border-b border-[#30363d] space-y-3 font-sans">
            <PersonaSelector
              activePersonaId={activePersonaId}
              onChange={handlePersonaChange}
            />
            {/* Two sentences, not three labelled stats: the glossary's
                replacement for "budget left (as a stat)" is "4 h of driving
                left today" (quality bar, rule 1). */}
            <div className="text-base leading-snug space-y-1">
              <p className="text-[#f0f6fc]">
                {totalDistanceText} · {onTheRoadText} on the road
                {isPending && (
                  <span className="text-[#d29922]" aria-hidden> …</span>
                )}
              </p>
              <p
                className={
                  tripState.status.kind === "over_budget"
                    ? "text-[#f85149]"
                    : tripState.status.kind === "warning"
                    ? "text-[#d29922]"
                    : "text-[#f0f6fc]"
                }
              >
                {drivingLeftText}
              </p>
            </div>
            {/* Only while updating; idle it costs no height. */}
            {isPending && (
              // #e3b341 rather than the #d29922 used for budget warnings: at
              // 10 px this text needs the brighter amber to clear WCAG AA
              // contrast on the #0d1117 background.
              <p
                className="text-[10px] font-mono uppercase tracking-widest text-[#e3b341] animate-pulse"
                aria-live="polite"
              >
                Updating route + recs…
              </p>
            )}
          </div>

          {/* Itinerary — ABOVE recommendations once trip is non-empty (Council
              ISC-S6-PROD-2), but as one line with a toggle, so the first
              candidate's reason is not pushed below the fold (step 14). */}
          {showItinerary && (
            <button
              type="button"
              onClick={() => setItineraryOpen((o) => !o)}
              aria-expanded={itineraryOpen}
              aria-controls="itinerary-details"
              className="w-full min-h-[44px] flex items-center justify-between gap-2 px-3 text-left text-xs font-mono uppercase tracking-widest text-[#b0b9c2] border border-[#30363d] bg-[#161b22] hover:border-[#6e7681] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
            >
              <span className="truncate">
                {/* Legs are in seconds already; the direct leg is held in
                    minutes and converted, the same way the Itinerary's
                    finalLegSeconds prop below is built. */}
                {itinerarySummary(tripStops, tripState.legs.map((l) => l.durationSeconds), Math.round(tripState.directMinutesToDestination * 60))}
              </span>
              <span aria-hidden className="text-[#8b949e]">{itineraryOpen ? "▲" : "▼"}</span>
            </button>
          )}
          {/* Always in the DOM so aria-controls resolves; `hidden` when
              collapsed. The Itinerary stays mounted, which also keeps its
              per-stop failed state across a collapse. */}
          {showItinerary && (
            <div id="itinerary-details" hidden={!itineraryOpen}>
            <Itinerary
              fromName={fromName}
              toName={toName}
              stops={tripStops}
              legDurations={tripState.legs.map((l) => l.durationSeconds)}
              finalLegSeconds={Math.round(tripState.directMinutesToDestination * 60)}
              failedStopId={failedStopId}
              selectedCityId={panelCityId}
              destinationSelected={routeSealed}
              pending={isPending}
              onRemoveStop={handleRemoveCity}
              onStopClick={handleStopClick}
              onDestinationClick={() => setRouteSealed((s) => !s)}
              accent={accent}
            />
            </div>
          )}

          {/* Neighborhood panel — follows panelCityId: a click on an Itinerary
               stop, or "See what's here" on a candidate not yet added.
               Loading: data absent (fetch in flight or not yet started).
               Loaded / empty / failed: delegated to NeighborhoodPanel. */}
          {panelCityId && panelCity && (
            effectiveNeighborhoods[panelCityId] == null ? (
              <div className="border border-[#30363d] bg-[#0d1117] mt-2 px-3 py-3">
                <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] motion-safe:animate-pulse">
                  Loading {panelCity.cityName}…
                </p>
              </div>
            ) : (
              <NeighborhoodPanel
                cityId={panelCityId}
                cityName={panelCity.cityName}
                loadState={effectiveNeighborhoods[panelCityId]}
                waypoints={panelCityWaypoints}
                failures={
                  effectiveWaypointFetch.status === "degraded"
                    ? effectiveWaypointFetch.failures
                    : []
                }
                personaId={activePersonaId}
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

          {/* Arrival mode: warn when departure date could not be re-derived after recompute. */}
          {startDateDerivationFailed && (
            <div
              role="alert"
              className="px-3 py-2 border border-[#d29922] bg-[#161b22]"
            >
              <p className="text-xs text-[#d29922]">
                Departure date could not be updated — showing last known date.
              </p>
            </div>
          )}

          {/* Deadline pressure — fires earlier than the budget warning, as soon
              as the required daily pace exceeds what the user budgeted.
              ≥0.25 days late → amber (early, correctable by adjusting stops).
              ≥1.0  days late → red   (unrecoverable without skipping stops).
              Thresholds are documented in computeDeadlinePressure. */}
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
                {/* daysRemaining ≤ 0: deadline already passed, pivot to direct-drive message. */}
                {deadlinePressure.daysRemaining <= 0
                  ? `No days left — ${formatDuration(tripState.directMinutesToDestination * 60)} still needed to reach ${toName}.`
                  : `Won't make ${toName} on time — need ${formatDuration(deadlinePressure.requiredMinutesPerDay * 60)}/day for ${Math.ceil(deadlinePressure.daysRemaining)} day${Math.ceil(deadlinePressure.daysRemaining) === 1 ? "" : "s"}, ${formatDuration((deadlinePressure.requiredMinutesPerDay - deadlinePressure.budgetMinutesPerDay) * 60)} over budget.`}
              </p>
            </div>
          )}

          {routeSealed ? (
            <p className="text-[10px] font-mono text-[#7d8590] px-1 py-2 text-center">
              Route locked · tap destination to explore more stops
            </p>
          ) : (
            <>
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
                <p aria-live="polite" className="font-sans text-base text-[#8b949e] px-1 pt-1">
                  {tripStops.length > 0
                    ? `Next stop from ${tripStops[tripStops.length - 1].cityName}`
                    : `First stop from ${fromName}`}
                  {/* The glossary's words for the count; the detour cap is
                      not said (its replacement is "nothing"). */}
                  {effectiveWaypointFetch.cities.length === 1
                    ? " · 1 town that fits today"
                    : ` · ${effectiveWaypointFetch.cities.length} towns that fit today`}
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
                  onCityPreview={handleStopClick}
                  previewedCityId={panelCityId}
                />
              </div>

            </>
          )}

          {/* Roadside stops (step 22, first-class in Gauntlet U1): what the
              model says is worth pulling over for along this road, from a
              corridor pulled and scored ahead of time. Open, strongest
              first, ten at a time; the card for the tapped one sits at the
              top of the section. Outside the sealed branch: a locked route
              still has a road, and a tap on a diamond must always answer. */}
          {roadsideStops.length > 0 && (
            <section data-roadside aria-labelledby="roadside-heading" className="font-sans px-1 py-2 border-t border-[#30363d] space-y-2">
              {selectedRoadside && (
                <div ref={roadsideCardRef} className="scroll-mt-2">
                  <RoadsideCard stop={selectedRoadside} onClose={clearRoadside} />
                </div>
              )}
              <h2 id="roadside-heading" className="text-base text-[#e3b341] px-2 pt-1">
                {roadsideStops.length === 1
                  ? "1 place worth pulling over for"
                  : `${roadsideStops.length} places worth pulling over for`}
              </h2>
              <ul className="space-y-1">
                {roadsideShown.map((s) => (
                  <li key={s.id} data-roadside-stop={s.id}>
                    <button
                      type="button"
                      onClick={() => handleRoadsideSelect(s.id)}
                      aria-expanded={selectedRoadsideId === s.id}
                      className={[
                        "w-full min-h-[44px] text-left px-2 py-2 border-l-2 focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                        selectedRoadsideId === s.id
                          ? "border-[#e3b341] bg-[#161b22]"
                          : "border-transparent hover:bg-[#161b22]",
                      ].join(" ")}
                    >
                      <span className="block text-base leading-snug text-[#f0f6fc] break-words">{s.name}</span>
                      <span className="block text-base leading-snug text-[#8b949e]">
                        {ROADSIDE_KIND_WORDS[s.kind] ?? "place"} · {roadsideAlongText(s.alongKm)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {roadsideByStrength.length > ROADSIDE_SHOWN_FIRST && (
                <button
                  type="button"
                  data-roadside-show-all
                  onClick={() => setShowAllRoadside((o) => !o)}
                  aria-expanded={showAllRoadside}
                  className="w-full min-h-[44px] text-base border border-[#30363d] text-[#f0f6fc] hover:border-[#6e7681] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
                >
                  {showAllRoadside ? "Show the ten strongest" : `Show all ${roadsideByStrength.length}`}
                </button>
              )}
            </section>
          )}

          {/* Save trip, at the end of the list rather than in the sticky
              header, so the header is short and the reason leads. No
              auth gate: trips live in this browser. */}
          {!routeSealed && (
            <div className="px-1 py-3">
              <button
                type="button"
                onClick={handleSave}
                // Disabled while a recompute is in flight so a save cannot
                // capture a half-updated trip. Not disabled after a save:
                // the trip can change again, and saving again is how it is
                // kept; the label already says "Saved" until it does.
                disabled={isPending}
                className={[
                  "w-full min-h-[44px] text-xs font-mono uppercase tracking-widest px-3 py-2 border transition-colors disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                  saveState === "saved"
                    ? "border-[#238636] text-[#3fb950]"
                    : saveState === "error"
                    ? "border-[#f85149] text-[#ff7b72]"
                    : "border-[#30363d] text-[#8b949e] hover:border-[#555] hover:text-[#f0f6fc]",
                ].join(" ")}
              >
                {saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Save failed — retry" : "Save trip"}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Map. `z-0` makes the pane its own stacking context, so nothing
          Google draws inside it (its controls carry very high z-indexes)
          can paint over the sheet, which sits at z-10 on a phone. */}
      <main className="flex-1 relative z-0">
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
          roadsideStops={roadsideStops}
          onRoadsideClick={handleRoadsideSelect}
          selectedRoadsideId={selectedRoadsideId}
          pending={isPending}
        />
      </main>
    </div>
  );
}
