"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { placeLabels, TOWN_LABEL_DY, type LabelPlacement } from "@/lib/map/labels";
import type { NightMark } from "@/lib/plan/days";
import { isOvernightStop } from "@/lib/plan/visits";
import {
  APIProvider,
  ControlPosition,
  Map as GMap,
  useMap,
  useMapsLibrary,
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
 * round-5 critic, rule 7); the tapped one is 38. Every diamond is drawn on
 * its place's own point, so at a state-wide zoom two places a few km apart
 * overlap; that is what the zoom rule and a pinch are for.
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
// Must match the `@media (max-width: 767px)` rules in src/app/globals.css
// (three of them: the sheet, its reduced-motion variant, the map strip). The
// CSS decides the layout and this decides the gestures and the fit; if the
// two disagree, a tablet gets a bottom sheet with desktop margins or the
// reverse. Change both, and check with a screenshot at 767 and 768 px.
export const PHONE_MAX_WIDTH_PX = 767;

/**
 * The size Google draws its own map buttons at (the + and - of the zoom
 * control): 44 px, the touch target the quality bar asks for (rule 7);
 * Google's default is 40. A constructor-time option, so it is a constant
 * given with the map and never changed after.
 */
export const MAP_CONTROL_SIZE_PX = 44;

/** The gap Google leaves between a control and the map's edge, in px. */
export const MAP_CONTROL_MARGIN_PX = 10;
/** Half a long town's name, in px (11 chars at the label face's 6.6 px), since a name is centred on its point. */
export const HALF_NAME_PX = 40;
/**
 * The fit's right padding (Gauntlet U22): the zoom control sits at the
 * top right (44 px buttons and Google's 10 px margin), and a start's or
 * end's name centred above its dot reaches half a name beyond it. Four
 * critics saw "Kansas City" cut to "Ka" under the buttons when the right
 * padding was 40, and since U20 the hidden name also withheld the names of
 * the towns beside it. Moves with: the control's size and margin above.
 */
export const CONTROL_CLEARANCE_PX = MAP_CONTROL_MARGIN_PX + MAP_CONTROL_SIZE_PX + HALF_NAME_PX;

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
export const FIT_MARGIN_PX: FitPadding = { top: 60, right: CONTROL_CLEARANCE_PX, bottom: 120, left: 60 };
/**
 * On a phone, the room inside the strip of map above the sheet: 40 above
 * for the start's name (drawn 30 px above its dot, 11 px tall) and beside
 * for a name's width and a diamond's canvas (22 px each side of its point),
 * and on the right the zoom control as well (CONTROL_CLEARANCE_PX, U22);
 * 32 below for the end's diamond and its dot. The bottom of the padding
 * proper is the sheet's share of the map, added in fitPaddingPx.
 */
export const STRIP_MARGIN_PX: FitPadding = { top: 40, right: CONTROL_CLEARANCE_PX, bottom: 32, left: 40 };
/**
 * The least height, in px, of the strip of map above the sheet at rest
 * for the fit to frame the road in it. 140 leaves 68 px of road between
 * STRIP_MARGIN_PX's top and bottom (40 and 32): enough for a corridor to
 * read as a line with both pins in the strip. A 390 by 844 phone has a
 * 217 px strip (844 * 0.31 less the 45 px header), well above; the same
 * phone on its side has 76 (390 * 0.31 less 45), below, so there the fit
 * takes the desktop's margins and the person pulls the sheet down. Moves
 * with it: the branch in `fitPaddingPx` alone; nothing in CSS. Check: the
 * test "fits the road into the strip of map above the sheet at rest, on
 * a phone" pins 140 and the 390-tall fallback, and a screenshot at 390 by
 * 844 with the sheet at rest shows both pins and the road above the sheet.
 */
