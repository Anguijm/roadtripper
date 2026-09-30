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
import { roadsideAnchor, townsAlong, type RoadsideAnchor } from "@/lib/roadside/anchor";
import { decodePolyline } from "@/lib/routing/polyline";
import RouteMap, {
  type CandidateMarker,
  type TripStopMarker,
  type MapFit,
} from "@/components/RouteMap";
import MoodChips from "@/components/MoodChips";
import RecommendationList, {
  RecommendationNotices,
  type AddCityPayload,
} from "@/components/RecommendationList";
import NeighborhoodPanel from "@/components/NeighborhoodPanel";
import Figures from "@/components/Figures";
import { panelCityFor, nextPanelCityId } from "@/lib/plan/panel-city";
import { waypointProfileForMoods } from "@/lib/personas/moodProfile";
import { orderRoadside } from "@/lib/roadside/order";
import {
  toggleMood,
  parseMoods,
  MOOD_CONFIG,
  SORT_LABELS,
  MOODS_PARAM,
  SORT_MODES,
  type MoodId,
  type SortMode,
} from "@/lib/roadside/tags";
import SortControl from "./SortControl";
import type { WaypointFetchResult, NeighborhoodLoadState, CityContext, LiteWaypoint } from "@/lib/routing/scoring";
import { formatDistance, formatDurationPlain } from "@/lib/routing/format";
import { fitsTodayLine, dayHeadingLine, tripShapeLine, townsFitHeading } from "@/lib/plan/words";
import { buildRoad, alongRoadKm, nearestOnRoad, pointAlong, tripDays as cutIntoDays, townsDay, dayBounds, boundsOf, uniqueByName } from "@/lib/plan/days";
import { arrivalSentence, localTodayIso } from "@/lib/plan/deadline";
import { recomputeSequence, nextRecompute, isCurrentRecompute } from "@/lib/plan/recompute-sequence";
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
import { isCityId } from "@/lib/urban-explorer/cityAtlas";

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
  /** The moods the link arrived with, oldest first; empty is the sheet at rest. */
  initialMoods: readonly MoodId[];
  budgetHours: number;
  initialDistanceMeters: number;
  initialDurationSeconds: number;
  fromName: string;
  toName: string;
  // The detour cap ("max 270 min") is not said on the sheet: its
  // replacement in the glossary is nothing, so the prop that carried it is
  // gone (Gauntlet U2, deciding what U1 round 2 left open).
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
  /**
   * Today as YYYY-MM-DD for the arrival sentence ("Arrive in Austin by
   * October 14, six days from now"; Gauntlet U3): the server's local day
   * for the first paint, and once mounted the sheet reads the browser's
   * own clock, so the count is the person's day (round 2: the UTC day was
   * a day behind Japan's evening). Without it the server says no deadline.
   */
  today?: string;
  /**
   * A trip already on the sheet at the first render: its stops, the legs
   * the route gave for them, and the last leg's minutes; `addedFrom`, the
   * set the stops were added from when it is not the page's own set (the
   * towns that fit move on past a stop, and the stop's town is kept from
   * the set it left); `failedStopId`, a stop whose recompute failed. Only
   * the SSR tests pass it, to render the days a recompute would build; the
   * page never sets it, and a browser given it would recompute on mount.
   */
  initialTrip?: {
    stops: TripStopMarker[];
    legs: TripLeg[];
    directMinutesToDestination: number;
    addedFrom?: WaypointFetchResult;
    failedStopId?: string;
  };
  /**
   * The town whose "What's in" answer is open on the first render, under
   * its row. Only the SSR tests pass it, as `initialSelectedRoadsideId`.
   */
  initialPanelCityId?: string;
}

/** A stop's town and its places, kept from the set it was added from (Gauntlet U3, round 2). */
interface StopTown {
  city: CityContext;
  waypoints: LiteWaypoint[];
}

