"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  APIProvider,
  ControlPosition,
  Map as GMap,
  useMap,
} from "@vis.gl/react-google-maps";

export interface CandidateMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  detourMinutes: number;
}

export interface TripStopMarker {
  cityId: string;
  cityName: string;
  lat: number;
  lng: number;
}

/** A roadside survivor to draw: not a city, so no cityId, and never a trip stop. */
export interface RoadsideMapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** The model's probability that a road-tripper would stop; the zoom rule keys on it. */
  p: number;
}

/**
 * How sure a roadside stop has to be to show at a given zoom. At a
 * state-wide view (zoom 7 and under) a corridor holds hundreds of
 * survivors and the diamonds pile up on every city, so only the strongest
 * show; zoomed to a region, the middle; zoomed to a town (10 and up),
 * every survivor. The line at 10 is where Google's map shows individual
 * streets, which is where a person is choosing a stop rather than a
 * region. The bottom value is the store's own line (MAP_THRESHOLD, 0.45),
 * so nothing is hidden at town zoom that the sidebar lists.
 */
export const ROADSIDE_ZOOM_STEPS: ReadonlyArray<readonly [zoomBelow: number, minP: number]> = [
  [8, 0.7],
  [10, 0.55],
];
export function roadsideMinProbabilityAt(zoom: number, line = 0.45): number {
  for (const [below, minP] of ROADSIDE_ZOOM_STEPS) if (zoom < below) return Math.max(minP, line);
  return line;
}

/**
 * Amber, the colour PlanWorkspace's pending pulse and the roadside list's
 * heading already use (`#e3b341` in src/components/PlanWorkspace.tsx), so
 * it reads as "ours" and unlike any persona's route colour. Change all
 * three together or the map and the list stop agreeing.
 */
export const ROADSIDE_COLOR = "#e3b341";

/**
 * A roadside marker: a diamond, so it cannot be mistaken for a round city
 * candidate or a numbered square trip stop even in greyscale. Same 44 px
 * canvas as the candidate icon for the touch target. Pure: an SVG data URI
 * and two numbers; the google.maps objects are made by the caller.
 */