export const STRIP_MIN_PX = 140;
/**
 * The plan page's masthead on a phone, in px, which is where the map's top
 * edge sits: the 44 px "Roadtripper" link, no vertical padding, and the
 * 1 px border; 49 when the right-hand column has two lines ("Amarillo to
 * Austin" and a range's dates, or a long pair of names wrapping). Why it
 * is pinned (Gauntlet U3): U1 round 5 framed the road for a 45 px masthead
 * (a 217 px strip above the sheet at rest on a 390 by 844 phone, 145 px
 * inside the strip's margins, and the Amarillo to Austin road is 134 px
 * tall at zoom 5). U2 rebuilt the masthead with `py-3` around the 44 px
 * link: 69 px, 73 with the deadline line, so the strip fell to 189 and the
 * inner area to 117; fitBounds takes whole zooms on a raster map, so the
 * fit dropped to zoom 4 and the strip showed a third of the country. Moves
 * with it: the header's classes in src/app/plan/page.tsx (the page SSR
 * test pins them to this number) and the fit test "fits the road into the
 * strip of map above the sheet at rest, on a phone", which takes the strip
 * from it. Check: a screenshot at 390 by 844 with the sheet at rest shows
 * the road from end to end above the sheet, and Texas, not the country.
 *
 * What it is not: a value the app reads. The fit measures the map's real
 * box (`map.getDiv().getBoundingClientRect()` in effects 1a and 1c
 * below), so changing this number alone changes nothing on screen. It is
 * the masthead's height as the fit arithmetic was done for it, and the
 * two tests are what tie the masthead to it; without them the page can
 * grow a taller masthead while a fit test keeps proving a strip the
 * screen no longer has, which is exactly what happened before U3.
 *
 * To change it, change three things together and run both tests:
 *   1. The header's classes in src/app/plan/page.tsx, which are what make
 *      the masthead 45 px, or 49 with a second line on the right.
 *   2. This number, and the test "keeps the masthead at the height the
 *      fit at rest counts on: a 44 px link, no vertical padding, one
 *      border" in src/app/plan/__tests__/page.ssr.test.tsx, which asserts
 *      44 + 1 + 4 and forbids vertical padding or a fixed height on the
 *      header; it fails on a change to either side alone.
 *   3. The test "fits the road into the strip of map above the sheet at
 *      rest, on a phone" in
 *      src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx, which
 *      takes the map's top from this value and the sheet's top from the
 *      rest snap (`sheetTopDvh(1)`, from SHEET_SNAPS[1] in
 *      src/components/PlanWorkspace.tsx: 31 dvh, so a 212.6 px strip on
 *      a 390 by 844 phone) and proves the Amarillo to Austin road fits
 *      that strip at a zoom above 5, and that a 73 px masthead drops it
 *      to 4. A taller masthead needs a lower rest snap to keep the strip,
 *      and a strip under STRIP_MIN_PX (140) makes fitPaddingPx give up on
 *      the strip and pad for the whole map, so the road goes under the
 *      sheet: the strip is this number and the rest snap together, and
 *      every fit (the mount's and a day's frame) goes through the same
 *      padding, so a wrong strip moves them all.
 * Then the screenshot above. Nothing in CSS reads it.
 */
export const PLAN_HEADER_PX = 49;

/** A camera request from the sheet: a day's stretch, or the whole trip again. A new key is a new fit. */
export interface MapFit {
  key: string;
  bounds: { northeast: google.maps.LatLngLiteral; southwest: google.maps.LatLngLiteral };
}

/**
 * How faded a town outside the open day's dot is drawn (Gauntlet U3,
 * round 3). 0.35 keeps the dot readable as a place that is there while
 * the day's own towns, at 1, are what the eye reads; hidden, a town would
 * look absent. Its name is not drawn at all while a day is framed (round
 * 4: faded, Fort Worth's name still sat at the map's right edge cut to
 * "For", and a name cut short fails rule 2 whatever its strength); the
 * whole trip restores every name. Nothing moves (rule 6). Check:
 * `candidateOpacity` and `candidateLabelShown` below and their test; a
 * screenshot with Day 1 open shows Fort Worth's dot faint with no name,
 * Plainview's dot and name as they were.
 *
 * Its bounds, and what it does to reading the map. The faded mark is the
 * town's dot alone (`candidateMarkerIcon`: the route colour at
 * fill-opacity 0.9 inside a 2 px #0d1117 stroke, 12 px across) over the
 * basemap's #1c2128 land and #3d444d roads (DARK_MAP_STYLES), so the
 * marker's opacity multiplies an already dim mark. At 0.35 the dot is a
 * tint a person finds when looking for it and passes over when not.
 * Below about 0.25 it is the land's colour on a phone in daylight and
 * the town reads as gone, which this rule exists to avoid; above 0.5 it
 * reads as one of the day's own and the frame stops saying which towns
 * are the day's. The names' contrast is not a function of this value: a
 * faded town has no name drawn at all (`candidateLabelShown`), so there
 * is no half-strength 11 px text to fail contrast, and the #f0f6fc label
 * is either whole or absent. Only the towns' dots read it: the one
 * `marker.setOpacity` is in effect 2c, and the stop squares (effect 3)
 * and the roadside diamonds (effect 4) are never faded.
 *
 * To change it: the test "fades the dots of the other days' towns on the
 * map while one is open and draws no name for them, never the day's own
 * or its ends, and names a stop's square" in
 * src/components/__tests__/PlanWorkspace.days.ssr.test.tsx pins the
 * value to 0.25 to 0.5 and pins the `marker.setOpacity` and
 * `marker.setLabel` lines of effect 2c to the two rules above, so a
 * value outside that range, or a second place that sets a marker's
 * opacity, fails it. Then the screenshot above, in daylight on a phone,
 * not on a desk: the faint dot must still be found.
 */
export const OFF_DAY_OPACITY = 0.35;

/**
 * A town's strength on the map: full with no day open (`focus` null), or
 * when the town is in the open day; faded otherwise. Pure, so a test can
 * prove the rule without a map.
 */
export function candidateOpacity(id: string, focus: ReadonlySet<string> | null | undefined): number {
  return !focus || focus.has(id) ? 1 : OFF_DAY_OPACITY;
}

