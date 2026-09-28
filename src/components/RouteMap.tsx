"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  APIProvider,
  ControlPosition,
  Map as GMap,
  useMap,
} from "@vis.gl/react-google-maps";
import { roadsideSpread, diamondBox } from "@/lib/roadside/spread";

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
// Hand-tuned on two routes (Amarillo to Austin, 214 survivors; Denver to
// Santa Fe, 278) so that a phone at state zoom shows a few dozen diamonds
// and not a pile on every city. Not measured against what a person can
// read; the first real trip is the measurement. Moving a step or a value
// means moving "shows only the strongest stops at a state-wide zoom…" in
// src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx with it.
export const ROADSIDE_ZOOM_STEPS: ReadonlyArray<readonly [zoomBelow: number, minP: number]> = [
  [8, 0.7],
  [10, 0.55],
];
/**
 * `line` is the store's own line, MAP_THRESHOLD in src/lib/roadside/survivors.ts
 * (0.45): the server keeps only stops at or above it, so a value below it here
 * changes nothing (there is nothing below it to show) and a value above it
 * hides survivors the sidebar still lists. It is a parameter only so the test
 * can prove the floor; the map never passes one.
 */
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
 * The visible diamond's width in the 44 px canvas: 32, so a screenshot
 * shows most of the target (it was 18, "well under the 44 px target" to the
 * round-5 critic, rule 7); the tapped one is 38. The spread keeps diamonds
 * 44 apart, so 32 leaves 12 px of map between neighbours.
 */
export const DIAMOND_PX = 32;

/**
 * A roadside marker: a diamond, so it cannot be mistaken for a round city
 * candidate or a numbered square trip stop even in greyscale. Same 44 px
 * canvas as the candidate icon for the touch target. The tapped one
 * (`active`) is larger with a light stroke, the same way an active city
 * dot is. Pure: an SVG string; the google.maps objects are made by the
 * caller.
 */
export function roadsideMarkerSvg(color = ROADSIDE_COLOR, active = false): string {
  const path = active ? "M22 3 L41 22 L22 41 L3 22 Z" : "M22 6 L38 22 L22 38 L6 22 Z";
  const stroke = active ? "#f0f6fc" : "#0d1117";
  const sw = active ? 3 : 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><path d="${path}" fill="${color}" fill-opacity="0.95" stroke="${stroke}" stroke-width="${sw}"/></svg>`;
}

/** Below this width the sheet is a bottom sheet over the map (the `md` breakpoint; `.plan-sheet` in globals.css). */
export const PHONE_MAX_WIDTH_PX = 767;

/**
 * The size Google draws its own map buttons at (the + and - of the zoom
 * control): 44 px, the touch target the quality bar asks for (rule 7);
 * Google's default is 40. A constructor-time option, so it is a constant
 * given with the map and never changed after.
 */
export const MAP_CONTROL_SIZE_PX = 44;

/** What `fitBounds` takes: pixels of the map the corridor stays out of, on each side. */
export interface FitPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The room the first fit leaves around the corridor on a desktop, where the
 * sheet is a side panel and the whole map is on screen. Unchanged since the
 * fit was written.
 */
export const FIT_MARGIN_PX: FitPadding = { top: 60, right: 60, bottom: 120, left: 60 };
/**
 * On a phone, the room inside the strip of map above the sheet: 40 above and
 * beside for the start's name (drawn 30 px above its dot, 11 px tall) and a
 * ring of stacked diamonds (25 px out, the diamond 9 more); 32 below for a
 * ring's lower members. The bottom of the padding proper is the sheet's
 * share of the map, added in fitPaddingPx.
 */
export const STRIP_MARGIN_PX: FitPadding = { top: 40, right: 40, bottom: 32, left: 40 };
/** A strip shorter than this (a phone on its side) cannot frame a road; the fit takes the desktop's margins and the person pulls the sheet down. */
export const STRIP_MIN_PX = 140;

/**
 * The strip: how much of the map is on screen from its top edge, on a
 * phone with the sheet at rest (the sheet's top in dvh times the viewport,
 * less the map's top). Undefined off a phone or with no sheet, where the
 * whole map is on screen. The fit frames the road in it (fitPaddingPx) and
 * a moved diamond stays in it (Effect 4's box).
 */
export function stripHeightPx(args: {
  /** The map's top edge in the viewport (under the page's header). */
  mapTopPx: number;
  viewportHeightPx: number;
  /** Where the sheet's top edge sits at rest, in dvh; undefined off a phone. */
  sheetTopDvh: number | undefined;
  phone: boolean;
}): number | undefined {
  const { mapTopPx, viewportHeightPx, sheetTopDvh, phone } = args;
  if (!phone || sheetTopDvh === undefined) return undefined;
  return (viewportHeightPx * sheetTopDvh) / 100 - mapTopPx;
}

/**
 * The padding for the map's one fit (Gauntlet U1, round 5). On a phone the
 * sheet at rest covers the map from `sheetTopDvh` down; a fit padded for
 * the whole map centred the corridor under the sheet, and the strip above
 * it showed the state north of the start and not one diamond (the round-4
 * capture: Amarillo's dot 18 px under the sheet's edge, Kansas above).
 * Round 4 panned the start into the strip from a one-shot `idle` listener
 * after the fit, which a strict-mode remount on the dev server removed
 * before it fired. So the padding itself carries the sheet's share of the
 * map: the fit then frames the whole road, both pins and the state-wide
 * diamonds in the strip, and a fit applied once stays applied. Pure:
 * pixels in, pixels out, so a test proves the frame without a map.
 */
export function fitPaddingPx(args: Parameters<typeof stripHeightPx>[0] & { mapHeightPx: number }): FitPadding {
  const stripPx = stripHeightPx(args);
  if (stripPx === undefined || stripPx < STRIP_MIN_PX) return { ...FIT_MARGIN_PX };
  return { ...STRIP_MARGIN_PX, bottom: Math.round(args.mapHeightPx - stripPx) + STRIP_MARGIN_PX.bottom };
}

/** Whether the screen is a phone, where the sheet is a bottom sheet over the map. */
function isPhone(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`).matches;
}