export function roadsideMarkerSvg(color = ROADSIDE_COLOR): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="M22 13 L31 22 L22 31 L13 22 Z" fill="${color}" fill-opacity="0.95" stroke="#0d1117" stroke-width="2"/></svg>`;
}

export interface SearchArc {
  center: google.maps.LatLngLiteral;
  radiusMeters: number;
  headingDeg: number;
}

interface RouteMapProps {
  origin?: google.maps.LatLngLiteral;
  destination?: google.maps.LatLngLiteral;
  encodedPolyline?: string;
  bounds?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  candidates?: CandidateMarker[];
  /** Persona accent color for the route line. Defaults to explorer blue. */
  routeColor?: string;
  /** City id currently highlighted (hovered / selected from the list) */
  highlightedCandidateId?: string | null;
  /** Fired when the user clicks a candidate marker on the map */
  onCandidateClick?: (cityId: string) => void;
  /** Ordered trip stops — rendered as numbered square markers */
  tripStops?: TripStopMarker[];
  /** Subtle dim applied to the polyline while a recompute is pending */
  pending?: boolean;
  /** 180° arc visualising the radial search area ahead of the frontier stop */
  searchArc?: SearchArc | null;
  /** Roadside survivors along the route — amber diamonds, distinct from cities and trip stops */
  roadsideStops?: RoadsideMapMarker[];
}

const NYC: google.maps.LatLngLiteral = { lat: 40.7128, lng: -74.006 };
const DC: google.maps.LatLngLiteral = { lat: 38.9072, lng: -77.0369 };

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1c2128" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7d8590" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#3d444d" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#262c36" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a5159" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#161b22" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1c2128" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#30363d" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

/**
 * Builds a candidate marker icon as an SVG data URI.
 * The canvas is 44×44px (WCAG 2.5.5 touch target) with the visible circle
 * centered inside, so the tap area is large while the visual stays compact.
 * Must be called inside effects where google.maps is guaranteed loaded.
 */
function candidateMarkerIcon(color: string, active = false): google.maps.Icon {
  const r = active ? 10 : 6;
  const stroke = active ? "#f0f6fc" : "#0d1117";
  const sw = active ? 3 : 2;
  const opacity = active ? 1 : 0.9;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="${r}" fill="${color}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(22, 22),
    scaledSize: new google.maps.Size(44, 44),
  };
}

/** Approximates a 180° forward-facing arc as a polyline path.
 *  steps=32 → 33 points: smooth at typical zoom levels, negligible DOM cost. */
function buildSemicirclePoints(
  center: google.maps.LatLngLiteral,
  radiusMeters: number,
  headingDeg: number,
  steps = 32
): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = [];
  for (let i = 0; i <= steps; i++) {
    const angleDeg = headingDeg - 90 + (180 * i) / steps;
    try {
      const pt = google.maps.geometry.spherical.computeOffset(
        new google.maps.LatLng(center.lat, center.lng),
        radiusMeters,
        angleDeg
      );
      points.push({ lat: pt.lat(), lng: pt.lng() });
    } catch {
      // SDK error for this point — skip it; arc degrades gracefully.
    }
  }
  return points;
}

/**
 * Renders a precomputed encoded polyline directly on the map.
 * Avoids a second Directions API call when the polyline was already
 * computed server-side.
 *
 * Effect split (do not collapse — each boundary was added to fix a specific bug):
 *   1a. Polyline geometry — `[map, encodedPolyline, routeColor]`
 *       Tears down and rebuilds JUST the line when the route changes.
 *   1b. Polyline opacity — `[pending]`
 *       Mutates the existing Polyline in place; no rebuild on pending toggle.
 *   2a. Endpoint markers — `[map, origin, destination]`
 *       Start/end pins; independent of candidate set so no flash on refresh.
 *   2b. Candidate cleanup — `[map]`
 *       Bulk-removes all candidate markers on map change or unmount.
 *       Must be declared before 2c so its cleanup runs before 2c repopulates.
 *   2c. Candidate diff — `[map, candidates, routeColor]`, NO return cleanup.
 *       Adds new markers, removes stale ones, updates icon color for survivors.
 *       Click handler uses `onCandidateClickRef` (always-current ref) so survivor
 *       markers never hold a stale closure. Also sets `candidateAnnouncement` for
 *       the aria-live region returned from this component.
 *       No teardown on candidates change = zero flicker on route refresh.
 *   3.  Trip-stop markers — `[map, tripStops, routeColor]`
 *       Numbered square markers for stops the user has added.
 *   4.  Highlight — `[highlightedCandidateId, routeColor]`
 *       Mutates only the two affected markers (prev + next highlight).
 *   5.  Search arc — `[map, searchArc, routeColor]`
 *       Draws a 180° polyline arc showing the radial search area ahead of
 *       the frontier stop. Tears down the previous arc on each change.
 *
 * `hasFitOnceRef` guards `fitBounds` so the camera only re-fits on the
 * VERY FIRST polyline render — subsequent recomputes redraw the line in
 * place without zoom/pan churn.
 */
function PolylineRenderer({
  encodedPolyline,
  bounds,
  origin,
  destination,
  candidates,
  routeColor,
  highlightedCandidateId,
  onCandidateClick,
  tripStops,
  pending,
  searchArc,
  roadsideStops,
}: {
  encodedPolyline: string;
  bounds?: RouteMapProps["bounds"];
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  candidates?: CandidateMarker[];
  routeColor: string;
  highlightedCandidateId?: string | null;
  onCandidateClick?: (cityId: string) => void;
  tripStops?: TripStopMarker[];
  pending?: boolean;
  searchArc?: SearchArc | null;
  roadsideStops?: RoadsideMapMarker[];
}) {
  const map = useMap();
  const candidateMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const previousHighlightRef = useRef<string | null>(null);
  const hasFitOnceRef = useRef(false);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const arcRef = useRef<google.maps.Polyline | null>(null);
  // Always-current ref so survivor markers never hold a stale onCandidateClick closure.
  const onCandidateClickRef = useRef(onCandidateClick);
  onCandidateClickRef.current = onCandidateClick;
  const [candidateAnnouncement, setCandidateAnnouncement] = useState("");

  // ── Effect 1a: polyline geometry / color ───────────────────────────────
  // Rebuilds when the route geometry or persona color changes.
  // `pending` is intentionally NOT in deps — opacity is updated in-place
  // by Effect 1b to avoid tearing down the Polyline on every transition.
  useEffect(() => {
    if (!map || !window.google?.maps?.geometry) return;

    const path = google.maps.geometry.encoding.decodePath(encodedPolyline);

    const line = new google.maps.Polyline({
      path,
      strokeColor: routeColor,
      strokeOpacity: pending ? 0.4 : 0.85,
      strokeWeight: 4,
      map,
    });
    polylineRef.current = line;

    // Fit-bounds-once: only the FIRST render triggers a camera fit.
    // Council ISC-S6-ARCH-2 — recomputes redraw in place.
    if (!hasFitOnceRef.current) {
      if (bounds) {
        map.fitBounds(
          new google.maps.LatLngBounds(
            { lat: bounds.southwest.lat, lng: bounds.southwest.lng },
            { lat: bounds.northeast.lat, lng: bounds.northeast.lng }
          ),
          { top: 60, right: 60, bottom: 120, left: 60 }
        );
      } else {
        const b = new google.maps.LatLngBounds();
        path.forEach((p) => b.extend(p));
        map.fitBounds(b, { top: 60, right: 60, bottom: 120, left: 60 });
      }
      hasFitOnceRef.current = true;
    }

    return () => {
      line.setMap(null);
      polylineRef.current = null;
    };
    // `pending` and `bounds` intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, encodedPolyline, routeColor]);

  // ── Effect 1b: polyline opacity (pending state) ────────────────────────
  // Mutates the existing Polyline in place — no rebuild.
  useEffect(() => {
    polylineRef.current?.setOptions({
      strokeOpacity: pending ? 0.4 : 0.85,
    });
  }, [pending]);

  // ── Effect 2a: endpoint markers ────────────────────────────────────────
  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const startMarker = new google.maps.Marker({
      position: origin,
      map,
      title: "Start",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#3fb950",
        fillOpacity: 1,
        strokeColor: "#0d1117",
        strokeWeight: 2,
      },
    });

    const endMarker = new google.maps.Marker({
      position: destination,
      map,
      title: "End",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#f85149",
        fillOpacity: 1,
        strokeColor: "#0d1117",
        strokeWeight: 2,
      },
    });

    return () => {
      startMarker.setMap(null);
      endMarker.setMap(null);
    };
  }, [map, origin, destination]);

  // ── Effect 2b: candidate marker cleanup ────────────────────────────────
  // Bulk-removes all candidate markers when the map object is replaced or the
  // component unmounts. Declared before 2c so this cleanup runs (and empties
  // candidateMarkersRef) before 2c's body re-populates it on a map change.
  useEffect(() => {
    return () => {
      for (const marker of candidateMarkersRef.current.values()) {
        marker.setMap(null);
      }
      candidateMarkersRef.current = new Map();
      previousHighlightRef.current = null;
    };
  }, [map]);

  // ── Effect 2c: candidate marker diff ───────────────────────────────────
  // Diffs the new candidate set against the live marker map:
  //   • removes markers for cities that dropped off the corridor
  //   • adds markers for newly eligible cities
  //   • updates icon color for survivors when the persona changes
  // No cleanup is returned — diff manages per-marker lifecycle.
  // Bulk teardown on map change / unmount lives in Effect 2b above.
  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const existing = candidateMarkersRef.current;
    const nextCandidates = candidates ?? [];
    const nextIds = new Set(nextCandidates.map((c) => c.id));

    for (const [id, marker] of existing) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        existing.delete(id);
        if (previousHighlightRef.current === id) {
          previousHighlightRef.current = null;
        }
      }
    }

    for (const candidate of nextCandidates) {
      const existingMarker = existing.get(candidate.id);
      if (existingMarker) {
        // Survivor — update icon color in case persona changed.
        existingMarker.setIcon(candidateMarkerIcon(routeColor));
        continue;
      }
      const marker = new google.maps.Marker({
        position: { lat: candidate.lat, lng: candidate.lng },
        map,
        label: {
          text: candidate.name,
          color: "#f0f6fc",
          fontSize: "11px",
          fontWeight: "500",
          className: "rt-candidate-label",
        },
        title: `${candidate.name} (+${Math.round(candidate.detourMinutes)} min detour)`,
        icon: candidateMarkerIcon(routeColor),
      });
      // Delegate through ref so the handler is never stale on prop change.
      marker.addListener("click", () => onCandidateClickRef.current?.(candidate.id));
      existing.set(candidate.id, marker);
    }

    const count = nextCandidates.length;
    setCandidateAnnouncement(
      count > 0 ? `${count} stops available along this route` : "No stops available along this route"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, candidates, routeColor]);

  // ── Effect 3: trip-stop numbered markers ───────────────────────────────
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    if (!tripStops || tripStops.length === 0) return;

    const stopMarkers = tripStops.map((stop, index) => {
      return new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        title: `Stop ${index + 1}: ${stop.cityName}`,
        zIndex: 2000,
        label: {
          text: String(index + 1),
          color: "#0d1117",
          fontSize: "12px",
          fontWeight: "700",
        },
        icon: {
          path:
            "M -10 -10 L 10 -10 L 10 10 L -10 10 z" /* square */,
          fillColor: routeColor,
          fillOpacity: 1,
          strokeColor: "#f0f6fc",
          strokeWeight: 2,
          scale: 1,
          anchor: new google.maps.Point(0, 0),
        },
      });
    });

    return () => {
      stopMarkers.forEach((m) => m.setMap(null));
    };
  }, [map, tripStops, routeColor]);

  // ── Effect 4: roadside survivors ───────────────────────────────────────
  // Diamonds in amber. zIndex 1500 sits between the trip-stop squares
  // (zIndex 2000 in Effect 3 above) and the candidate dots (no zIndex set in
  // Effect 2b, so the map's default, below both), so a numbered stop always
  // wins a tap and a roadside stop wins over a city dot. Rebuilt wholesale
  // when the list changes, which is only with the route: the array comes
  // from the server, and PlanWorkspace hands a single shared empty array
  // when there are none, so this does not churn on unrelated renders.
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    if (!roadsideStops || roadsideStops.length === 0) return;
    const icon: google.maps.Icon = {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(roadsideMarkerSvg())}`,
      anchor: new google.maps.Point(22, 22),
      scaledSize: new google.maps.Size(44, 44),
    };
    const markers = roadsideStops.map(
      (s) => new google.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, title: s.name, zIndex: 1500, icon, visible: false })
    );
    // The zoom rule: at a state-wide view only the strongest diamonds, at a
    // town every survivor. Applied now and on every zoom change; markers are
    // toggled, not rebuilt, so zooming costs nothing but a visibility flag.
    const apply = () => {
      const minP = roadsideMinProbabilityAt(map.getZoom() ?? 0);
      roadsideStops.forEach((s, i) => markers[i].setVisible(s.p >= minP));
    };
    apply();
    const listener = map.addListener("zoom_changed", apply);
    return () => {
      listener.remove();
      markers.forEach((m) => m.setMap(null));
    };
  }, [map, roadsideStops]);

  // Highlight effect: only touch the markers that actually changed
  // (previous highlight + new highlight). Avoids N-marker churn per hover.
  useEffect(() => {
    if (!window.google?.maps) return;
    const markersMap = candidateMarkersRef.current;
    if (markersMap.size === 0) return;

    const baseIcon = candidateMarkerIcon(routeColor);
    const activeIcon = candidateMarkerIcon(routeColor, true);

    const prev = previousHighlightRef.current;
    if (prev && prev !== highlightedCandidateId) {
      const prevMarker = markersMap.get(prev);
      if (prevMarker) {
        prevMarker.setIcon(baseIcon);
        prevMarker.setZIndex(1);
      }
    }
    if (highlightedCandidateId) {
      const nextMarker = markersMap.get(highlightedCandidateId);
      if (nextMarker) {
        nextMarker.setIcon(activeIcon);
        nextMarker.setZIndex(1000);
      }
    }
    previousHighlightRef.current = highlightedCandidateId ?? null;
  }, [highlightedCandidateId, routeColor]);

  // ── Effect 5: search arc ───────────────────────────────────────────────
  // Draws a 180° polyline arc to visualise the radial search area ahead of
  // the frontier stop. Tears down the old arc before building a new one.
  useEffect(() => {
    if (!map || !window.google?.maps?.geometry) return;

    if (arcRef.current) {
      arcRef.current.setMap(null);
      arcRef.current = null;
    }

    if (!searchArc) return;

    const pts = buildSemicirclePoints(
      searchArc.center,
      searchArc.radiusMeters,
      searchArc.headingDeg
    );
    const arc = new google.maps.Polyline({
      path: pts,
      strokeColor: routeColor,
      strokeOpacity: 0.8, // meets WCAG 1.4.11 non-text contrast at 3:1
      strokeWeight: 1.5,  // thin enough to read as a guide, not a hard boundary
      map,
    });
    arcRef.current = arc;

    return () => {
      arc.setMap(null);
      arcRef.current = null;
    };
  }, [map, searchArc, routeColor]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {candidateAnnouncement}
    </div>
  );
}