/** Whether a town's name is drawn: only at full strength, so no off-day name can sit cut at the map's edge. */
export function candidateLabelShown(id: string, focus: ReadonlySet<string> | null | undefined): boolean {
  return candidateOpacity(id, focus) === 1;
}

/** The town's name above its dot, the app's one label style (the basemap's town names are off). */
function candidateLabel(name: string): google.maps.MarkerLabel {
  return { text: name, color: "#f0f6fc", fontSize: "11px", fontWeight: "500", className: "rt-candidate-label" };
}

/**
 * The strip: how much of the map is on screen from its top edge, on a
 * phone with the sheet at rest (the sheet's top in dvh times the viewport,
 * less the map's top). Undefined off a phone or with no sheet, where the
 * whole map is on screen. The fit frames the road in it (fitPaddingPx).
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
  // A map whose box has no height yet (a collapsed container during a
  // layout pass) would give a negative bottom padding, which fitBounds
  // treats as a crash-worthy request; fall back to the plain margins and
  // let the next resize event fit properly.
  const bottom = Math.round(args.mapHeightPx - stripPx) + STRIP_MARGIN_PX.bottom;
  if (!(args.mapHeightPx > 0) || bottom < 0) return { ...FIT_MARGIN_PX };
  return { ...STRIP_MARGIN_PX, bottom };
}

/** Whether the screen is a phone, where the sheet is a bottom sheet over the map. */
function isPhone(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`).matches;
}

/**
 * Anchored at the canvas's centre, so the diamond is drawn on the place's
 * own latitude and longitude, always: a diamond never moves, and what it
 * covers at a state-wide zoom a pinch uncovers. Must be called inside
 * effects where google.maps is guaranteed loaded.
 */
function roadsideMarkerIcon(active = false): google.maps.Icon {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(roadsideMarkerSvg(ROADSIDE_COLOR, active))}`,
    anchor: new google.maps.Point(22, 22),
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
  /** Where each cut night falls, with its name (Gauntlet U29). */
  nightMarks?: NightMark[];
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
  /**
   * A day's stretch of road to frame, or the whole trip again (Gauntlet
   * U3): the sheet asks by handing a new key; the same key twice is one
   * fit. Null asks nothing, so a recompute that closes the open day never
   * moves the camera.
   */
  fitTo?: MapFit | null;
  /**
   * The towns to draw at full strength while a day is open on the map
   * (Gauntlet U3, rounds 3 and 4): that day's towns and its ends; every
   * other town's dot is faded by OFF_DAY_OPACITY and its name not drawn.
   * Null: every town as it is.
   */
  focusCandidateIds?: ReadonlySet<string> | null;
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
  // No country names, and state names dimmed (Gauntlet U23): "United
  // States" was the loudest text on the Kansas City to Denver map, drawn
  // across the route, and the state names crowded the trip's own (two
  // critics, U20 and U22). A trip is in one country; a state orients, so
  // it stays, quieter than any town of the trip (#f0f6fc).
  { featureType: "administrative.country", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.province", elementType: "labels.text.fill", stylers: [{ color: "#4d5560" }] },
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
    // The name's centre TOWN_LABEL_DY (18 px) above the dot, not on it (U20).
    labelOrigin: new google.maps.Point(22, 22 + TOWN_LABEL_DY),
  };
}

/**
 * The start (green) and end (red) dots, the same 7 px circle as before on
 * a canvas tall enough to carry the town's name 30 px above the dot: the
 * dot at (32, 40), the label at (32, 10). Thirty is above a diamond on the
 * town's own point (its canvas reaches 22 px above the dot), and the name
 * is drawn over any diamond it meets (zIndex 1800). Must be called inside
 * effects where google.maps is guaranteed loaded.
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

/**
 * A cut night's mark (Gauntlet U29): a ring in the page's text colour on a
 * dark fill, so it reads as "the day ends here" and not as a town (a
 * purple dot), a stop (a numbered square) or a place (a gold diamond).
 * On the endpoints' 64 px canvas, so its name sits 30 px above it in the
 * map's one label style.
 */
function nightIcon(below = false): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="40" r="6" fill="#0d1117" stroke="#f0f6fc" stroke-width="3"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    anchor: new google.maps.Point(32, 40),
    scaledSize: new google.maps.Size(64, 64),
    // TOWN_LABEL_DY from the ring, above it or, when that is taken, below.
    labelOrigin: new google.maps.Point(32, 40 + (below ? -TOWN_LABEL_DY : TOWN_LABEL_DY)),
  };
}

/** The same face as the candidate towns' labels, so the map has one label style (restyled together in U3). */
function endpointLabel(name: string | undefined): google.maps.MarkerLabel | undefined {
  if (!name) return undefined;
  return { text: name, color: "#f0f6fc", fontSize: "11px", fontWeight: "500", className: "rt-candidate-label" };
}