/** The strip on screen above the sheet at rest, read from the map's box and the viewport now. */
function stripOnScreenPx(map: google.maps.Map, sheetTopDvh: number | undefined): number | undefined {
  return stripHeightPx({ mapTopPx: map.getDiv().getBoundingClientRect().top, viewportHeightPx: window.innerHeight, sheetTopDvh, phone: isPhone() });
}

/**
 * Must be called inside effects where google.maps is guaranteed loaded.
 * `dx` and `dy` are the diamond's slot when its own point is too close to
 * another diamond's (roadsideSpread): the anchor is the pixel of the image
 * that sits on the marker's position, so moving it left and up draws the
 * diamond right and down, with no second marker and no false position.
 */
function roadsideMarkerIcon(active = false, dx = 0, dy = 0): google.maps.Icon {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(roadsideMarkerSvg(ROADSIDE_COLOR, active))}`,
    anchor: new google.maps.Point(22 - dx, 22 - dy),
    scaledSize: new google.maps.Size(44, 44),
  };
}

interface RouteMapProps {
  origin?: google.maps.LatLngLiteral;
  destination?: google.maps.LatLngLiteral;
  /** The start's and the end's names, drawn by the app above their dots: the basemap's town names are off. */
  originName?: string;
  destinationName?: string;
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
  /** Roadside survivors along the route — amber diamonds, distinct from cities and trip stops */
  roadsideStops?: RoadsideMapMarker[];
  /** Fired when the user taps a roadside diamond; the sheet answers with a card. */
  onRoadsideClick?: (id: string) => void;
  /** The roadside stop whose card is open; its diamond is drawn larger and kept visible at every zoom. */
  selectedRoadsideId?: string | null;
  /**
   * On a phone, where the sheet's top edge sits at rest, in dvh from the
   * top of the screen. Given, the first fit is padded by the sheet's share
   * of the map, so the road is framed in the strip above the sheet
   * (fitPaddingPx). Not given, or wider than a phone: the desktop's margins.
   */
  phoneSheetTopDvh?: number;
}

const NYC: google.maps.LatLngLiteral = { lat: 40.7128, lng: -74.006 };
const DC: google.maps.LatLngLiteral = { lat: 38.9072, lng: -77.0369 };

export const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
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
  // The app labels the towns of the trip itself (the towns that fit, the
  // start and the end), so the basemap's town names are off: drawn both,
  // "Lubbock" read "Lubbockbock" and "Amarillo" hid behind the diamonds
  // (Gauntlet U1, round 3, rule 7). Roads, states and water keep theirs.
  { featureType: "administrative.locality", elementType: "labels", stylers: [{ visibility: "off" }] },
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

/**
 * The start (green) and end (red) dots, the same 7 px circle as before on
 * a canvas tall enough to carry the town's name 30 px above the dot: the
 * dot at (32, 40), the label at (32, 10). Thirty is above the diamonds
 * moved beside the town (roadsideSpread takes the sideways slots first,
 * and the upper diagonals at 44 px out sit 38 above, where the name's
 * ends are drawn over them at zIndex 1800). Must be called inside effects
 * where google.maps is guaranteed loaded.
 */
function endpointIcon(fill: string): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="40" r="7" fill="${fill}" stroke="#0d1117" stroke-width="2"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(32, 40),
    scaledSize: new google.maps.Size(64, 64),
    labelOrigin: new google.maps.Point(32, 10),
  };
}

/** The same face as the candidate towns' labels, so the map has one label style (restyled together in U3). */
function endpointLabel(name: string | undefined): google.maps.MarkerLabel | undefined {
  if (!name) return undefined;
  return { text: name, color: "#f0f6fc", fontSize: "11px", fontWeight: "500", className: "rt-candidate-label" };
}

/**
 * Renders a precomputed encoded polyline directly on the map.
 * Avoids a second Directions API call when the polyline was already
 * computed server-side.
 *
 * Effect split (do not collapse — each boundary was added to fix a specific bug):
 *   1a. Polyline geometry — `[map, encodedPolyline, routeColor]`
 *       Tears down and rebuilds JUST the line when the route changes. On
 *       the first render it fits the camera, padded on a phone by the
 *       sheet's share of the map so the road is framed in the strip above
 *       the sheet (fitPaddingPx).
 *   1b. Polyline opacity — `[pending]`
 *       Mutates the existing Polyline in place; no rebuild on pending toggle.
 *   2a. Endpoint markers — `[map, origin, destination, originName, destinationName]`
 *       Start/end dots with the app's own town labels above them, drawn above
 *       the diamonds and not clickable; independent of candidate set so no
 *       flash on refresh.
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
 *   4.  Roadside diamonds — `[map, roadsideStops]`
 *       Built wholesale; one pass applies the zoom rule and then the spread
 *       (a diamond too close to another takes a free slot beside it, inside
 *       the strip above the sheet, by re-anchoring the icon) on mount and
 *       whenever the camera settles (`idle`), touching only the markers
 *       whose place changed; a tap goes through `onRoadsideClickRef` so it
 *       is never stale.
 *   4b. Tapped diamond — `[selectedRoadsideId]`
 *       Runs Effect 4's pass again: the selection is read from a ref, so the
 *       previous one goes back to its own icon and rule and the new one is
 *       drawn larger, kept visible and placed first, on its own point.
 *   5.  Highlight — `[highlightedCandidateId, routeColor]`
 *       Mutates only the two affected markers (prev + next highlight).
 *
 * The search arc that used to be drawn ahead of the frontier stop is gone
 * (Gauntlet U1, 2026-09-29): the map shows the trip, not the machinery.
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
  originName,
  destinationName,
  candidates,
  routeColor,
  highlightedCandidateId,
  onCandidateClick,
  tripStops,
  pending,
  roadsideStops,
  onRoadsideClick,
  selectedRoadsideId,
  phoneSheetTopDvh,
}: {
  encodedPolyline: string;
  bounds?: RouteMapProps["bounds"];
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  originName?: string;
  destinationName?: string;
  candidates?: CandidateMarker[];
  routeColor: string;
  highlightedCandidateId?: string | null;
  onCandidateClick?: (cityId: string) => void;
  tripStops?: TripStopMarker[];
  pending?: boolean;
  roadsideStops?: RoadsideMapMarker[];
  onRoadsideClick?: (id: string) => void;
  selectedRoadsideId?: string | null;
  phoneSheetTopDvh?: number;
}) {
  const map = useMap();
  const candidateMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const previousHighlightRef = useRef<string | null>(null);
  const hasFitOnceRef = useRef(false);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  // Always-current ref so survivor markers never hold a stale onCandidateClick closure.
  const onCandidateClickRef = useRef(onCandidateClick);
  onCandidateClickRef.current = onCandidateClick;
  // The same for the diamonds: the markers are built once per route, the
  // handler and the selection change with the sheet.
  const onRoadsideClickRef = useRef(onRoadsideClick);
  onRoadsideClickRef.current = onRoadsideClick;
  const selectedRoadsideRef = useRef<string | null>(selectedRoadsideId ?? null);
  selectedRoadsideRef.current = selectedRoadsideId ?? null;
  // The sheet's edge, for Effect 4's box; a ref so the pass reads the
  // current value without the effect depending on it.
  const phoneSheetTopDvhRef = useRef(phoneSheetTopDvh);
  phoneSheetTopDvhRef.current = phoneSheetTopDvh;
  // Effect 4's pass (the zoom rule, then the spread), kept so Effect 4b can
  // run it again after a selection change without rebuilding the markers.
  const applyRoadsideRef = useRef<(() => void) | null>(null);
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
    // Council ISC-S6-ARCH-2 — recomputes redraw in place. On a phone the
    // padding carries the sheet's share of the map (fitPaddingPx), so the
    // road is framed in the strip above the sheet at rest; a later drag
    // or zoom is the person's. The map's box is read here, synchronously,
    // and the fit is applied in the same run: nothing waits for an event
    // a strict-mode remount could take away (Gauntlet U1, round 5).
    if (!hasFitOnceRef.current) {
      let b: google.maps.LatLngBounds;
      if (bounds) {
        b = new google.maps.LatLngBounds(
          { lat: bounds.southwest.lat, lng: bounds.southwest.lng },
          { lat: bounds.northeast.lat, lng: bounds.northeast.lng }
        );
      } else {
        b = new google.maps.LatLngBounds();
        path.forEach((p) => b.extend(p));
      }
      const box = map.getDiv().getBoundingClientRect();
      map.fitBounds(b, fitPaddingPx({ mapTopPx: box.top, mapHeightPx: box.height, viewportHeightPx: window.innerHeight, sheetTopDvh: phoneSheetTopDvh, phone: isPhone() }));
      hasFitOnceRef.current = true;
    }

    return () => {
      line.setMap(null);
      polylineRef.current = null;
    };
    // `pending` and `bounds` intentionally omitted from deps; so is
    // `phoneSheetTopDvh`, read only on the first fit, which runs once.
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
  // The start and the end carry the app's own town names (the basemap's are
  // off, DARK_MAP_STYLES), 30 px above the dot where a ring of stacked
  // diamonds leaves its gap. zIndex 1800 puts the dot and its name above
  // the diamonds (1500 and 1600) and under the numbered trip stops (2000),
  // so a name is never behind a diamond; not clickable, so a name never
  // takes a diamond's tap.
  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const startMarker = new google.maps.Marker({
      position: origin,
      map,
      title: originName ? `Start: ${originName}` : "Start",
      zIndex: 1800,
      clickable: false,
      icon: endpointIcon("#3fb950"),
      label: endpointLabel(originName),
    });

    const endMarker = new google.maps.Marker({
      position: destination,
      map,
      title: destinationName ? `End: ${destinationName}` : "End",
      zIndex: 1800,
      clickable: false,
      icon: endpointIcon("#f85149"),
      label: endpointLabel(destinationName),
    });

    return () => {
      startMarker.setMap(null);
      endMarker.setMap(null);
    };
  }, [map, origin, destination, originName, destinationName]);

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
    const markers = roadsideStops.map((s) => {
      const marker = new google.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, title: s.name, zIndex: 1500, icon: roadsideMarkerIcon(), visible: false });
      // Delegate through the ref so the handler is never stale on prop change.
      marker.addListener("click", () => onRoadsideClickRef.current?.(s.id));
      return marker;
    });
    // What each marker was last given (active, dx, dy), so a pass touches
    // only the markers whose place changed: a zoom step over a corridor of
    // two hundred diamonds moves a handful.
    const given = new Map<string, string>();
    // The zoom rule, then the spread. At a state-wide view only the
    // strongest diamonds, at a town every survivor; and among those shown,
    // any whose point is within a touch canvas of another diamond's takes
    // a free slot beside it (roadsideSpread, checked against every diamond
    // on the map) by re-anchoring the icon, so every diamond on the map
    // answers a tap with its own card. A moved diamond stays inside the
    // box: the map's bounds at this zoom, cut at the sheet's top edge at
    // rest on a phone, so none is drawn under the sheet or off an edge
    // (round-5 critic, rule 4). The tapped one is placed first, on its own
    // point, so a row tap at a state-wide zoom still puts its diamond on
    // the map. Applied now and whenever the camera settles (`idle`, after
    // the first fit, a pan or a zoom); markers are toggled and
    // re-anchored, never rebuilt. Before the map has drawn once
    // `getBounds` is undefined and the pass has no box; the `idle` that
    // follows the fit runs it again with one.
    const apply = () => {
      const zoom = map.getZoom() ?? 0;
      const minP = roadsideMinProbabilityAt(zoom);
      const selected = selectedRoadsideRef.current;
      const b = map.getBounds();
      const box = b
        ? diamondBox(
            { north: b.getNorthEast().lat(), east: b.getNorthEast().lng(), south: b.getSouthWest().lat(), west: b.getSouthWest().lng() },
            zoom,
            DIAMOND_PX / 2,
            stripOnScreenPx(map, phoneSheetTopDvhRef.current)
          )
        : undefined;
      const placed = roadsideSpread(roadsideStops.filter((s) => s.p >= minP || s.id === selected), zoom, selected, box);
      roadsideStops.forEach((s, i) => {
        const marker = markers[i];
        const at = placed.get(s.id);
        if (at?.shown) {
          const active = s.id === selected;
          const key = `${active ? "a" : "-"}${at.dx},${at.dy}`;
          if (given.get(s.id) !== key) {
            marker.setIcon(roadsideMarkerIcon(active, at.dx, at.dy));
            // The tapped one above the other diamonds, below the numbered trip stops (2000).
            marker.setZIndex(active ? 1600 : 1500);
            given.set(s.id, key);
          }
        }
        const shown = at?.shown === true;
        if (marker.getVisible() !== shown) marker.setVisible(shown);
      });
    };
    apply();
    applyRoadsideRef.current = apply;
    const listener = map.addListener("idle", apply);
    return () => {
      listener.remove();
      markers.forEach((m) => m.setMap(null));
      applyRoadsideRef.current = null;
    };
  }, [map, roadsideStops]);

  // ── Effect 4b: the tapped diamond ──────────────────────────────────────
  // The selection lives in a ref that Effect 4's pass reads, so a change of
  // selection is one more pass: the previous one goes back to its own icon
  // and rule, the new one is drawn larger, kept visible and given its
  // stack's first slot. Declared after Effect 4 so the pass exists on the
  // first render.
  useEffect(() => {
    applyRoadsideRef.current?.();
  }, [selectedRoadsideId]);

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
  originName,
  destinationName,
  encodedPolyline,
  bounds,
  candidates,
  routeColor = "#58a6ff",
  highlightedCandidateId = null,
  onCandidateClick,
  tripStops,
  pending = false,
  roadsideStops,
  onRoadsideClick,
  selectedRoadsideId = null,
  phoneSheetTopDvh,
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
        // Every default control off, then the zoom control alone back on.
        // `disableDefaultUI` is one of the options the library forwards on
        // every update; `cameraControl` (Google's round compass button, on
        // by default since API 3.58) is not, so a `cameraControl={false}`
        // prop reaches the constructor and nothing after it. With the
        // default UI off there is nothing at the bottom of the map to sit
        // under the sheet (Gauntlet U1, rule 6).
        disableDefaultUI
        zoomControl={true}
        // Google's + and - at the bar's 44 px target (rule 7), not its 40.
        controlSize={MAP_CONTROL_SIZE_PX}
        // MUST be the library's ControlPosition, never google.maps.ControlPosition.
        // These props are evaluated during render, and "use client" does not stop
        // this component being server-rendered for the first HTML, where no
        // `google` global exists. Reaching for the global here is what took the
        // plan page down on 2026-09-22 with `ReferenceError: google is not
        // defined` on every direct load. The library documents its export as a
        // copy of the google.maps constants, so the value is identical.
        // Guarded by src/components/__tests__/RouteMap.ssr.test.tsx.
        //
        // Top right, not the vertical centre: on a phone the sheet covers
        // the lower half of the map at its middle snap, and a control at
        // the centre sat half under it. The top of the map is the map's own
        // area at every snap but the full one, where the sheet covers
        // nearly everything anyway.
        zoomControlOptions={{ position: ControlPosition.RIGHT_TOP }}
        styles={DARK_MAP_STYLES}
        className="h-full w-full"
      >
        {encodedPolyline ? (
          <PolylineRenderer
            encodedPolyline={encodedPolyline}
            bounds={bounds}
            origin={origin}
            destination={destination}
            originName={originName}
            destinationName={destinationName}
            candidates={candidates}
            routeColor={routeColor}
            highlightedCandidateId={highlightedCandidateId}
            onCandidateClick={onCandidateClick}
            tripStops={tripStops}
            roadsideStops={roadsideStops}
            onRoadsideClick={onRoadsideClick}
            selectedRoadsideId={selectedRoadsideId}
            phoneSheetTopDvh={phoneSheetTopDvh}
            pending={pending}
          />
        ) : (
          <DirectionsFallback origin={origin} destination={destination} />
        )}
      </GMap>
    </APIProvider>
  );
}