function DirectionsFallback({
  origin,
  destination,
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
}) {
  const map = useMap();
  const [renderer, setRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

  const renderRoute = useCallback(async () => {
    if (!map) return;

    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: "#58a6ff",
        strokeWeight: 4,
        strokeOpacity: 0.8,
      },
    });

    try {
      const result = await directionsService.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      });
      directionsRenderer.setDirections(result);
      setRenderer(directionsRenderer);
    } catch (err) {
      console.error("Directions request failed:", err);
    }
  }, [map, origin, destination]);

  useEffect(() => {
    renderRoute();
    return () => {
      if (renderer) renderer.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderRoute]);

  return null;
}

export default function RouteMap({
  origin = NYC,
  destination = DC,
  encodedPolyline,
  bounds,
  candidates,
  routeColor = "#58a6ff",
  highlightedCandidateId = null,
  onCandidateClick,
  tripStops,
  pending = false,
  searchArc,
  roadsideStops,
}: RouteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#161b22] border border-[#30363d]">
        <p className="text-sm text-[#7d8590] font-mono uppercase tracking-widest">
          Configure NEXT_PUBLIC_GOOGLE_MAPS_KEY
        </p>
      </div>
    );
  }

  const center = {
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2,
  };

  return (
    <APIProvider apiKey={apiKey} libraries={["geometry"]}>
      <GMap
        defaultCenter={center}
        // Zoom 7 frames a single day's drive (roughly a 300 mile radius) around
        // the midpoint. PolylineRenderer calls fitBounds once a route exists, so
        // this only governs the first paint and the no-route fallback.
        defaultZoom={7}
        // "greedy" pans on a one-finger drag and zooms on a plain wheel, without
        // requiring ctrl or two fingers. The map fills the pane and is the main
        // interaction surface here, so it should not fight the user for scroll.
        gestureHandling="greedy"
        zoomControl={true}
        // MUST be the library's ControlPosition, never google.maps.ControlPosition.
        // These props are evaluated during render, and "use client" does not stop
        // this component being server-rendered for the first HTML, where no
        // `google` global exists. Reaching for the global here is what took the
        // plan page down on 2026-09-22 with `ReferenceError: google is not
        // defined` on every direct load. The library documents its export as a
        // copy of the google.maps constants, so the value is identical.
        // Guarded by src/components/__tests__/RouteMap.ssr.test.tsx.
        zoomControlOptions={{ position: ControlPosition.RIGHT_CENTER }}
        fullscreenControl={false}
        mapTypeControl={false}
        streetViewControl={false}
        styles={DARK_MAP_STYLES}
        className="h-full w-full"
      >
        {encodedPolyline ? (
          <PolylineRenderer
            encodedPolyline={encodedPolyline}
            bounds={bounds}
            origin={origin}
            destination={destination}
            candidates={candidates}
            routeColor={routeColor}
            highlightedCandidateId={highlightedCandidateId}
            onCandidateClick={onCandidateClick}
            tripStops={tripStops}
            roadsideStops={roadsideStops}
            pending={pending}
            searchArc={searchArc}
          />
        ) : (
          <DirectionsFallback origin={origin} destination={destination} />
        )}
      </GMap>
    </APIProvider>
  );
}