/**
 * A trip stop's name label, or none (Gauntlet U12).
 *
 * A stop carried its town's name above its numbered square because a stop
 * was where a day ended, and the framed day's end had to read as a town
 * (round 5). Since U10 a roadside place is a visit, not where a day ends,
 * so that reason does not reach it — and its name was the one on the map
 * printed over another: The Big Texan Steak Ranch, six miles out of
 * Amarillo, drawn on top of "Amarillo" so that neither could be read. Three
 * critics in a row named it.
 *
 * A visit keeps its numbered square, and its name stays in the marker's
 * title, which is what a screen reader announces; the sheet names it on its
 * row and its card. Nothing is moved and no label dodges another: rule 6,
 * written after a spreading engine put Amarillo's places in New Mexico.
 */
export function tripStopLabel(stop: { cityId: string; cityName: string }): google.maps.MarkerLabel | undefined {
  return isOvernightStop(stop.cityId) ? endpointLabel(stop.cityName) : undefined;
}

/**
 * A stop's square with its number drawn in it, on the same 64 px canvas
 * as the endpoints so the town's name sits 30 px above the square in the
 * map's one label style (Gauntlet U3, round 5: the end of a framed day
 * read as a "1" badge with no name). The number is in the icon, since a
 * marker has one label and the name is it. Must be called inside effects
 * where google.maps is guaranteed loaded.
 *
 * Every number below is in the SVG's own pixels: scaledSize is 64 by 64,
 * the same as the viewBox, so nothing is scaled and one unit is one
 * screen pixel. They are one set with endpointIcon's, and they centre
 * two things, the name and the number, on the square:
 *   - 64 by 64, the canvas: endpointIcon's, tall enough to hold a name
 *     30 px above the mark. The label is not clipped to it; the canvas
 *     only says where the label's centre is.
 *   - The square at x 22, y 30, 20 by 20: its centre is (32, 40). 32 is
 *     the canvas's middle; 40 is where endpointIcon's dot sits, so a
 *     stop's name stands the same height above its mark as the ends'.
 *     20 holds two digits of 12 px bold (about 14 px wide) with room, and
 *     MAX_TRIP_STOPS (7, in PlanWorkspace.tsx) keeps the number to one.
 *   - anchor (32, 40): the point of the icon placed on the stop's
 *     latitude and longitude, the square's centre, so the square sits on
 *     its town at every zoom and never shifts (rule 6: nothing moves).
 *   - labelOrigin (32, 10): where the marker's label (the town's name,
 *     `endpointLabel`) is centred, 30 px above the square's centre, the
 *     endpoints' distance, and above a roadside diamond on the same point
 *     (a diamond's canvas reaches 22 px above its point).
 *   - The number at x 32 with text-anchor middle: centred on the square
 *     horizontally. Its baseline y 44.5: the digits of 12 px bold
 *     system-ui are about 8.5 px tall, so their middle is at about 40.25,
 *     the square's centre to a quarter pixel. A larger font needs its
 *     baseline lower by half the digits' growth to stay centred.
 *   - #f0f6fc 2 px stroke around the route colour, the number in #0d1117
 *     (the page's background): the sheet's own pair, so the square reads
 *     as the page's mark and the number as text on it.
 * Moves with it: endpointIcon's canvas, anchor and labelOrigin (a
 * different canvas here puts a stop's name at a different height from
 * the ends'), and STRIP_MARGIN_PX.top in fitPaddingPx, sized for a name
 * 30 px above a mark. Held by the test "fades the dots of the other
 * days' towns on the map while one is open and draws no name for them,
 * never the day's own or its ends, and names a stop's square" in
 * src/components/__tests__/PlanWorkspace.days.ssr.test.tsx, which pins
 * that the number is a <text> in this SVG and that effect 3 passes the
 * town's name as the label; the coordinates themselves are not pinned,
 * so a change here is checked by a screenshot with a stop added: the
 * name centred over the square, the number centred in it, the name at
 * the same height as "Amarillo" over the start's dot.
 */
function tripStopIcon(fill: string, n: number): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="22" y="30" width="20" height="20" fill="${fill}" stroke="#f0f6fc" stroke-width="2"/><text x="32" y="44.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#0d1117">${n}</text></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    // The square's centre, on the stop's point.
    anchor: new google.maps.Point(32, 40),
    // One unit per pixel: the viewBox's size, so the numbers above hold.
    scaledSize: new google.maps.Size(64, 64),
    // The name's centre, 30 px above the square's, as over the endpoints.
    labelOrigin: new google.maps.Point(32, 10),
  };
}