/** The town and places for a stop, out of a set; a name alone when the set does not hold it. */
function stopTownFrom(set: WaypointFetchResult, stop: { cityId: string; cityName: string; lat: number; lng: number }): StopTown {
  const city = set.cities.find((c) => c.id === stop.cityId);
  return {
    city: city ?? { id: stop.cityId, name: stop.cityName, vibeClass: null, detourMinutes: 0, lat: stop.lat, lng: stop.lng },
    waypoints: set.waypoints.filter((w) => w.cityId === stop.cityId),
  };
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
 * The card's line when the store has none: `about` is already the
 * encyclopedia's opening, else Wikidata's short description, else what the
 * mapper typed (survivors.ts), so a null is a place the map has only a kind
 * for. The line says so in the map's terms, "On the map as a historic
 * place; nothing written about it yet.", rather than a placeholder ("No
 * write-up for this one.", the round-5 critic) or the bare kind as a
 * sentence, which only repeated the line beneath (round 1). The store's
 * line itself is a hard stop and is not touched.
 */
export function roadsideMapLine(kind: RoadsideMarker["kind"]): string {
  const word = ROADSIDE_KIND_WORDS[kind] ?? "place";
  return `On the map as ${/^[aeiou]/.test(word) ? "an" : "a"} ${word}; nothing written about it yet.`;
}

/**
 * How far along the road a stop sits, as a person in the car says it:
 * "131 miles along the road", and with the town when the caller has one,
 * "6 miles along, in Amarillo" or "131 miles along, past Lubbock" (U2's
 * round-2 critic: "494 mi in, at Austin" read as engineer shorthand).
 * Miles, because the sheet's own summary says "497 mi" (U1's round-2
 * critic: one sheet, one unit), rounded as `formatDistance` rounds
 * (`Math.round` of the miles) so the two can never disagree.
 */
export function roadsideAlongText(alongKm: number, anchor: RoadsideAnchor | null = null): string {
  const mi = Math.round((alongKm * 1000) / 1609.34);
  // Lower case: the text always follows the kind ("well-known place · less
  // than a mile along"), and a capital there read as a second sentence
  // (U1's round-3 critic, rule 1).
  const dist = mi < 1 ? "less than a mile along" : mi === 1 ? "1 mile along" : `${mi} miles along`;
  if (!anchor) return `${dist} the road`;
  return `${dist}, ${anchor.near ? "in" : "past"} ${anchor.name}`;
}

/**
 * How many roadside stops the list shows before "Show all": the strongest
 * ten. A corridor holds a few hundred survivors and the diamonds on the
 * map already say where; ten is a screen's worth on a phone.
 */
export const ROADSIDE_SHOWN_FIRST = 10;

/**
 * The phone's bottom sheet (`.plan-sheet` in src/app/globals.css): 92 dvh
 * tall, fixed at the bottom, translated down by the snap's share of its own
 * height. The visible part of it (`.plan-sheet-visible`, the same file) is
 * a column of the handle row and the scroll box, so the box is the visible
 * part less the handle and no content ever sits below the screen's edge
 * out of reach; as `flex-1` of the whole sheet the box's bottom 350 px
 * could not be scrolled to at rest (Gauntlet U1, round 4). The handle row
 * carries the sheet's title (U2, round 2), one line on the fresh sheet, so
 * the handle is SHEET_HANDLE_PX tall; a title that wraps makes the handle
 * taller and the box shorter by the same amount, never the box longer than
 * the screen. The rest snap is set so the roadside section fits the box on
 * a 390 by 844 phone: `sheetScrollBoxPx(844, 1)` is at least
 * ROADSIDE_LIST_PX plus SHEET_BOX_PADDING_PX, the box's own padding above
 * the section, which is first in the box (round 6). Held by a test; change
 * the CSS and these together.
 */
export const SHEET_HEIGHT_DVH = 92;
/**
 * The hidden share of the sheet's own height at each snap, in percent:
 * peek, rest (the default), full. Rest is 25 so the sheet's top sits at
 * 31 dvh (100 - 92 * 0.75): on a 390 by 844 phone that is 537 px of
 * scroll box, which holds the roadside heading, ten rows and "Show all N"
 * with 17 px to spare, and a 217 px strip of map above the sheet for the
 * road. At 30 the box is 498 and the control is cut; at 45 (round 3's
 * half snap) it is 382 and six rows are. Peek is 80 so the handle and
 * one line show over a nearly whole map; full is 8 so the sheet's top
 * stops at 15 dvh, under the page's header. Moves with it: the CSS
 * default `translateY(var(--sheet-y, 25%))` and the scroll box's
 * `calc(100% - var(--sheet-y, 25%) - 45px)` in src/app/globals.css,
 * `sheetScrollBoxPx`, `sheetTopDvh` and through it the map's fit padding
 * (`fitPaddingPx` in RouteMap.tsx). Check: the test "holds the heading,
 * ten rows and the control in the sheet's scroll box at rest on a 390 by
 * 844 phone" pins [80, 25, 8] and the arithmetic, and a screenshot of the
 * plan page at 390 by 844 shows "Show all N" whole above the fold.
 */
export const SHEET_SNAPS = [80, 25, 8] as const;
/** The handle row (44 px, the pill and the sheet's one-line title) and the sheet's top border. */
export const SHEET_HANDLE_PX = 45;
/** The scroll box's padding (`p-2`), above the first section. */
export const SHEET_BOX_PADDING_PX = 8;
/** Pixels of scroll box on screen at a snap, on a phone `viewportPx` tall. */
export function sheetScrollBoxPx(viewportPx: number, snap: 0 | 1 | 2): number {
  return Math.floor((viewportPx * SHEET_HEIGHT_DVH * (100 - SHEET_SNAPS[snap])) / 10_000) - SHEET_HANDLE_PX;
}
/** Where the sheet's top edge sits at a snap, in dvh from the top of the screen; the map's one fit frames the road in the strip above it. */
export function sheetTopDvh(snap: 0 | 1 | 2): number {
  return 100 - (SHEET_HEIGHT_DVH * (100 - SHEET_SNAPS[snap])) / 100;
}
/**
 * A day's roadside list from its heading through the "Show all" control:
 * the heading's 24 with nothing between it and the first row, ten rows of
 * 44 (two lines of 22, no padding), a 4 px gap and the 44 px control. 512,
 * which U1 sized the rest snap for when the list was first in the box
 * (520 of the 537 px on screen with the box's padding); since U3 the list
 * sits inside its day, under that day's towns, and the rest snap keeps
 * the box's size. The classes on the section add up to this; change both
 * together.
 */
export const ROADSIDE_LIST_PX = 24 + ROADSIDE_SHOWN_FIRST * 44 + 4 + 44;

/** The route's points, or none: a loading or error state can hand an empty or malformed polyline, and the decoder throws past its vertex limit. */
function safeDecode(encoded: string): ReturnType<typeof decodePolyline> {
  try {
    return encoded ? decodePolyline(encoded) : [];
  } catch {
    return [];
  }
}

function roadsideMapsUrl(s: Pick<RoadsideMarker, "lat" | "lng">): string {
  return `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
}

/**
 * The least sideways travel, in CSS px, that closes the card. 60 is well
 * over a finger's wobble in a tap (a few px; the sheet's own tap-or-drag
 * line is 5) and about a sixth of the card's 366 px width on a 390 px
 * phone, so a short flick closes it and a thumb settling on it does not.
 * A scroll of the sheet over the card is ruled out by the direction test
 * in `roadsideSwipeCloses`, not by this length. Nothing in CSS moves with
 * it. Check: the test "closes the card on a sideways swipe, not on a
 * scroll or a tap" pins 60 and the line at 59 and 60, and on a 390 px
 * phone a flick across the open card closes it while a scroll over it
 * does not.
 */
export const SWIPE_PX = 60;

/**
 * Whether a touch that moved `dx` to the right and `dy` down across the
 * card is the swipe that closes it: sideways, at least SWIPE_PX, and more
 * sideways than up or down, so a finger scrolling the sheet over the card
 * never closes it and a tap (no movement) stays a tap. Pure, so a test can
 * prove the line without a touch screen.
 */
export function roadsideSwipeCloses(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy);
}

/**
 * The card for one roadside stop (Gauntlet U1). Pure: the five parts from
 * what the store gives, nothing fetched. The name, the line about it (the
 * store's, or that there is none), the kind in plain words with how far
 * along the road and which town it is at or past (`anchor`, from the towns
 * the page already has), and one link-button that opens the place in
 * Google Maps. No separate close button (the spec): the card closes on a
 * second tap of its diamond or its row, on a tap of its own heading (a
 * 44 px button carrying the name, marked open with aria-expanded), or on
 * a sideways swipe across it. `about` and `name` are
 * untrusted text and are rendered as text.
 */
export function RoadsideCard({
  stop,
  anchor = null,
  onClose,
  isAdded = false,
  atCap = false,
  onToggleStop,
}: {
  stop: RoadsideMarker;
  anchor?: RoadsideAnchor | null;
  onClose?: () => void;
  /** Whether this place is already one of the trip's stops. */
  isAdded?: boolean;
  /** Whether the trip already holds all the stops it can (`MAX_TRIP_STOPS`). */
  atCap?: boolean;
  /**
   * Put this place in the trip, or take it out again when it is already in
   * (Gauntlet U7). Left off in the tests that render the card on its own;
   * the control is then not drawn at all, rather than drawn and dead.
   */
  onToggleStop?: () => void;
}) {
  // The same three states, words and colours as a town's control in
  // RecommendationList: a card and a town row must not offer the same
  // action under two names (quality bar, rule 1).
  const canAdd = !isAdded && !atCap;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  return (
    <section
      data-roadside-card={stop.id}
      aria-label={stop.name}
      className="font-sans border border-[#e3b341] bg-[#161b22] px-3 pt-0 pb-3 space-y-2"
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        // A second finger or an interrupted pointer can end with no touch in the list: then nothing.
        const end = e.changedTouches[0];
        if (!end) return;
        if (roadsideSwipeCloses(end.clientX - start.x, end.clientY - start.y)) onClose?.();
      }}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      <h3 className="text-lg leading-snug text-[#f0f6fc]">
        <button
          type="button"
          onClick={onClose}
          aria-expanded={true}
          className="w-full min-h-[44px] flex items-center justify-between gap-2 text-left focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          <span className="min-w-0 break-words">{stop.name}</span>
          <span aria-hidden className="shrink-0 text-base text-[#8b949e]">▲</span>
        </button>
      </h3>
      <p data-roadside-line className="text-base leading-snug text-[#c9d1d9] break-words">
        {stop.about ?? roadsideMapLine(stop.kind)}
      </p>
      <p data-roadside-where className="text-base text-[#8b949e]">
        {ROADSIDE_KIND_WORDS[stop.kind] ?? "place"} · {roadsideAlongText(stop.alongKm, anchor)}
      </p>
      {/* The one obvious action on this card is putting the place in the
          trip (rule 3), so it comes before "Open in Maps", which leaves
          the app. At the cap it is off and the reason is the sentence
          under it, never the control's own label. */}
      {onToggleStop && (
        <>
          <button
            type="button"
            data-roadside-add
            onClick={onToggleStop}
            disabled={!isAdded && !canAdd}
            title={isAdded ? "Take this stop out" : atCap ? "The trip has all the stops it can hold" : "Stop here"}
            className={[
              "flex items-center justify-center w-full min-h-[44px] text-base border transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
              // U7 round 1 failed rule 3 on the weight of these three
              // states, not their words. The first cut gave this control
              // the town row's quiet outline and left "Open in Maps" in
              // full gold, so the one thing the card exists to offer was
              // the faintest mark on it and the loudest one sent the
              // person out of the app; and the added state was the
              // brightest block on the sheet, which made the most
              // inviting target the one that undoes the add.
              //
              // Offering it is now the card's one loud control, filled in
              // the gold the card is bordered and headed in. Added is
              // calm: a gold rule and gold text on the card's own
              // background, which reads as done rather than as a thing to
              // press, while staying tappable so a stop can come out.
              isAdded
                ? "border-[#e3b341] bg-transparent text-[#e3b341] font-normal hover:bg-[#1c2128]"
                : canAdd
                  ? "border-transparent bg-[#e3b341] text-[#0d1117] font-semibold hover:bg-[#f0c454]"
                  : "border-[#21262d] text-[#6e7681] cursor-not-allowed",
            ].join(" ")}
          >
            {isAdded ? "✓ Added" : "+ Stop here"}
          </button>
          {!isAdded && atCap && (
            <p className="text-base text-[#b0b9c2]" role="status">
              The trip has all the stops it can hold; take one out to add another.
            </p>
          )}
        </>
      )}
      <a
        href={roadsideMapsUrl(stop)}
        target="_blank"
        rel="noopener noreferrer"
        // Quiet, and quieter than "+ Stop here": this link leaves the app,
        // so it must not be the loudest thing on a card whose own action
        // is to keep the person in it (U7 round 1, rule 3).
        className="flex items-center justify-center w-full min-h-[44px] text-base border border-[#30363d] text-[#b0b9c2] hover:border-[#6e7681] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
      >
        Open in Maps
      </a>
    </section>
  );
}

// Seven is this project's own cap on stops, not the Routes API's: the API
// takes up to 25 intermediates. `computeRouteWithStops` in
// src/lib/routing/directions.ts throws above its MAX_INTERMEDIATES of 7,
// and MAX_STOPS in src/app/plan/actions.ts answers "too_many_stops" above
// the same 7, so the three must move together. Seven because every stop
// added or removed is one recompute, a Routes API call and then the towns
// and places along the new route read again, so the cap bounds what one
// trip can cost; and seven stops with the start and the end is nine rows
// on the sheet, about as long a list as a person reads on a phone.
const MAX_TRIP_STOPS = 7;

// Compile-time exhaustiveness — adding a new RecomputeErrorCode forces a label.
// Sentences a person would say (quality bar, rule 1); none of the
// glossary's words.
const ERROR_LABELS: Record<RecomputeErrorCode, string> = {
  invalid_input: "Couldn't update the route: a stop has no place on the map.",
  too_many_stops: `The trip has all the stops it can hold (${MAX_TRIP_STOPS}).`,
  rate_limited: "Slow down; too many route updates. Try again in a moment.",
  quota_exceeded: "Today's route updates are used up. Try again tomorrow.",
  upstream_unavailable: "The route service is not answering. Try again in a moment.",
  internal_error: "Something went wrong updating the route.",
};

export default function PlanWorkspace({
  origin,
  destination,
  encodedPolyline,
  bounds,
  candidateMarkers,
  waypointFetch,
  initialMoods,
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
  today,
  initialTrip,
  initialPanelCityId,
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
  /**
   * What a mood tap or an order tap changed, for a screen reader (U6).
   *
   * The chips and the order control both reorder a list that is further
   * down the sheet than the control that reordered it, so the one thing a
   * tap actually does is the one thing a person using a screen reader
   * cannot see it do. `aria-pressed` says the chip is on; it does not say
   * the list underneath moved.
   *
   * Polite and set only on a tap, never on the first render, so it does
   * not read the sheet's whole state on arrival. Council round 1 on #94
   * asked for it for the order; it is worth as much for the moods, and
   * they share one region so two taps in a row cannot talk over each
   * other.
   */
  const [listAnnouncement, setListAnnouncement] = useState("");

  // Persona state — see Session 5 architectural lesson in commit ae3601f.
  const [chosenMoods, setChosenMoods] = useState<readonly MoodId[]>(initialMoods);
  // The server's moods, as one string, so the effect below has something
  // stable to watch: `initialMoods` is an array prop and gets a new
  // identity on every render.
  const initialMoodKey = initialMoods.join(",");
  // How the day's places are ordered. "best" is the chosen moods through
  // rankFor; "along" is the order they come up on the road. Not in the URL:
  // it is how you are reading the list right now, not part of the trip.
  const [sortMode, setSortMode] = useState<SortMode>(SORT_MODES[0]);
  // The shape scoreWaypoint takes, rebuilt only when the moods change.
  const moodProfile = useMemo(() => waypointProfileForMoods(chosenMoods), [chosenMoods]);
  const moodKey = chosenMoods.join(",");
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
  const [tripStops, setTripStops] = useState<TripStopMarker[]>(() => initialTrip?.stops ?? []);
  // A stop's town and its places, from the moment it is added (Gauntlet
  // U3, round 2). The refresh after a stop counts the towns that fit from
  // that stop, so the stop's own town leaves the set; its day still ends
  // there, so the sheet keeps what it had. Dropped when the stop is.
  const [stopTowns, setStopTowns] = useState<Record<string, StopTown>>(() => {
    const out: Record<string, StopTown> = {};
    const from = initialTrip?.addedFrom ?? waypointFetch;
    for (const s of initialTrip?.stops ?? []) out[s.cityId] = stopTownFrom(from, s);
    return out;
  });
  // TripState tracks accumulated leg times + budget status. Built from
  // route legs returned by recomputeAndRefreshAction; empty until first stop.
  const [tripState, setTripState] = useState<TripState>(() =>
    buildTripState(initialTrip?.legs ?? [], totalBudgetMins, initialTrip?.directMinutesToDestination ?? initialDurationSeconds / 60)
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
  // Only the most-recent failed stop is ever surfaced (under its day's
  // heading), so a single nullable id replaces the prior `Set<string>`.
  const [failedStopId, setFailedStopId] = useState<string | null>(initialTrip?.failedStopId ?? null);
  const [isPending, startTransition] = useTransition();

  // Which town's "What's in" answer is open, under that town's row in its
  // day. Opened by its button or a tap on a stop's square on the map,
  // never by itself (round 2: a stop's add used to open it above the
  // days); closed by a second tap or when the town leaves both lists.
  const [panelCityId, setPanelCityId] = useState<string | null>(initialPanelCityId ?? null);
  // The arrival count's "today": the server's day for the first paint,
  // the browser's own clock once mounted (the person's day, not UTC's).
  // No hydration mismatch here (council round 1 on #87, item 7, checked):
  // the first client render uses the `today` prop the server computed
  // (src/app/plan/page.tsx, `today={localTodayIso()}`), which travels in
  // the RSC payload and so is the same string on both sides, and nothing
  // on this component's render path calls the clock: the one
  // `localTodayIso()` in this file is in the effect below, which runs
  // after hydration, and the days' "today" (`fitsTodayLine`,
  // `townsFitHeading` in src/lib/plan/words.ts) is the word for day 1,
  // not a date. A viewer whose day differs from the server's sees the
  // count change once after mount by a state update, a re-render and not
  // a mismatch. Do not move `localTodayIso()` into the initial state or
  // the JSX: that is the mismatch this comment says there is not.
  const [sheetToday, setSheetToday] = useState<string | undefined>(today);
  useEffect(() => {
    setSheetToday(localTodayIso());
  }, []);
  // On-demand neighborhood cache for stops the user clicked that weren't
  // pre-fetched by recomputeAndRefreshAction.
  const [localNeighborhoods, setLocalNeighborhoods] = useState<
    Record<string, NeighborhoodLoadState>
  >({});
  // Screen-reader announcement for panel loading / content updates (WCAG 4.1.3).
  const [panelAnnouncement, setPanelAnnouncement] = useState("");

  // Which recompute is current: the latest ask wins, and a reset is an
  // ask (Council ISC-S6-ARCH-5; council round 3 on #87, item 3; the rule
  // is src/lib/plan/recompute-sequence.ts and its test).
  const recomputeSeqRef = useRef(recomputeSequence());

  // Mobile bottom sheet snap state: 0 = peek, 1 = rest (the default), 2 =
  // full; the hidden share at each is SHEET_SNAPS above.
  const SNAP_LABELS = ["peeked", "half-open", "fully open"] as const;
  const [sheetSnap, setSheetSnap] = useState<0 | 1 | 2>(1);
  const [sheetAnnouncement, setSheetAnnouncement] = useState("");
  const sheetRef = useRef<HTMLElement>(null);
  const touchStartYRef = useRef<number | null>(null);
  // Base translateY% captured at drag start — avoids stale closure on sheetSnap.
  const dragBasePctRef = useRef<number>(SHEET_SNAPS[1]);

  // Announce snap changes to screen readers after each state update.
  useEffect(() => {
    setSheetAnnouncement(`Panel now ${SNAP_LABELS[sheetSnap]}.`);
  }, [sheetSnap]);

  const cycleSnap = useCallback(() => {
    setSheetSnap((s) => ((s + 1) % 3) as 0 | 1 | 2);
  }, []);

  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    // On a wide screen the sheet is a side panel and does not move; a touch
    // on its title row (which is the drag row on a phone) is not a drag.
    if (window.matchMedia("(min-width: 768px)").matches) return;
    touchStartYRef.current = e.touches[0].clientY;
    // Read base position from CSS var (set by React style prop) so we never
    // depend on the sheetSnap closure value during move.
    const raw = sheetRef.current?.style.getPropertyValue("--sheet-y") ?? "";
    const parsed = parseFloat(raw);
    dragBasePctRef.current = isNaN(parsed) ? SHEET_SNAPS[1] : parsed;
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
    sheetRef.current.style.setProperty("--sheet-y", `${SHEET_SNAPS[sheetSnap]}%`);
  }, [sheetSnap]);

  // The route line's colour. The first mood chosen, so that adding a
  // second never repaints the road the first one painted; with none
  // chosen it is the default the sheet has always opened with.
  const accent = moodProfile.accentColor;

  // Derived live values — fall back to the server-rendered initials.
  // `bounds` (initial corridor) is the only camera input — recomputes
  // redraw the polyline in place without re-fitting (Council ARCH-2).
  const livePolyline = liveRoute?.encodedPolyline ?? encodedPolyline;
  const liveDistance = liveRoute?.totalDistanceMeters ?? initialDistanceMeters;
  const liveDuration = liveRoute?.totalDurationSeconds ?? initialDurationSeconds;
  const totalDistanceText = formatDistance(liveDistance);
  const onTheRoadText = formatDurationPlain(liveDuration);

  // The recommendation set the user actually sees — refreshed when present,
  // initial server prop otherwise (Council ISC-S7-ARCH-2). Never missing
  // and never a failure: the prop is required, a page whose town read
  // failed passes an empty "fresh" set with `initialCandidateFetchFailed`,
  // and `liveWaypointFetch` is only ever set from a refresh that returned
  // a set. Both members of WaypointFetchResult carry cities and waypoints.
  const effectiveWaypointFetch = liveWaypointFetch ?? waypointFetch;

  // The set the days draw their towns from: the effective set, and every
  // stop's town the set no longer holds, with the places it had when it
  // was added. The title, the notices and the map keep the effective set:
  // a stop is on the trip, not a town that fits.
  //
  // Nothing here needs a guard on the set's state (council round 3 on
  // #87, item 1, as round 1 on #85 found). WaypointFetchResult has two
  // members, "fresh" and "degraded", and both carry `cities`, `waypoints`
  // and `neighborhoods`; there is no "loading" or "failed" member, and no
  // optional field the sheet reads. The one field that belongs to a
  // single member, `failures`, is read once, at the panel below, behind
  // `status === "degraded"`. `effectiveWaypointFetch` is never null: the
  // prop is required, and `liveWaypointFetch` is null or a set. So every
  // `.waypoints` and `.cities` on this set, and on `effectiveWaypointFetch`
  // (the title, the notices, the panel, the map's dots), is a read of an
  // array that is always there. Rendered for each member and for the empty
  // set with the flag, with a stop's town kept and the panel open, in
  // "draws the days from each member of the set's type" in
  // src/components/__tests__/PlanWorkspace.days.ssr.test.tsx, which also
  // fails to compile if a member is added.
  const sheetFetch = useMemo<WaypointFetchResult>(() => {
    const have = new Set(effectiveWaypointFetch.cities.map((c) => c.id));
    const kept = Object.values(stopTowns).filter((t) => !have.has(t.city.id));
    if (kept.length === 0) return effectiveWaypointFetch;
    return {
      ...effectiveWaypointFetch,
      cities: [...effectiveWaypointFetch.cities, ...kept.map((t) => t.city)],
      waypoints: [...effectiveWaypointFetch.waypoints, ...kept.flatMap((t) => t.waypoints)],
    };
  }, [effectiveWaypointFetch, stopTowns]);

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
  // by a second tap on the same one, a tap on the card's own heading or a
  // sideways swipe across the card; no separate close button (the spec).
  const [selectedRoadsideId, setSelectedRoadsideId] = useState<string | null>(initialSelectedRoadsideId ?? null);
  // Which days' roadside lists are open past the strongest ten (Gauntlet
  // U3: one list per day, so one "Show all N" per day).
  const [showAllDays, setShowAllDays] = useState<readonly number[]>([]);
  const selectedRoadside = useMemo(
    () => (selectedRoadsideId ? roadsideStops.find((s) => s.id === selectedRoadsideId) ?? null : null),
    [roadsideStops, selectedRoadsideId]
  );
  // The route as drawn, decoded once per route. A loading or error state
  // can hand an empty or malformed polyline, and the decoder throws past
  // its vertex limit: then no road, not a crashed render.
  const liveRoutePoints = useMemo(() => safeDecode(livePolyline), [livePolyline]);
  // The towns on the road, for the card's "in Amarillo" and "past Lubbock":
  // the start, the end and the towns that fit within 15 km of the route,
  // placed along a route sampled every kilometre. Once per route; nothing
  // when there is no roadside stop to say it for.
  const roadTowns = useMemo(() => {
    if (roadsideStops.length === 0 || liveRoutePoints.length === 0) return [];
    return townsAlong(liveRoutePoints, { name: fromName, ...origin }, { name: toName, ...destination }, liveCandidateMarkers);
  }, [roadsideStops.length, liveRoutePoints, fromName, toName, origin, destination, liveCandidateMarkers]);
  const handleRoadsideSelect = useCallback((id: string) => {
    setSelectedRoadsideId((curr) => (curr === id ? null : id));
  }, []);
  const clearRoadside = useCallback(() => setSelectedRoadsideId(null), []);
  const roadsideCardRef = useRef<HTMLDivElement>(null);
  // A tap on the map has to be answered where the person can see it: the
  // card sits at the top of the roadside section, under the header, so the
  // sheet scrolls to it, and a peeked sheet rises to rest so the card is on
  // screen at all. Nothing moves when the card closes.
  useEffect(() => {
    if (!selectedRoadsideId) return;
    setSheetSnap((s) => (s === 0 ? 1 : s));
    roadsideCardRef.current?.scrollIntoView({ block: "start" });
  }, [selectedRoadsideId]);

  // ── The trip as days (Gauntlet U3; quality bar, rule 5) ────────────────
  // The direct route is the frame: the road the page was planned on and
  // the one the roadside stops were measured along. Decoded once per plan;
  // every place is placed along it once per set. No routing call: the
  // legs are the recompute's, the road is the page's.
  const road = useMemo(() => buildRoad(safeDecode(encodedPolyline)), [encodedPolyline]);
  // The towns that fit, each with where the road passes nearest it and
  // how far off the road it sits, so a town on the road can name where a
  // cut day ends ("near Snyder") and one hours off it cannot. The towns
  // are listed under the next day whatever their position (round 6): they
  // are the choices for where that day ends, counted from the last stop.
  const dayTowns = useMemo(
    () => liveCandidateMarkers.map((c) => ({ id: c.id, name: c.name, ...nearestOnRoad(road, c) })),
    [liveCandidateMarkers, road]
  );
  const dayStops = useMemo(
    () => tripStops.map((s) => ({ id: s.cityId, name: s.cityName, alongKm: alongRoadKm(road, s) })),
    [tripStops, road]
  );
  // The legs lag the stops (a stop is on the sheet before its recompute
  // returns, and stays when it fails), so a day whose leg is not here yet
  // has no time, and the last day's time is only known when every leg is.
  const legMinutes = useMemo<(number | null)[]>(() => {
    const legsMatch = tripState.legs.length === tripStops.length;
    return [
      ...tripStops.map((_, i) => (tripState.legs[i] ? tripState.legs[i].durationSeconds / 60 : null)),
      legsMatch ? tripState.directMinutesToDestination : null,
    ];
  }, [tripState, tripStops]);
  const days = useMemo(
    () =>
      cutIntoDays({
        fromName,
        toName,
        stops: dayStops,
        legMinutes,
        roadLengthKm: road.lengthKm,
        towns: dayTowns,
        roadside: roadsideStops,
        budgetMinutesPerDay: budgetHours * 60,
      }),
    [fromName, toName, dayStops, legMinutes, road, dayTowns, roadsideStops, budgetHours]
  );
  // Each day's heading, a sentence with its figures: "Day 1 · Amarillo to
  // Lubbock · 3 h 20 min", and a day cut where the budget runs out named
  // by where, "Day 1 · Amarillo to near Snyder · 4 h" then "Day 2 · near
  // Snyder to Austin · 3 h 50 min" (round 5: round 4's "Days 1 and 2 ·
  // Amarillo to Austin" never said where day 1 ended), or in hours with
  // no town near, "Day 1 · 4 h down the road from Amarillo" then "Day 2
  // · on to Austin · 3 h 37 min" (round 6: "mile 259" was not a person's
  // word). The trip's shape in one line under the numbers, "Three days,
  // with a night in Lubbock and one on the road", for two days or more;
  // it repeats no heading (round 4: the strip of day rows did).
  const dayHeadings = useMemo(() => days.map((day) => dayHeadingLine(day)), [days]);
  const tripShape = useMemo(() => tripShapeLine(days), [days]);
  // The day the towns that fit are listed under, and so the day the
  // sheet's title names: one assignment, read from the days (round 6: the
  // title said "Fort Worth fits in day 2" over a list that put Fort Worth
  // under Day 3 by its position along the road).
  const townsDayNumber = townsDay(days).index + 1;
  // Each day's places strongest first, not road order: the diamonds on the
  // map already say where, and a person scanning ten rows wants the best
  // ten. A name listed twice in the day is listed once (round 4: the Buddy
  // Holly Center three times in Day 1, twice from the store under two
  // spellings and once under Lubbock): the stronger row stays, and a place
  // already under one of the day's towns is left to that town. The
  // diamonds and the card are the day's whole list still.
  const roadsideByDay = useMemo(
    () =>
      days.map((d) => {
        const townIds = new Set(d.towns.map((t) => t.id));
        if (d.endStopId) townIds.add(d.endStopId);
        const underTowns = sheetFetch.waypoints.filter((w) => townIds.has(w.cityId)).map((w) => w.name);
        // "Best match" is the chosen moods through rankFor, which with
        // nothing chosen is the general score the list always used, so the
        // sheet at rest is ordered exactly as it was before U6. "Along the
        // road" is the order they come up while driving. Both fall back to
        // the same tie-breaks, so the order is total either way and never
        // depends on what the database happened to return.
        return uniqueByName(orderRoadside(d.roadside, chosenMoods, sortMode), underTowns);
      }),
    [days, sheetFetch.waypoints, chosenMoods, sortMode]
  );
  // A day's towns that fit (the next day's, all of them), the stops among
  // them left out: a stop is drawn as its day's end, never twice.
  const cityIdsByDay = useMemo(
    () => days.map((d) => new Set(d.towns.filter((t) => !addedCityIds.has(t.id)).map((t) => t.id))),
    [days, addedCityIds]
  );
  // The day on the map, and the camera request that put it there. A new
  // key on every tap is a new fit; the stops changing closes the open day
  // and asks for nothing, so a recompute never moves the camera.
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [mapFit, setMapFit] = useState<MapFit | null>(null);
  const fitSeqRef = useRef(0);
  const daySectionRefs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    setOpenDay(null);
  }, [tripStops]);
  // The road as drawn, for a day's frame: the route through the stops,
  // cut at them. The direct road above places the towns and the roadside
  // stops (the road they were measured on); this one is what the person
  // sees, and a day's stretch is a stretch of it.
  const liveRoad = useMemo(() => buildRoad(liveRoutePoints), [liveRoutePoints]);
  // The whole trip as drawn: the route through the stops, and the ends and
  // stops themselves in case the line is missing.
  const tripBounds = useMemo(
    () => boundsOf([...liveRoutePoints, origin, destination, ...tripStops]),
    [liveRoutePoints, origin, destination, tripStops]
  );
  const handleDayTap = useCallback(
    (index: number) => {
      const day = days[index];
      if (!day) return;
      if (openDay === index) {
        setOpenDay(null);
        if (tripBounds) setMapFit({ key: `trip-${++fitSeqRef.current}`, bounds: tripBounds });
        return;
      }
      // The day's stretch of the drawn road: its stretch between
      // overnights, cut at the day's shares of it by time (a day cut where
      // the budget runs out ends part way along the stretch).
      const leg = day.legIndex;
      const from = leg === 0 ? origin : tripStops[leg - 1];
      const to = leg < tripStops.length ? tripStops[leg] : destination;
      const legStartKm = leg === 0 ? 0 : alongRoadKm(liveRoad, from);
      const legEndKm = leg < tripStops.length ? alongRoadKm(liveRoad, to) : liveRoad.lengthKm;
      const startKm = legStartKm + (legEndKm - legStartKm) * day.legFractionStart;
      const endKm = legStartKm + (legEndKm - legStartKm) * day.legFractionEnd;
      const ends = [
        day.legFractionStart === 0 ? from : pointAlong(liveRoad, startKm),
        day.legFractionEnd === 1 ? to : pointAlong(liveRoad, endKm),
      ].filter((p): p is google.maps.LatLngLiteral => p !== null);
      const b = dayBounds(liveRoad, { startKm, endKm }, ends);
      setOpenDay(index);
      if (b) setMapFit({ key: `day-${index}-${++fitSeqRef.current}`, bounds: b });
      // A fully open sheet covers the map; it drops to rest so the strip
      // shows the day. A peeked sheet stays: the map is already there.
      setSheetSnap((s) => (s === 2 ? 1 : s));
      // The sheet shows the day too: its heading to the top of the box,
      // so the strip and the box together say where the day goes and
      // what fits in it (round 2: the second day sat below the fold).
      daySectionRefs.current[index]?.scrollIntoView({ block: "start" });
    },
    [days, openDay, tripBounds, liveRoad, origin, destination, tripStops]
  );
  // The towns the map draws at full strength while a day is open: that
  // day's towns and its two ends; every other town fades, dot and name
  // together, and nothing moves (round 3; rule 6). Null with no day open,
  // and the map draws every town as it is.
  const focusCandidateIds = useMemo<ReadonlySet<string> | null>(() => {
    if (openDay === null || !cityIdsByDay[openDay] || !days[openDay]) return null;
    const leg = days[openDay].legIndex;
    return new Set([
      ...cityIdsByDay[openDay],
      // The day's two ends that are stops: the one its stretch starts
      // from (stops[leg - 1], when the stretch is not the first; a
      // stretch is leg 0 from the start, leg i after stop i - 1) and the
      // one it ends at (stops[leg], when the stretch is not the last).
      // They are in the focus because a stop's town can still have its
      // candidate dot on the map: `liveCandidateMarkers` is the last set
      // a refresh answered with, so while the refresh past a new stop is
      // in flight or has failed the town is still drawn as a candidate,
      // and `cityIdsByDay` leaves stops out (a stop is drawn as its day's
      // end, never twice). Without them a framed day's own start or end
      // would fade as another day's town, dot and name. The slice is one
      // leg's neighbours: `leg - 1` clamped at 0 for the first stretch,
      // `leg + 1` past the last stop is empty. The stop's square (effect
      // 3 in RouteMap.tsx) is never faded; this is for its town's dot.
      ...tripStops.slice(Math.max(0, leg - 1), leg + 1).map((s) => s.cityId),
    ]);
  }, [openDay, cityIdsByDay, days, tripStops]);

  // Merged neighborhood data: recompute-fetched + on-demand local fetches.
  const effectiveNeighborhoods = useMemo(
    () => ({ ...effectiveWaypointFetch.neighborhoods, ...localNeighborhoods }),
    [effectiveWaypointFetch.neighborhoods, localNeighborhoods]
  );

  // The town whose "What's in" answer is open: a stop, or a town that
  // fits being read about before it is added (step 13). From the live
  // towns, so a town a refresh brought in answers too.
  const panelCity = useMemo(
    () => panelCityFor(panelCityId, tripStops, liveCandidateMarkers),
    [panelCityId, tripStops, liveCandidateMarkers]
  );
  const panelCityName = panelCity?.cityName ?? null;

  const panelCityWaypoints = useMemo(
    () => (panelCityId ? sheetFetch.waypoints.filter((w) => w.cityId === panelCityId) : []),
    [sheetFetch.waypoints, panelCityId]
  );

  // ── Persona / hover handlers ───────────────────────────────────────────
  /**
   * Take the server's moods when *they* change (Gauntlet U6; council round
   * 2 on #94).
   *
   * `chosenMoods` starts from `initialMoods` and is the user's from then
   * on, because a tap writes the URL with `history.replaceState` and never
   * re-runs the Server Component — that is the invariant that stops a chip
   * re-billing the Routes API. The cost of it is that a render which
   * *does* bring different moods from the server, such as the browser's
   * back or forward landing on a URL with another set, would otherwise
   * leave the chips showing the old ones.
   *
   * Watching the joined string rather than the array means this fires only
   * when the server actually sends something different. A tap cannot
   * trigger it: a tap changes the URL, not the props.
   */
  useEffect(() => {
    setChosenMoods(parseMoods(initialMoodKey));
  }, [initialMoodKey]);

  /**
   * Whether a tap has changed the moods yet.
   *
   * The effect below writes the URL and speaks; neither should happen on
   * the first render, when the moods came from the server and the URL
   * already says so. A ref and not state: nothing renders differently
   * because of it.
   */
  const moodsTappedRef = useRef(false);

  const handleMoodToggle = useCallback((mood: MoodId) => {
    // A functional update, so two taps in one tick cannot both read the
    // same `chosenMoods` and the second silently undo the first; and
    // nothing but the state change happens in here, because an updater
    // must be pure — React runs it twice in Strict Mode and may discard a
    // render and re-run it. The URL and the announcement are the effect's,
    // which is the one place that sees the value React settled on.
    // Council rounds 1 and 6 on #94, from opposite directions.
    moodsTappedRef.current = true;
    setChosenMoods((curr) => toggleMood(curr, mood));
  }, []);

  useEffect(() => {
    if (!moodsTappedRef.current) return;
    setListAnnouncement(
      chosenMoods.length === 0
        ? "No mood chosen. The places are back in their usual order."
        : `In the mood for ${chosenMoods.map((m) => MOOD_CONFIG[m].label.toLowerCase()).join(" and ")}. The places are reordered.`
    );
    if (typeof window === "undefined") return;
    // history.replaceState, never router.replace: /plan is force-dynamic
    // and a route change re-invokes the Server Component, which re-bills
    // the Routes API (architecture invariant).
    const url = new URL(window.location.href);
    if (chosenMoods.length === 0) url.searchParams.delete(MOODS_PARAM);
    else url.searchParams.set(MOODS_PARAM, chosenMoods.join(","));
    window.history.replaceState(null, "", url.toString());
  }, [chosenMoods]);

  // ── Trip add/remove ────────────────────────────────────────────────────
  const handleAddCity = useCallback((city: AddCityPayload) => {
    const stop = { cityId: city.cityId, cityName: city.cityName, lat: city.lat, lng: city.lng };
    setTripStops((curr) => {
      if (curr.length >= MAX_TRIP_STOPS) return curr;
      if (curr.some((s) => s.cityId === city.cityId)) return curr;
      return [...curr, stop];
    });
    // Keep the town and its places from the set it is leaving: the next
    // refresh counts from this stop and lists it no more, and its day
    // still ends here. Nothing opens by itself; "What's in" is a tap.
    setStopTowns((prev) => (prev[city.cityId] ? prev : { ...prev, [city.cityId]: stopTownFrom(effectiveWaypointFetch, stop) }));
  }, [effectiveWaypointFetch]);

  /**
   * Put a roadside place in the trip, or take it out again (Gauntlet U7).
   *
   * A roadside place becomes a stop like any other, keyed by its own id in
   * the field called `cityId`. That field's name is wrong for these
   * values and its type cannot say so — noted in the branch's plan as this
   * unit's weakest part. Nothing downstream breaks: `stopTownFrom` already
   * falls back to a town built from the stop's own name and coordinates
   * with no places in it, which is the truth about a lookout.
   */
  const handleToggleRoadsideStop = useCallback(
    (place: RoadsideMarker) => {
      setTripStops((curr) => {
        if (curr.some((s) => s.cityId === place.id)) return curr.filter((s) => s.cityId !== place.id);
        // `MAX_TRIP_STOPS` (defined at the top of this file) is the
        // Routes API's waypoint ceiling, not a taste: a request past it is
        // refused, and the server refuses first too — `actions.ts` returns
        // `too_many_stops` before it spends anything. `SavedTripStopSchema`
        // in `src/lib/trips/types.ts` caps its `stops` array at the same
        // number so a saved trip cannot carry one that will not replan.
        if (curr.length >= MAX_TRIP_STOPS) return curr;
        return [...curr, { cityId: place.id, cityName: place.name, lat: place.lat, lng: place.lng }];
      });
    },
    []
  );

  const handleRemoveCity = useCallback((cityId: string) => {
    setTripStops((curr) => curr.filter((s) => s.cityId !== cityId));
    setStopTowns((prev) => {
      if (!prev[cityId]) return prev;
      const rest = { ...prev };
      delete rest[cityId];
      return rest;
    });
    setFailedStopId((curr) => (curr === cityId ? null : curr));
  }, []);

  const handleStopClick = useCallback((cityId: string) => {
    // A tap on a town whose read failed (a rate limit from tapping through
    // the list quickly, a blip) is a retry: the failure is forgotten so
    // the effect fetches again, and the answer stays open. Otherwise the
    // tap opens the answer under the town, or closes an open one.
    if (localNeighborhoods[cityId]?.kind === "failed") {
      setLocalNeighborhoods((prev) => {
        const rest = { ...prev };
        delete rest[cityId];
        return rest;
      });
      setPanelCityId(cityId);
      return;
    }
    setPanelCityId((curr) => (curr === cityId ? null : cityId));
  }, [localNeighborhoods]);

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
  // pattern (Council ISC-S6-ARCH-3, S7-ARCH-2).
  //
  // Rapid taps (council round 3 on #87, item 3). Two recomputes can be in
  // flight: "Stop here" is off while one runs (`pending` in
  // RecommendationList), but "Take this stop out" is not, and a tap on a
  // town's dot on the map adds it whatever the buttons say; so a second
  // change to the stops can dispatch before the first answer lands, and
  // the older answer can land last. Every change takes a number from the
  // sequence, and an answer is applied only when its number is still the
  // latest, both state updates together. The reset with no stops left
  // takes a number too: Council S7-ARCH-5 had gated the increment behind
  // the early return "so empty resets don't burn IDs", and so "Stop here"
  // then "Take this stop out" before the route returned let the answer
  // for the trip through that stop land on the empty trip (its route
  // drawn, its leg counted, the towns counted from it). The rule is
  // src/lib/plan/recompute-sequence.ts, tested there; this effect only
  // calls it, once per change and once per answer.
  useEffect(() => {
    const ask = nextRecompute(recomputeSeqRef.current, tripStops.length);
    if (ask.kind === "reset") {
      if (liveRoute !== null) setLiveRoute(null);
      if (liveWaypointFetch !== null) setLiveWaypointFetch(null);
      if (recomputeError !== null) setRecomputeError(null);
      if (recommendationsDegraded) setRecommendationsDegraded(false);
      if (failedStopId !== null) setFailedStopId(null);
      setTripState(buildTripState([], totalBudgetMins, initialDurationSeconds / 60));
      return;
    }

    const myId = ask.id;
    const stopsForRequest = tripStops.map((s) => ({
      cityId: s.cityId,
      lat: s.lat,
      lng: s.lng,
    }));
    // Only when the last stop is an atlas city. A roadside place can be a
    // stop now (Gauntlet U7) and its id is an OSM one with colons in it,
    // which `recomputeAndRefreshAction` refuses — it would have thrown the
    // whole recompute away as invalid input and left the drive times
    // stale, which is exactly what the first build of U7 did. The value
    // means "the city whose places to load", and a lookout has none.
    const lastStop = stopsForRequest[stopsForRequest.length - 1];
    const lastStopCityId = isCityId(lastStop?.cityId) ? lastStop.cityId : undefined;
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
      if (!isCurrentRecompute(recomputeSeqRef.current, myId)) return;

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
            count === 1 ? "1 town fits now." : `${count} towns fit now.`
          );
        } else {
          // Degraded — keep the prior liveWaypointFetch (Council S7-ARCH-2).
          setRecommendationsDegraded(true);
        }
        if (result.dateDerivation?.status === "ok") {
          setEffectiveStartDate(result.dateDerivation.date);
          setStartDateDerivationFailed(false);
          setStartDateAnnouncement(`The start date is now ${result.dateDerivation.date}`);
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

  // A town that leaves both lists has no row to answer under: the panel
  // closes (see nextPanelCityId). It stays on a stop or a town that fits.
  useEffect(() => {
    setPanelCityId((curr) => nextPanelCityId(curr, tripStops, liveCandidateMarkers));
  }, [tripStops, liveCandidateMarkers]);

  // Whether the panel's city already has data. A boolean on purpose: the
  // merged neighborhoods object is rebuilt whenever any city's result lands,
  // and depending on it would cancel and restart the fetch in flight for the
  // panel's city every time another city's answer arrived.
  const panelHasData = panelCityId === null || effectiveNeighborhoods[panelCityId] !== undefined;

  // Fetch neighborhoods on demand when panelCityId changes and data is absent.
  //
  // The pulse under the town ("Loading what's in Lubbock…", in panelNode
  // below) shows while `effectiveNeighborhoods[panelCityId]` is absent,
  // and every way this fetch can settle stores a state under the town's
  // key, so the pulse ends with a sentence (council round 3 on #87, item
  // 2): a town with no parts listed answers `{ kind: "empty" }` and reads
  // "Everything in Lubbock."; parts read but none kept answers
  // `{ kind: "loaded", data: [] }` and reads "No parts of town listed for
  // Lubbock; here is everything."; a refused or failed read answers
  // `ok: false` and is stored as `{ kind: "failed" }`, "Couldn't load the
  // parts of town; here are the places."; a rejected promise, or a
  // malformed answer that throws inside `then` (null has no `.ok`), lands
  // in `catch` and is stored as failed under the id asked for. The action
  // never answers null by its type (NeighborhoodsActionResult), and its
  // `cityId` is the id sent (CityIdSchema is a regex, no transform). Each
  // sentence is rendered in "ends the pulse with a sentence for each way
  // the parts can come back" in PlanWorkspace.days.ssr.test.tsx. What no
  // stored state can end is a promise that never settles; that is a
  // transport failure, and the town's row can be tapped again once the
  // page has moved on.
  //
  // Rapid taps (item 3): one fetch per town in flight at a time, since the
  // effect runs only while the town's key is absent and the cleanup marks
  // the older fetch `cancelled` when the panel moves to another town or
  // closes, so no older answer is applied; and an answer is stored under
  // its own town's key, so an answer for Post could never stand for
  // Snyder even if it did land. No sequence counter is needed here.
  useEffect(() => {
    if (!panelCityId) return;
    if (panelHasData) return;

    // City name for aria announcements, from the trip or the candidates.
    const cityName = panelCityName ?? panelCityId;

    let cancelled = false;
    setPanelAnnouncement(`Loading what's in ${cityName}`);
    fetchNeighborhoodsAction(panelCityId)
      .then((result) => {
        if (cancelled) return;
        setLocalNeighborhoods((prev) => ({
          ...prev,
          [result.cityId]: result.ok ? result.loadState : { kind: "failed" },
        }));
        setPanelAnnouncement(
          result.ok ? `Showing what's in ${cityName}` : `Couldn't load what's in ${cityName}`
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLocalNeighborhoods((prev) => ({
          ...prev,
          [panelCityId]: { kind: "failed" },
        }));
        setPanelAnnouncement(`Couldn't load what's in ${cityName}`);
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
  }, [tripStops, moodKey]);

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
      moods: [...chosenMoods],
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
  }, [fromName, toName, origin, destination, budgetHours, effectiveStartDate, endDate, chosenMoods, tripStops]);

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
  const atCap = tripCount >= MAX_TRIP_STOPS;

  // The answer to "What's in Lubbock": the town's parts and places, or
  // that they are loading, drawn under the town's row in its day.
  const panelNode =
    panelCityId && panelCity ? (
      <div className="px-2 pb-2">
        {effectiveNeighborhoods[panelCityId] == null ? (
          <div className="border border-[#30363d] bg-[#0d1117] px-3 py-3">
            <p className="text-base text-[#8b949e] motion-safe:animate-pulse break-words">
              Loading what&apos;s in {panelCity.cityName}…
            </p>
          </div>
        ) : (
          <NeighborhoodPanel
            cityId={panelCityId}
            cityName={panelCity.cityName}
            loadState={effectiveNeighborhoods[panelCityId]}
            waypoints={panelCityWaypoints}
            failures={effectiveWaypointFetch.status === "degraded" ? effectiveWaypointFetch.failures : []}
            persona={moodProfile}
            moodKey={moodKey}
          />
        )}
      </div>
    ) : null;
  const panelDetail = panelNode && panelCityId ? { cityId: panelCityId, node: panelNode } : null;

  // The sheet's title: a sentence built from the data, "Lubbock and
  // Abilene fit today" or "Nothing fits today; drive on to Austin", and
  // after a stop where it counts from. Never a count or a minutes figure
  // as a label (quality bar, rule 1; Gauntlet U2). After a stop the towns
  // are counted from that stop, so the sentence names the day they are
  // listed under, "Fort Worth fits in day 2" (U3, round 3: "fits today
  // after Lubbock" stood over a list that put Fort Worth in day 2). It
  // sits on the handle row, above everything and at every snap (round 2:
  // the critic saw the sheet open on the roadside heading and no
  // sentence). The day is the one the towns are listed under, read from
  // the days themselves (round 6: the title and the sections had two
  // rules, and Fort Worth was "in day 2" in the title and under Day 3 on
  // the sheet). When the towns
  // could not be read the title says that instead, since "nothing fits"
  // would be false. `liveWaypointFetch` is null until a refresh returns a
  // set, and a refresh whose town read failed leaves it as it was (the
  // action answers waypointFetch: null, which is never stored) and shows
  // "Couldn't update the places" instead; so once a refresh has replaced
  // the failed page fetch the title is the sentence again, and a later
  // failure keeps the last set on the sheet rather than saying the towns
  // never loaded.
  const townsFailed = initialCandidateFetchFailed && liveWaypointFetch === null;
  const sheetTitle = townsFailed
    ? "Couldn't load the towns along the road"
    : fitsTodayLine(effectiveWaypointFetch.cities.map((c) => c.name), toName, townsDayNumber);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Screen-reader live regions */}
      <div aria-live="polite" className="sr-only">{panelAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{candidatePoolAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{sheetAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{saveAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{listAnnouncement}</div>
      <div aria-live="polite" className="sr-only">{startDateAnnouncement}</div>

      {/* Side panel / mobile bottom sheet */}
      <aside
        ref={sheetRef}
        style={{ "--sheet-y": `${SHEET_SNAPS[sheetSnap]}%` } as React.CSSProperties}
        className="plan-sheet md:static md:w-[360px] md:z-auto border-t md:border-t-0 md:border-r border-[#30363d] bg-[#0d1117] flex flex-col min-h-0"
      >
        {/* The visible part of the sheet: the handle row and the scroll box
            as a column, so the box is whatever the handle leaves. */}
        <div className="plan-sheet-visible">
          {/* The handle row, and the sheet's title on it: the sentence built
              from the towns ("Lubbock and Abilene fit today"), the first
              thing seen at every snap and the side panel's title on a wide
              screen. On a phone the whole row is the drag zone, and the
              grab handle is a 44 px button laid over it (the pill at its
              top) for a keyboard and a screen reader; the title is its
              sibling, not its child, so a reader reaches the sentence and
              its updates. One line is 44 px, SHEET_HANDLE_PX less the
              sheet's border; two lines shorten the scroll box instead. */}
          <div
            className="relative flex flex-col items-center justify-center min-h-[44px] px-3 pt-3 pb-1 touch-none md:touch-auto md:pt-2 md:pb-2 md:border-b md:border-[#30363d]"
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            onTouchCancel={handleSheetTouchCancel}
          >
            <div
              className="absolute inset-0 flex justify-center pt-1.5 cursor-grab active:cursor-grabbing md:hidden focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
              role="button"
              tabIndex={0}
              aria-label={`Panel ${SNAP_LABELS[sheetSnap]}. Tap to ${sheetSnap < 2 ? "expand" : "collapse"}.`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") cycleSnap(); }}
            >
              <div className="w-8 h-1 rounded-full bg-[#6e7681]" aria-hidden />
            </div>
            <p aria-live="polite" data-fits-today className="font-sans text-base leading-5 text-center text-[#f0f6fc] break-words">
              {sheetTitle}
            </p>
          </div>

        <div className="plan-sheet-scroll flex-1 overflow-y-auto p-2 space-y-2">
          {/* On a phone the box is the visible part of the sheet only
              (`.plan-sheet-scroll`): its height follows the snap, so the
              last row and the Save button can be scrolled to at every snap
              (Gauntlet U1, round 4: as `flex-1` alone it was the whole
              92 dvh sheet, and at rest the bottom 350 px of it were below
              the screen's edge and out of reach). The header (the mood
              chips, the numbers) scrolls with the content rather than
              staying pinned under the handle (round 2). At rest nothing
              moves. */}
          {/* The trip's numbers and the mood first, then the days (Gauntlet
              U3): each day's towns and roadside places sit under that day's
              heading, so the roadside list U1 put first now lives inside
              its day. Every button here keeps the 44 px target. */}
          <div className="px-1 pt-1 pb-3 border-b border-[#30363d] space-y-3 font-sans">
            {/* The one mood component (Gauntlet U5): its label, its chips, its
                two rows. Only the tap is the sheet's. */}
            <MoodChips chosen={chosenMoods} onToggle={handleMoodToggle} />
            {/* Two sentences, not three labelled stats: the glossary's
                replacement for "budget left (as a stat)" is "4 h of driving
                left today" (quality bar, rule 1). */}
            {/* Every figure in the mono face and every word in the body
                face (rule 2; round 2 of U3: "7 h 45 min" set whole in mono
                came out wide-spaced inside the sentence). */}
            <div className="text-base leading-snug space-y-1">
              <p className="text-[#f0f6fc]">
                <Figures text={`${totalDistanceText} · ${onTheRoadText} on the road`} />
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
                <Figures text={drivingLeftText} />
              </p>
              {/* Arrival mode's deadline as a sentence (Gauntlet U3), here
                  and not on the masthead: at 49 characters it wraps the
                  masthead to three lines on a 390 px phone, which takes
                  the strip of map above the sheet that the fit at rest
                  frames the road in (PLAN_HEADER_PX in RouteMap.tsx). The
                  count is from the person's own day (sheetToday). */}
              {dateMode === "arrival" && endDate && sheetToday && (
                <p data-arrival className="text-[#f0f6fc]">
                  <Figures text={arrivalSentence({ toName, endDate, today: sheetToday })} />
                </p>
              )}
              {/* The trip's shape after a stop, where the eye lands (round
                  2: the phone showed Day 1's heading and nothing that said
                  the trip was now two days; round 3 answered with a row
                  per day that repeated each heading, and round 4's critic
                  asked for one telling of each day). One sentence, the
                  count and the nights: "Three days, with a night in
                  Lubbock". Where each day ends and what fits in it is its
                  own heading and section below. */}
              {tripShape && (
                <p data-trip-shape className="text-[#f0f6fc]">
                  <Figures text={tripShape} />
                </p>
              )}
            </div>
            {/* Only while updating; idle it costs no height. */}
            {isPending && (
              <p
                className="text-base text-[#e3b341] animate-pulse"
                aria-live="polite"
              >
                Updating…
              </p>
            )}
          </div>

          {/* Recompute error banner with Retry */}
          {recomputeError && (
            <div className="px-3 py-2 border border-[#f85149] bg-[#161b22] flex items-start justify-between gap-2">
              <p className="text-base text-[#f85149] leading-snug">{recomputeError}</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={isPending}
                className="min-h-[44px] text-base border border-[#f85149] text-[#f85149] px-3 hover:bg-[#f85149] hover:text-[#0d1117] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Try again
              </button>
            </div>
          )}

          {/* Recommendation refresh failed — keep prior recs visible
              (Council ISC-S7-ARCH-2 / S7-PROD-1). */}
          {recommendationsDegraded && (
            <div className="px-3 py-2 border border-[#d29922] bg-[#161b22]">
              <p className="text-base text-[#d29922] leading-snug">
                Couldn&apos;t update the places; showing the last ones.
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
              <p className={`text-base leading-snug ${
                tripState.status.kind === "over_budget"
                  ? "text-[#f85149]"
                  : "text-[#d29922]"
              }`}>
                <Figures
                  text={
                    tripState.status.kind === "over_budget"
                      ? `${formatDurationPlain(tripState.status.overageMinutes * 60)} more driving than fits ${daySpan}.`
                      : `Tight: ${formatDurationPlain(tripState.status.directMinutesToDestination * 60)} straight on to ${toName}, with ${formatDurationPlain(tripState.status.remainingBudgetMinutes * 60)} of driving left.`
                  }
                />
              </p>
            </div>
          )}

          {/* Arrival mode: warn when departure date could not be re-derived after recompute. */}
          {startDateDerivationFailed && (
            <div
              role="alert"
              className="px-3 py-2 border border-[#d29922] bg-[#161b22]"
            >
              <p className="text-base text-[#d29922]">
                The start date couldn&apos;t be updated; showing the last one.
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
              <p className={`text-base leading-snug break-words ${
                deadlinePressure.daysLate >= 1 ? "text-[#f85149]" : "text-[#d29922]"
              }`}>
                {/* daysRemaining ≤ 0: deadline already passed, pivot to direct-drive message. */}
                <Figures
                  text={
                    deadlinePressure.daysRemaining <= 0
                      ? `No days left, and ${formatDurationPlain(tripState.directMinutesToDestination * 60)} of driving still to reach ${toName}.`
                      : `Won't make ${toName} on time: that takes ${formatDurationPlain(deadlinePressure.requiredMinutesPerDay * 60)} a day for ${Math.ceil(deadlinePressure.daysRemaining)} day${Math.ceil(deadlinePressure.daysRemaining) === 1 ? "" : "s"}, ${formatDurationPlain((deadlinePressure.requiredMinutesPerDay - deadlinePressure.budgetMinutesPerDay) * 60)} a day more than planned.`
                  }
                />
              </p>
            </div>
          )}

          {/* An error is not an empty answer: the title already says the
              towns could not be read; this says what is still true and
              what to do. The sentence over the towns is the sheet's title
              on the handle row, above. */}
          {townsFailed && (
            <div className="px-3 py-2 border border-[#f85149] bg-[#161b22]" role="alert">
              <p className="text-base text-[#f85149] leading-snug">
                The route is still here. Reload to try the towns again.
              </p>
            </div>
          )}

          {/* The notes over the towns, once above the days rather than
              once per day: why every "Stop here" is off, that some places
              did not load, or that nothing is written up yet. */}
          <RecommendationNotices fetchResult={effectiveWaypointFetch} moodProfile={moodProfile} moodKey={moodKey} atCap={atCap} />

          {/* The trip told as days (Gauntlet U3; quality bar, rule 5): a
              heading per day, a sentence with its figures in the mono face
              ("Day 1 · Amarillo to Lubbock · 3 h 20 min", and a day cut
              where the budget runs out named by where, "Day 2 · Lubbock to
              near Llano · 4 h", or in hours, "Day 2 · 4 h down the road
              from Lubbock"), then, on the day after the last stop, the
              towns that fit under their label ("Towns that fit in day 2")
              with their "Stop here" controls, the choices for where that
              day ends (round 6: one assignment, the title's day and the
              list's); on a day that ends at a stop, the stop's town with
              its places and "✓ Added" (round 2: a stop's town leaves the
              towns that fit, and its day still ends there); then that
              day's places worth pulling over for, strongest first, ten at
              a time, in the rows and the card U1 built. The heading is a
              44 px button and its second line says what a tap does: fit
              the map to that day's road, or back to the whole trip. The
              days are the trip: there is no itinerary above them. Council
              ISC-S7-PROD-2: the brief highlight on each successful refresh
              proves the towns actually updated. */}
          {/* How the places are ordered (Gauntlet U6, round 2). Directly
              above the days, because the days are the lists it orders; it
              was under the chips in round 1 and the critic read it as two
              more moods (rule 3).

              Once for the sheet rather than once per day, and that is a
              constraint rather than a preference: `ROADSIDE_LIST_PX` is
              the height of a day's list from its heading through "Show
              all", and the rest snap was sized so that whole block fits
              the scroll box once scrolled to, with one pixel to spare. A
              44 px control inside each day's list would cost that, which
              is a U1 decision and not this component's to spend.

              Hidden when no day has a place: a control that orders an
              empty list is the machinery rule 3 and rule 6 keep off the
              screen. The test "shows nothing and says nothing when no
              pulled corridor is near the route" is what caught it, and
              its name is the rule. Its label also avoids the heading's
              own words, since two tests find that phrase by position. */}
          {roadsideByDay.some((d) => d.length > 0) && (
            <SortControl
              mode={sortMode}
              onChange={(next) => {
                setSortMode(next);
                setListAnnouncement(`The places are ordered ${SORT_LABELS[next]}.`);
              }}
              label="Order the day's places"
            />
          )}

          <div
            className={
              highlightRefresh
                ? "transition-shadow duration-700 shadow-[0_0_0_1px_rgba(210,153,34,0.6)]"
                : "transition-shadow duration-700"
            }
          >
            {days.map((day) => {
              const n = day.index + 1;
              const open = openDay === day.index;
              const dayRoadside = roadsideByDay[day.index];
              const showAll = showAllDays.includes(day.index);
              const shown = showAll ? dayRoadside : dayRoadside.slice(0, ROADSIDE_SHOWN_FIRST);
              // The card opens in the day whose road the place is on, listed or not.
              const cardHere = selectedRoadside !== null && day.roadside.some((s) => s.id === selectedRoadside.id);
              // The stop the day ends at, when it ends at one; a cut day
              // ends where the budget runs out, and the last day at the
              // destination, neither a town on the sheet.
              const endStop = day.endStopId ? tripStops.find((s) => s.cityId === day.endStopId) ?? null : null;
              const townIds = cityIdsByDay[day.index];
              const heading = dayHeadings[day.index];
              const townProps = {
                moodProfile,
                moodKey,
                highlightedCityId,
                onCityHover: setHighlightedCityId,
                cityCoords,
                addedCityIds,
                onAddCity: handleAddCity,
                onRemoveCity: handleRemoveCity,
                pending: isPending,
                atCap,
                onCityPreview: handleStopClick,
                previewedCityId: panelCityId,
                notices: false,
                detail: panelDetail,
              };
              return (
                <section
                  key={day.index}
                  ref={(el) => {
                    daySectionRefs.current[day.index] = el;
                  }}
                  data-day={n}
                  aria-labelledby={`day-${n}-heading`}
                  className="font-sans border-t border-[#30363d] pt-1 pb-2 scroll-mt-2"
                >
                  <h2 id={`day-${n}-heading`} className="text-base leading-6">
                    <button
                      type="button"
                      onClick={() => handleDayTap(day.index)}
                      aria-pressed={open}
                      className="w-full min-h-[44px] text-left px-2 py-1 hover:bg-[#161b22] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
                    >
                      <span data-day-line className="block text-[#f0f6fc] break-words">
                        <Figures text={heading} />
                      </span>
                      <span className="block text-[#8b949e]">{open ? "See the whole trip" : "See it on the map"}</span>
                    </button>
                  </h2>
                  {/* A stop whose recompute failed: said on its day, in a
                      sentence; the banner above has "Try again". */}
                  {endStop && failedStopId === endStop.cityId && (
                    <p role="status" className="text-base text-[#f85149] px-2 pb-1">
                      The route didn&apos;t update for {endStop.cityName}; the drive shown is the old one.
                    </p>
                  )}
                  {/* The towns that fit, under what they are, on the day
                      they are the choices for; then the day's end: the
                      stop's town with its places and "✓ Added", from the
                      set it was added from, since the towns that fit have
                      moved on past it. A day holds one or the other: the
                      towns are the day after the last stop's, and that
                      day ends at no stop. */}
                  {day.holdsTowns && townIds.size > 0 && (
                    <h2 data-towns-heading className="text-base leading-6 text-[#8b949e] px-2">{townsFitHeading(n)}</h2>
                  )}
                  <RecommendationList {...townProps} fetchResult={sheetFetch} cityIds={townIds} />
                  {endStop && (
                    <RecommendationList {...townProps} fetchResult={sheetFetch} cityIds={new Set([endStop.cityId])} keepEmpty />
                  )}
                  {townIds.size === 0 && !endStop && dayRoadside.length === 0 && (
                    <p className="text-base text-[#8b949e] px-2 py-2">Nothing listed along this stretch.</p>
                  )}
                  {/* Roadside stops (step 22, first-class in Gauntlet U1): what
                      the model says is worth pulling over for on this day's
                      road, from a corridor pulled and scored ahead of time.
                      Open, strongest first, ten at a time; the card for the
                      tapped one sits at the top of its day's list, and the
                      sheet scrolls to it. */}
                  {/* The section stands when the day has rows, or when the
                      tapped diamond is on this day's road though its row
                      was left to its town (round 5): the card answers the
                      tap either way. */}
                  {(dayRoadside.length > 0 || cardHere) && (
                    <section
                      data-roadside
                      aria-labelledby={dayRoadside.length > 0 ? `roadside-heading-${n}` : undefined}
                      aria-label={dayRoadside.length > 0 ? undefined : "A place worth pulling over for"}
                      className="font-sans px-1 pt-0 pb-2"
                    >
                      {cardHere && (
                        <div ref={roadsideCardRef} className="scroll-mt-2 mb-2">
                          <RoadsideCard
                            stop={selectedRoadside}
                            anchor={roadsideAnchor(selectedRoadside, roadTowns)}
                            onClose={clearRoadside}
                            isAdded={addedCityIds.has(selectedRoadside.id)}
                            atCap={atCap}
                            onToggleStop={() => handleToggleRoadsideStop(selectedRoadside)}
                          />
                        </div>
                      )}
                      {/* The heading, ten rows and the control add up to
                          ROADSIDE_LIST_PX: nothing above the heading (24)
                          or between it and the rows, the rows two lines of
                          22 px with no vertical padding (44, the target),
                          4 px, then the control (44). */}
                      {dayRoadside.length > 0 && (
                      <>
                      <h2 id={`roadside-heading-${n}`} className="text-base leading-6 text-[#e3b341] px-2">
                        {dayRoadside.length === 1
                          ? "1 place worth pulling over for"
                          : `${dayRoadside.length} places worth pulling over for`}
                      </h2>
                      <ul>
                        {shown.map((s) => (
                          <li key={s.id} data-roadside-stop={s.id}>
                            <button
                              type="button"
                              onClick={() => handleRoadsideSelect(s.id)}
                              aria-expanded={selectedRoadsideId === s.id}
                              className={[
                                "w-full min-h-[44px] text-left px-2 py-0 border-l-2 focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                                selectedRoadsideId === s.id
                                  ? "border-[#e3b341] bg-[#161b22]"
                                  : "border-transparent hover:bg-[#161b22]",
                              ].join(" ")}
                            >
                              <span className="block text-base leading-snug text-[#f0f6fc] break-words">{s.name}</span>
                              {/* The card's own sentence, town included: three
                                  stops at the end read "at Austin", not three
                                  copies of the route's length (round-3 critic). */}
                              <span className="block text-base leading-snug text-[#8b949e]">
                                {ROADSIDE_KIND_WORDS[s.kind] ?? "place"} · {roadsideAlongText(s.alongKm, roadsideAnchor(s, roadTowns))}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      </>
                      )}
                      {dayRoadside.length > ROADSIDE_SHOWN_FIRST && (
                        <button
                          type="button"
                          data-roadside-show-all
                          onClick={() => setShowAllDays((curr) => (curr.includes(day.index) ? curr.filter((i) => i !== day.index) : [...curr, day.index]))}
                          aria-expanded={showAll}
                          className="mt-1 w-full min-h-[44px] text-base border border-[#30363d] text-[#f0f6fc] hover:border-[#6e7681] focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
                        >
                          {showAll ? "Show the ten strongest" : `Show all ${dayRoadside.length}`}
                        </button>
                      )}
                    </section>
                  )}
                </section>
              );
            })}
          </div>

          {/* Save trip, at the end of the list rather than in the sticky
              header, so the header is short and the reason leads. No
              auth gate: trips live in this browser. */}
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
                  "w-full min-h-[44px] text-base px-3 py-2 border transition-colors disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                  saveState === "saved"
                    ? "border-[#238636] text-[#3fb950]"
                    : saveState === "error"
                    ? "border-[#f85149] text-[#ff7b72]"
                    : "border-[#30363d] text-[#8b949e] hover:border-[#555] hover:text-[#f0f6fc]",
                ].join(" ")}
              >
                {saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed; try again" : "Save trip"}
              </button>
          </div>
        </div>
        </div>
      </aside>

      {/* Map. `z-0` makes the pane its own stacking context, so nothing
          Google draws inside it (its controls carry very high z-indexes)
          can paint over the sheet, which sits at z-10 on a phone. */}
      <main className="flex-1 relative z-0">
        <RouteMap
          origin={origin}
          destination={destination}
          originName={fromName}
          destinationName={toName}
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
          phoneSheetTopDvh={sheetTopDvh(sheetSnap === 2 ? 1 : sheetSnap)}
          fitTo={mapFit}
          focusCandidateIds={focusCandidateIds}
          pending={isPending}
        />
      </main>
    </div>
  );
}