// Set the first time a route polyline fails to decode, so the console hears
// about it once per page load, not once per rerun of Effect 1a.
let warnedBadPolyline = false;

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
 *   1c. A day's frame — `[map, fitTo]`
 *       Fits the camera to the stretch the sheet asked for, or back to the
 *       whole trip, once per request key, padded like the first fit.
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
 *   2d. The open day's towns — `[map, candidates, focusCandidateIds, crowdedIds]`
 *       Fades other days' towns and sets every town's name: none for a
 *       faded town or a crowded one (2e).
 *   2e. Crowded names — `[map, candidates, endpoints, tripStops, focusCandidateIds]` + `zoom_changed`
 *       Measures, at the current zoom, which towns' names would sit on a
 *       name already drawn, and hands them to 2d as state (Gauntlet U20).
 *   3.  Trip-stop markers — `[map, tripStops, routeColor]`
 *   3b. Cut nights — `[map, nightMarks]` (Gauntlet U29)
 *       A ring and the night's name where each day the budget cuts ends.
 *       Numbered square markers for stops the user has added.
 *   4.  Roadside diamonds — `[map, roadsideStops]`
 *       Built wholesale, each on its place's own point; the zoom rule
 *       toggles visibility on mount and on every `zoom_changed`, and a tap
 *       goes through `onRoadsideClickRef` so it is never stale. Nothing
 *       here moves a diamond (Gauntlet U1, round 7: the spreading of
 *       rounds 3 to 6 is gone).
 *   4b. Tapped diamond — `[selectedRoadsideId]`
 *       Mutates only the two markers that changed (the previous selection
 *       and the new one) and re-applies the zoom rule so the selected one
 *       stays visible.
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
const NO_CROWDED: ReadonlySet<string> = new Set();
/** A named town's marker: above the diamonds (1500, 1600), under the endpoints (1800) and the stops (2000). */
const NAMED_TOWN_Z = 1700;

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
  nightMarks,
  pending,
  roadsideStops,
  onRoadsideClick,
  selectedRoadsideId,
  phoneSheetTopDvh,
  fitTo,
  focusCandidateIds,
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
  /** Where each cut night falls, with its name (Gauntlet U29). */
  nightMarks?: NightMark[];
  pending?: boolean;
  roadsideStops?: RoadsideMapMarker[];
  onRoadsideClick?: (id: string) => void;
  selectedRoadsideId?: string | null;
  phoneSheetTopDvh?: number;
  fitTo?: MapFit | null;
  /**
   * The towns to draw at full strength while a day is open on the map
   * (Gauntlet U3, rounds 3 and 4): that day's towns and its ends; every
   * other town's dot is faded by OFF_DAY_OPACITY and its name not drawn.
   * Null: every town as it is.
   */
  focusCandidateIds?: ReadonlySet<string> | null;
}) {
  const map = useMap();
  // Null until the geometry library lands (it lazy-loads after the map);
  // a value here reruns Effect 1a, which needs it to decode the route.
  const geometry = useMapsLibrary("geometry");
  const candidateMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const previousHighlightRef = useRef<string | null>(null);
  const hasFitOnceRef = useRef(false);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  // Always-current refs, so the markers (built once per route) never hold a
  // stale click handler or selection. Each is written from an effect keyed
  // on its value, not in the render body: a render React discards must not
  // write a ref, and effects run in declaration order, so these three are
  // current before Effects 4 and 4b below read them in the same commit.
  const onCandidateClickRef = useRef(onCandidateClick);
  useEffect(() => {
    onCandidateClickRef.current = onCandidateClick;
  }, [onCandidateClick]);
  const onRoadsideClickRef = useRef(onRoadsideClick);
  useEffect(() => {
    onRoadsideClickRef.current = onRoadsideClick;
  }, [onRoadsideClick]);
  const selectedRoadsideRef = useRef<string | null>(selectedRoadsideId ?? null);
  useEffect(() => {
    selectedRoadsideRef.current = selectedRoadsideId ?? null;
  }, [selectedRoadsideId]);
  const roadsideMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const previousRoadsideRef = useRef<string | null>(null);
  // Effect 4's zoom-rule pass, kept so Effect 4b can re-run it after a
  // selection change without rebuilding the markers.
  const applyRoadsideZoomRef = useRef<(() => void) | null>(null);
  const [candidateAnnouncement, setCandidateAnnouncement] = useState("");
  // The towns whose names would sit on another name at the current zoom
  // (effect 2e); effect 2d leaves them unnamed.
  const [crowdedIds, setCrowdedIds] = useState<ReadonlySet<string>>(NO_CROWDED);
  // The cut nights whose names sit below their rings, not above (effect 2e).
  const [nightsBelow, setNightsBelow] = useState<ReadonlySet<string>>(NO_CROWDED);

  // ── Effect 1a: polyline geometry / color ───────────────────────────────
  // Rebuilds when the route geometry or persona color changes.
  // `pending` is intentionally NOT in deps — opacity is updated in-place
  // by Effect 1b to avoid tearing down the Polyline on every transition.
  useEffect(() => {
    // No geometry yet means nothing to decode with; `geometry` is in the
    // deps, so this effect runs again the moment the library is here.
    if (!map || !geometry) return;

    let path: google.maps.LatLng[];
    try {
      path = geometry.encoding.decodePath(encodedPolyline);
    } catch (err) {
      // A malformed or truncated polyline must not take the map down with
      // it: draw no route line (the endpoint markers still stand) and say
      // so once. The camera fit waits for a route that decodes.
      if (!warnedBadPolyline) {
        warnedBadPolyline = true;
        console.warn("RouteMap: the route polyline did not decode; no route line drawn.", err);
      }
      return;
    }

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
  }, [map, geometry, encodedPolyline, routeColor]);

  // ── Effect 1c: a day's stretch, or the whole trip again (Gauntlet U3) ──
  // One fit per request key: the sheet hands a new key on every tap, so a
  // tap on day 1, then day 2, then day 1 again is three fits, and a render
  // with the same request is none. Padded the same way as the first fit,
  // from the map's box read now and the sheet's edge at the snap it is
  // dropping to. Nothing here runs on mount (no request yet) or on a
  // recompute (the sheet asks nothing then), so the camera stays the
  // person's (Council ARCH-2).
  const lastFitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !window.google?.maps || !fitTo || fitTo.key === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitTo.key;
    const b = new google.maps.LatLngBounds(fitTo.bounds.southwest, fitTo.bounds.northeast);
    const box = map.getDiv().getBoundingClientRect();
    map.fitBounds(b, fitPaddingPx({ mapTopPx: box.top, mapHeightPx: box.height, viewportHeightPx: window.innerHeight, sheetTopDvh: phoneSheetTopDvh, phone: isPhone() }));
  }, [map, fitTo, phoneSheetTopDvh]);

  // ── Effect 1b: polyline opacity (pending state) ────────────────────────
  // Mutates the existing Polyline in place — no rebuild.
  useEffect(() => {
    polylineRef.current?.setOptions({
      strokeOpacity: pending ? 0.4 : 0.85,
    });
  }, [pending]);

  // ── Effect 2a: endpoint markers ────────────────────────────────────────
  // The start and the end carry the app's own town names (the basemap's are
  // off, DARK_MAP_STYLES), 30 px above the dot, clear of a diamond on the
  // same point. zIndex 1800 puts the dot and its name above
  // the diamonds (1500 and 1600) and under the numbered trip stops (2000),
  // so a name is never behind a diamond; not clickable, so a name never
  // takes a diamond's tap. `optimized: false` draws each as its own
  // element: Google may otherwise draw a marker onto a canvas, where
  // zIndex does not order it against markers drawn as elements, and the
  // round-5 rest capture had a diamond over Austin's dot and name
  // (Gauntlet U3, round 6). Two markers, so the cost is nothing; the
  // diamonds are untouched and none moves (rule 6).
  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const startMarker = new google.maps.Marker({
      position: origin,
      map,
      title: originName ? `Start: ${originName}` : "Start",
      zIndex: 1800,
      clickable: false,
      optimized: false,
      icon: endpointIcon("#3fb950"),
      label: endpointLabel(originName),
    });

    const endMarker = new google.maps.Marker({
      position: destination,
      map,
      title: destinationName ? `End: ${destinationName}` : "End",
      zIndex: 1800,
      clickable: false,
      optimized: false,
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
        label: candidateLabel(candidate.name),
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

  // ── Effect 2d: the open day's towns (Gauntlet U3, rounds 3 and 4) ──────
  // While a day is open on the map, the towns the sheet lists under other
  // days are faded and lose their names, and the day's own stay as they
  // are; the whole trip restores every town and every name. Two options
  // set on markers that already exist, after 2c has diffed them in the
  // same commit (effects run in order), so a town a refresh brings in
  // while a day is open is faded or not by the same rule. Nothing is
  // moved, added or removed (rule 6).
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const names = new Map((candidates ?? []).map((c) => [c.id, c.name]));
    for (const [id, marker] of candidateMarkersRef.current) {
      marker.setOpacity(candidateOpacity(id, focusCandidateIds));
      const named = candidateLabelShown(id, focusCandidateIds) && !crowdedIds.has(id);
      marker.setLabel(named ? candidateLabel(names.get(id) ?? "") : null);
      // A named town draws over the diamonds and over unnamed towns' dots,
      // under the start and the end (1800), so its name is never behind
      // either (U20); an unnamed one stays at the default, under both.
      marker.setZIndex(named ? NAMED_TOWN_Z : undefined);
    }
  }, [map, candidates, focusCandidateIds, crowdedIds]);

  // ── Effect 2e: names that would collide (Gauntlet U20) ─────────────────
  // At the zoom the map is at, which towns' names would sit on a name
  // already drawn: the start's, the end's and a stop town's first, then
  // the open day's towns, then the rest in the order the sheet ranks them.
  // Measured on every zoom, in screen pixels from the map's own projection, and handed to 2d as state, so
  // the one place that sets a town's label stays 2d. Nothing is moved or
  // removed: a crowded town keeps its dot and its tap (rule 6).
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const measure = () => {
      const projection = map.getProjection();
      const zoom = map.getZoom();
      if (!projection || zoom === undefined) return;
      const scale = 2 ** zoom;
      const at = (lat: number, lng: number) => {
        const pt = projection.fromLatLngToPoint(new google.maps.LatLng(lat, lng));
        return pt ? { x: pt.x * scale, y: pt.y * scale } : null;
      };
      const fixed: LabelPlacement[] = [];
      const pin = (lat: number, lng: number, text: string | undefined) => {
        const p = text ? at(lat, lng) : null;
        if (p && text) fixed.push({ ...p, text, offsetY: -30 });
      };
      pin(origin.lat, origin.lng, originName);
      pin(destination.lat, destination.lng, destinationName);
      for (const stop of tripStops ?? []) pin(stop.lat, stop.lng, tripStopLabel(stop)?.text);
      const named = (candidates ?? []).filter((c) => candidateLabelShown(c.id, focusCandidateIds));
      const ordered = focusCandidateIds ? [...named.filter((c) => focusCandidateIds.has(c.id)), ...named.filter((c) => !focusCandidateIds.has(c.id))] : named;
      // A cut night's name (U29) comes first after the fixed names, before
      // any town's: it yields to the start, the end and a stop (a night 44
      // min short of Denver wrote "Denveght 2") but not to a town.
      const nights = (nightMarks ?? []).flatMap((n) => {
        const p = at(n.lat, n.lng);
        // Just above its ring, as a town's name sits above its dot (U29,
        // round 1: 30 px up, "near Hays" read as the diamond's); below it
        // when above is taken, before it gives way.
        return p ? [{ id: n.key, ...p, text: n.label, offsetY: TOWN_LABEL_DY, altOffsetY: -TOWN_LABEL_DY }] : [];
      });
      const towns = [
        ...nights,
        ...ordered.flatMap((c) => {
          const p = at(c.lat, c.lng);
          return p ? [{ id: c.id, ...p, text: c.name, offsetY: TOWN_LABEL_DY }] : [];
        }),
      ];
      const fit = placeLabels(fixed, towns);
      const crowded = new Set(towns.filter((t) => !fit.has(t.id)).map((t) => t.id));
      const below = new Set(nights.filter((n) => fit.get(n.id) === -TOWN_LABEL_DY).map((n) => n.id));
      const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...b].every((id) => a.has(id));
      setCrowdedIds((prev) => (same(prev, crowded) ? prev : crowded));
      setNightsBelow((prev) => (same(prev, below) ? prev : below));
    };
    // Which names collide depends on the zoom alone: a pan moves every
    // point by the same pixels. So the zoom, like the diamonds' rule, is
    // the one camera change that re-measures; the projection's arrival is
    // the first measure when the map was not ready at mount.
    measure();
    const onZoom = map.addListener("zoom_changed", measure);
    const onReady = map.addListener("projection_changed", measure);
    return () => {
      onZoom.remove();
      onReady.remove();
    };
  }, [map, candidates, origin, destination, originName, destinationName, tripStops, nightMarks, focusCandidateIds]);

  // ── Effect 3: trip-stop numbered markers ───────────────────────────────
  // The square with its number, and — for a town — its name above it as
  // the endpoints carry theirs (round 5): a town stop is where a day ends,
  // and the framed day's end must read as a town. A roadside visit gets the
  // square without the name since U12 (`tripStopLabel`). Drawn as elements,
  // like the endpoints, so their zIndex holds against the diamonds (round 6).
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    if (!tripStops || tripStops.length === 0) return;

    const stopMarkers = tripStops.map((stop, index) => {
      return new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        title: `Stop ${index + 1}: ${stop.cityName}`,
        zIndex: 2000,
        optimized: false,
        label: tripStopLabel(stop),
        icon: tripStopIcon(routeColor, index + 1),
      });
    });

    return () => {
      stopMarkers.forEach((m) => m.setMap(null));
    };
  }, [map, tripStops, routeColor]);

  // ── Effect 3b: cut nights (Gauntlet U29) ───────────────────────────────
  // A ring where each day the budget cuts ends, with the night's name above
  // it as the heading says it ("near Sweetwater"). Its own effect (the
  // split rule); rebuilt whole when the nights change, which is when the
  // days are re-cut. Above the diamonds and the towns (1750), under the
  // endpoints (1800) and the stops (2000); not clickable.
  useEffect(() => {
    if (!map || !window.google?.maps || !nightMarks || nightMarks.length === 0) return;
    const markers = nightMarks.map(
      (n) =>
        new google.maps.Marker({
          position: { lat: n.lat, lng: n.lng },
          map,
          title: n.label,
          zIndex: 1750,
          clickable: false,
          optimized: false,
          icon: nightIcon(nightsBelow.has(n.key)),
          // Named unless the name would sit on the start's, the end's or a
          // stop's (2e); the ring stays either way.
          label: crowdedIds.has(n.key) ? undefined : endpointLabel(n.label),
        })
    );
    return () => {
      for (const m of markers) m.setMap(null);
    };
  }, [map, nightMarks, crowdedIds, nightsBelow]);

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
    // Each on its place's own latitude and longitude, and never moved: two
    // places a few km apart overlap at a state-wide zoom, and the zoom rule
    // below and a pinch are what separate them. Rounds 3 to 6 of Gauntlet
    // U1 spread such diamonds into rings and slots, and a moved diamond
    // told the map a place was somewhere it was not; the operator's call
    // after six rounds put every diamond back on its point.
    const icon = roadsideMarkerIcon();
    const selectedAtBuild = selectedRoadsideRef.current;
    const markers = roadsideStops.map((s) => {
      const active = s.id === selectedAtBuild;
      const marker = new google.maps.Marker({ position: { lat: s.lat, lng: s.lng }, map, title: s.name, zIndex: active ? 1600 : 1500, icon: active ? roadsideMarkerIcon(true) : icon, visible: false });
      // Delegate through the ref so the handler is never stale on prop change.
      marker.addListener("click", () => onRoadsideClickRef.current?.(s.id));
      return marker;
    });
    const byId = new Map<string, google.maps.Marker>();
    roadsideStops.forEach((s, i) => byId.set(s.id, markers[i]));
    roadsideMarkersRef.current = byId;
    previousRoadsideRef.current = selectedAtBuild;
    // The zoom rule: at a state-wide view only the strongest diamonds, at a
    // town every survivor. Applied now and on every zoom change; markers are
    // toggled, not rebuilt, so zooming costs nothing but a visibility flag.
    // The tapped one is always shown, so a row tap at a state-wide zoom
    // still puts its diamond on the map.
    const apply = () => {
      const minP = roadsideMinProbabilityAt(map.getZoom() ?? 0);
      const selected = selectedRoadsideRef.current;
      roadsideStops.forEach((s, i) => markers[i].setVisible(s.p >= minP || s.id === selected));
    };
    apply();
    applyRoadsideZoomRef.current = apply;
    const listener = map.addListener("zoom_changed", apply);
    return () => {
      listener.remove();
      markers.forEach((m) => m.setMap(null));
      roadsideMarkersRef.current = new Map();
      applyRoadsideZoomRef.current = null;
      previousRoadsideRef.current = null;
    };
  }, [map, roadsideStops]);

  // ── Effect 4b: the tapped diamond ──────────────────────────────────────
  // Only the two markers that changed are touched (the previous selection
  // and the new one), then the zoom rule runs again so the selected one is
  // visible and a cleared one goes back to its own rule. Neither marker
  // moves: the tapped one is drawn larger on the same point. Declared after
  // Effect 4 so the markers exist on the first pass.
  useEffect(() => {
    if (!window.google?.maps) return;
    const markers = roadsideMarkersRef.current;
    if (markers.size === 0) return;
    const prev = previousRoadsideRef.current;
    if (prev && prev !== selectedRoadsideId) {
      const prevMarker = markers.get(prev);
      if (prevMarker) {
        prevMarker.setIcon(roadsideMarkerIcon());
        prevMarker.setZIndex(1500);
      }
    }
    if (selectedRoadsideId) {
      const nextMarker = markers.get(selectedRoadsideId);
      if (nextMarker) {
        nextMarker.setIcon(roadsideMarkerIcon(true));
        // Above the other diamonds, below the numbered trip stops (2000).
        nextMarker.setZIndex(1600);
      }
    }
    previousRoadsideRef.current = selectedRoadsideId ?? null;
    applyRoadsideZoomRef.current?.();
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
  nightMarks,
  pending = false,
  roadsideStops,
  onRoadsideClick,
  selectedRoadsideId = null,
  phoneSheetTopDvh,
  fitTo = null,
  focusCandidateIds = null,
}: RouteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#161b22] border border-[#30363d]">
        <p className="text-base text-[#8b949e] px-4 text-center">
          Set <span className="num">NEXT_PUBLIC_GOOGLE_MAPS_KEY</span> to show the map
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
        // Fractional zooms, so a fit lands on the zoom at which the road
        // fills the strip above the sheet rather than the whole zoom below
        // it (Gauntlet U3, round 5: a framed day 145 px tall at zoom 7
        // dropped to 72 at zoom 6 and sat in the middle of the strip with
        // the next day's road running on under the sheet). Google's
        // default is whole zooms on a raster map; the zoom rule for the
        // diamonds compares against whole steps and reads a fraction as
        // it should. Pinned by the fit test in
        // src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx.
        isFractionalZoomEnabled
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
            nightMarks={nightMarks}
            roadsideStops={roadsideStops}
            onRoadsideClick={onRoadsideClick}
            selectedRoadsideId={selectedRoadsideId}
            phoneSheetTopDvh={phoneSheetTopDvh}
            fitTo={fitTo}
            focusCandidateIds={focusCandidateIds}
            pending={pending}
          />
        ) : (
          <DirectionsFallback origin={origin} destination={destination} />
        )}
      </GMap>
    </APIProvider>
  );
}
