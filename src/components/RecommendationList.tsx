"use client";

import React, { useMemo, useState, type ReactNode } from "react";
import type { PersonaConfig, RankedWaypoint } from "@/lib/personas/types";
import { buildRankedGroupsWith, type WaypointFetchResult } from "@/lib/routing/scoring";
import { formatDrive } from "@/lib/today/presets";
import { abroadLabel, kindWord } from "@/lib/plan/words";
import Figures from "@/components/Figures";
// In a plain module so server code (the car endpoint) can call it: a
// function exported from a "use client" file reaches the server as a
// client reference, not as the function.
import { rowBadges, type RowBadge } from "@/lib/plan/badges";
export { rowBadges, type RowBadge };

export interface AddCityPayload {
  cityId: string;
  cityName: string;
  lat: number;
  lng: number;
}

interface RecommendationListProps {
  fetchResult: WaypointFetchResult;
  /** Said before the first town out of the way (U30): why the trip is offered it. */
  detourNote?: string | null;
  /**
   * The town whose Stop here is filled, the screen's one obvious action
   * (U31); every other town's is an accent outline. Undefined: every
   * town's is filled, as on a list that stands alone.
   */
  primaryCityId?: string | null;
  /** Said under the primary town's name: why its Stop here is the filled one (U33). */
  primaryNote?: string | null;
  /**
   * Where a town's drive is counted from (U40): "39 min from Kansas City",
   * the place the day that holds the towns starts. Null says "away".
   */
  drivesFrom?: string | null;
  /**
   * The scoring profile the chosen moods make (U6), not an id: a mood's
   * profile is built by `waypointProfileForMoods`, and two moods do not
   * have one id between them.
   */
  moodProfile: PersonaConfig;
  /** The chosen moods as one string, for the remount that announces a reorder. */
  moodKey: string;
  highlightedCityId?: string | null;
  onCityHover?: (cityId: string | null) => void;
  /** Map of cityId → {lat,lng} so the Add button can build a TripStop */
  cityCoords: Map<string, { lat: number; lng: number }>;
  /** Set of cityIds already in the trip — flips button to "Added" */
  addedCityIds: ReadonlySet<string>;
  /** Add the city to the trip */
  onAddCity: (city: AddCityPayload) => void;
  /** Remove the city from the trip (used by the "Added" button) */
  onRemoveCity: (cityId: string) => void;
  /** Disable Add/Remove while a recompute is pending */
  pending?: boolean;
  /** Disable Add when the trip is at the cap */
  atCap?: boolean;
  /** Open the city's write-up without adding it. */
  onCityPreview?: (cityId: string) => void;
  /** The city whose write-up is open, so its button reads as pressed. */
  previewedCityId?: string | null;
  /**
   * Only these towns (Gauntlet U3: the sheet draws one list per day). With
   * a set, a list whose towns have nothing to show draws nothing at all,
   * since another day's list may; without one, every town.
   */
  cityIds?: ReadonlySet<string>;
  /**
   * The notes above the rows (why "Stop here" is off, that some places did
   * not load, that nothing is written up yet). Off when the workspace says
   * them once above the days rather than once per day.
   */
  notices?: boolean;
  /**
   * Draw a town's row even when it has no place written up (Gauntlet U3,
   * round 2): a stop is its day's end and has a row whatever the atlas
   * holds for it; the row then says nothing is written up. Off, a town
   * with no rows draws nothing, as the towns that fit always did.
   */
  keepEmpty?: boolean;
  /**
   * What to draw under one town's rows: the answer to "What's in Lubbock",
   * which sits under Lubbock, not above the days. Drawn only when that
   * town is in this list, so the workspace can hand it to every list.
   */
  detail?: { cityId: string; node: ReactNode } | null;
  /**
   * Each town's distance along the road, in km (U50): with it, the towns
   * are listed in the order you pass them, a town out of the way still
   * last. Without it, `townOrder`'s order (stop town first, then detour).
   */
  roadKm?: ReadonlyMap<string, number>;
  /**
   * Each town a drawer, closed until tapped (U50, John 2026-11-10). The
   * header stays: name, drive, Stop here, What's in; a line under the
   * name says what is inside ("Stuhr Museum and 4 more").
   */
  drawers?: boolean;
  /**
   * The chosen moods that map onto town places, in words ("History",
   * "History or Food"), or null (U50). With a label, a place that is not
   * one of those moods' main kinds is hidden, a town left with none is
   * hidden, and one line says how many: "2 towns have nothing for History
   * today." Null when no mood is chosen, or only Machines or Sports, which
   * map to no town place (MOOD_WAYPOINTS) and so leave the towns whole.
   */
  moodFilter?: string | null;
  /** The country the trip starts in (U52); a town in another is labelled "in Canada". Null labels nothing. */
  homeCountry?: string | null;
}

/** Two towns' places along the road, for a sort: unknown last, two unknowns equal. */
export function byRoad(a: number | undefined, b: number | undefined): number {
  if (a === undefined || b === undefined) return Number(a === undefined) - Number(b === undefined);
  return a - b;
}

/** The line that counts the towns a mood left empty (U50). */
export function hiddenTownsLine(count: number, moods: string): string | null {
  if (count <= 0) return null;
  return count === 1 ? `1 town has nothing for ${moods} today.` : `${count} towns have nothing for ${moods} today.`;
}

/** What a closed town's drawer holds, said under its name (U50): "Stuhr Museum and 4 more". */
export function drawerSummary(rows: ReadonlyArray<{ name: string }>): string {
  if (rows.length === 0) return "Nothing written up yet";
  return rows.length === 1 ? rows[0].name : `${rows[0].name} and ${rows.length - 1} more`;
}

/**
 * The notes a list of towns carries, in one place so the sheet can say them
 * once above its days (quality bar, rule 3: why every "Stop here" is off is
 * said once, beside them, not once per day and not in a tooltip). Nothing
 * when there are no towns at all: the sheet's title already says so.
 */
export function RecommendationNotices({ fetchResult, moodProfile, atCap = false }: Pick<RecommendationListProps, "fetchResult" | "moodProfile" | "moodKey" | "atCap">) {
  const groups = useMemo(() => buildRankedGroupsWith(fetchResult, moodProfile), [fetchResult, moodProfile]);
  if (fetchResult.cities.length === 0) {
    // A degraded read that came back with no towns at all used to return
    // null, so a failure looked exactly like a route with nothing near it:
    // the screen said nothing and the person had no way to know a reload
    // would help. Same lesson as the missing `roadside_tag` table in #93 —
    // a silent empty is a worse failure than a loud one. A *fresh* read
    // with no towns is not a failure and still says nothing here; the
    // sheet's own day lines already tell that story.
    if (fetchResult.status !== "degraded") return null;
    return (
      <div className="px-3 py-2 border border-[#d29922] bg-[#161b22] mb-2">
        <p className="text-base text-[#d29922]">
          The towns along this road did not load. Reload to try again.
        </p>
      </div>
    );
  }
  if (!groups.some((g) => g.rows.length > 0)) {
    return (
      <div className="p-4 border border-[#30363d] bg-[#161b22]">
        <p className="text-base text-[#f0f6fc] mb-2">
          Nothing written up for these towns yet
        </p>
        <p className="text-base text-[#b0b9c2]">
          {fetchResult.status === "degraded"
            ? "Some of the places did not load. Reload to try again."
            : "The towns that fit today have no places written up yet."}
        </p>
      </div>
    );
  }
  return (
    <>
      {atCap && (
        <p className="text-base text-[#b0b9c2] px-2 pb-2" role="status">
          The trip has all the stops it can hold; take one out to add another.
        </p>
      )}
      {fetchResult.status === "degraded" && (
        <div className="px-3 py-2 border border-[#d29922] bg-[#161b22] mb-2">
          <p className="text-base text-[#d29922]">
            Some of the places did not load.
          </p>
        </div>
      )}
    </>
  );
}

/**
 * The badge on a row, in the glossary's words (quality bar, rule 1): "the
 * pick" for what was the "primary" tier, a plain phrase for the second
 * tier, and nothing at all for the rest; a badge that said "Other" was
 * noise beside a name.
 */
/** The sheet's scroll box padding (`p-2` on .plan-sheet-scroll in PlanWorkspace), which a pinned town header must cover above it (U32). */
export const STICKY_BAND_PX = 8;

const BADGE_LABELS: Record<Exclude<RowBadge, null>, string> = { pick: "★ The pick", good: "Also good" };

const TYPE_GLYPHS: Record<RankedWaypoint["type"], string> = {
  landmark: "◆",
  food: "▼",
  drink: "○",
  nature: "▲",
  culture: "●",
  shopping: "■",
  nightlife: "◉",
  viewpoint: "△",
  hidden_gem: "◇",
};

/**
 * The towns that fit today, each with the places in it the mood ranks
 * first. Every word in sentence case in the body face at 16 px; a town's
 * or a place's name wraps and is never cut with an ellipsis, and since
 * round 2 a description wraps whole too: the longest in the atlas is 234
 * characters, about five lines on a phone, and a painted ellipsis is a
 * cut (quality bar, rules 1 and 2). The sentence over the list ("Lubbock
 * and Abilene fit today", or that nothing does) is the sheet's title, so
 * an empty list says nothing here.
 */
export default function RecommendationList({
  drivesFrom = null,
  primaryNote = null,
  primaryCityId,
  detourNote = null,
  fetchResult,
  moodProfile,
  moodKey,
  highlightedCityId,
  onCityHover,
  cityCoords,
  addedCityIds,
  onAddCity,
  onRemoveCity,
  pending = false,
  atCap = false,
  onCityPreview,
  previewedCityId = null,
  cityIds,
  notices = true,
  keepEmpty = false,
  detail = null,
  roadKm,
  drawers = false,
  moodFilter = null,
  homeCountry = null,
}: RecommendationListProps) {
  const accent = moodProfile.accentColor;
  // Each town's drawer as last set by a tap (U50). A town never tapped is
  // closed, except while its write-up is showing (asked for from its map
  // marker, or from "What's in" inside it), so the answer is never drawn
  // inside a closed drawer (round 1). Derived rather than set from an
  // effect, so a tap after that still closes it.
  //
  // A tap remembers which town's write-up was showing when it was made: a
  // later request for this town's write-up (its marker tapped after the
  // drawer was closed by hand) opens it again (PR #162 council), while a
  // close made with the write-up already showing is kept.
  const [tapped, setTapped] = useState<ReadonlyMap<string, { open: boolean; during: string | null }>>(() => new Map());
  const townOpen = (id: string) => {
    const t = tapped.get(id);
    if (previewedCityId === id && t?.during !== id) return true;
    return t?.open ?? false;
  };
  const toggleTown = (id: string) => {
    const next = !townOpen(id);
    setTapped((curr) => new Map(curr).set(id, { open: next, during: previewedCityId ?? null }));
  };

  const { groups, hiddenTowns } = useMemo(() => {
    const all = buildRankedGroupsWith(fetchResult, moodProfile, primaryCityId ?? null);
    let shown = cityIds ? all.filter((g) => cityIds.has(g.cityId)) : all;
    // The order you pass them (U50); a town out of the way stays last, as
    // the detour note before it says (U30). Ties keep townOrder's order.
    if (roadKm) {
      shown = shown
        .map((g, i) => ({ g, i }))
        .sort(
          (a, b) =>
            Number(!!a.g.outOfTheWay) - Number(!!b.g.outOfTheWay) ||
            // A town with no place on the road goes after those with one;
            // two without keep their order (Infinity - Infinity is NaN,
            // which leaves a sort undefined: PR #162 council).
            byRoad(roadKm.get(a.g.cityId), roadKm.get(b.g.cityId)) ||
            a.i - b.i
        )
        .map(({ g }) => g);
    }
    // The chosen moods hide what is not one of their main kinds (U50). The
    // rows come tiered by the mood profile, and "primary" is exactly a
    // place whose kind is primary for a chosen mood (MOOD_WAYPOINTS).
    let hidden = 0;
    if (moodFilter) {
      shown = shown.map((g) => ({ ...g, rows: g.rows.filter((r) => r.tier === "primary") }));
      hidden = shown.filter((g) => g.rows.length === 0).length;
    }
    return { groups: shown, hiddenTowns: keepEmpty ? 0 : hidden };
  }, [fetchResult, moodProfile, cityIds, primaryCityId, roadKm, moodFilter, keepEmpty]);

  const hasRows = groups.some((g) => g.rows.length > 0);
  // The first town out of the way the list draws, where the note goes (U30).
  const firstDetourId = groups.find((g) => g.outOfTheWay && (g.rows.length > 0 || keepEmpty))?.cityId ?? null;

  // Both kinds of result carry cities. A page whose town read failed
  // passes an empty "fresh" set and tells the workspace, which says the
  // failure as the sheet's title; an empty set draws nothing here.
  if (fetchResult.cities.length === 0) {
    return null;
  }

  // Nothing to show: the note, unless the caller says the notes itself
  // (a day's slice of the towns says nothing; the sheet does, once), or
  // keeps a town's row without its places.
  const hiddenLine = moodFilter ? hiddenTownsLine(hiddenTowns, moodFilter) : null;
  if (!hasRows && !keepEmpty) {
    if (hiddenLine) return <p data-hidden-towns className="text-base text-[#8b949e] px-2 py-1">{hiddenLine}</p>;
    return notices ? <RecommendationNotices fetchResult={fetchResult} moodProfile={moodProfile} moodKey={moodKey} atCap={atCap} /> : null;
  }

  return (
    <div className="flex flex-col">
      {/* Why every "Stop here" is off, said once beside them rather than
          in a tooltip (quality bar, rule 3). */}
      {notices && <RecommendationNotices fetchResult={fetchResult} moodProfile={moodProfile} moodKey={moodKey} atCap={atCap} />}

      {groups.map((group) => {
        const { cityId, cityName, rows, detourMinutes, outOfTheWay } = group;
        if (rows.length === 0 && !keepEmpty) return null;
        const noteHere = detourNote && cityId === firstDetourId;
        const isHighlighted = cityId === highlightedCityId;
        const isAdded = addedCityIds.has(cityId);
        const coords = cityCoords.get(cityId);
        const canAdd = !isAdded && !pending && !atCap && Boolean(coords);
        // One filled Stop here on the screen (U31): the town the sheet names
        // as the natural night, or every town on a list that stands alone.
        const isPrimary = primaryCityId === undefined || cityId === primaryCityId;
        // The top-ranked place leads, described or not: "The pick" is first
        // (rule 4). U46: skipping to the first described place put the pick
        // second in the OSM-grounded towns.
        const lead = rows[0];
        const rest = lead ? rows.filter((r) => r.waypointId !== lead.waypointId) : rows;
        const badges = rowBadges(rows, !!outOfTheWay);
        // Across a border from the start (U52): said beside the name.
        const abroad = abroadLabel(fetchResult.cities.find((c) => c.id === cityId)?.country, homeCountry);
        const abroadTag = abroad ? (
          <span data-abroad className="ml-1 text-[#8b949e] whitespace-nowrap">· {abroad}</span>
        ) : null;
        // A drawer's places show once it is opened (U50).
        const isOpen = !drawers || townOpen(cityId);
        // One layout for every place, the lead included (U44: the lead ran
        // its reason flush under the glyph and had no kind line).
        const placeBody = (r: (typeof rows)[number]) => (
          <>
              <span
                aria-hidden
                className="text-base leading-6 shrink-0"
                style={{ color: accent }}
              >
                {TYPE_GLYPHS[r.type] ?? "·"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base text-[#f0f6fc] break-words">{r.name}</p>
                {/* The reason to stop. Untrusted text, rendered as text; React escapes it. It wraps whole, like the name. */}
                {r.description && (
                  <p className="text-base text-[#b0b9c2] mt-0.5" data-reason>{r.description}</p>
                )}
                <p className="text-base text-[#8b949e] mt-0.5">
                  {kindWord(r.type)}
                  {/* The badge on the kind line, not boxed at the row's
                      right (U42: five critics read the box as a button,
                      and it narrowed the description to a strip). */}
                  {(() => {
                    const badge = badges.get(r.waypointId);
                    return badge ? (
                      <>
                        {" · "}
                        <span
                          data-badge={badge}
                          className={badge === "pick" ? "font-medium whitespace-nowrap" : "whitespace-nowrap"}
                          style={badge === "pick" ? { color: accent } : undefined}
                        >
                          {BADGE_LABELS[badge]}
                        </span>
                      </>
                    ) : null;
                  })()}
                </p>
              </div>
          </>
        );

        const handleAddClick = () => {
          if (isAdded) {
            onRemoveCity(cityId);
            return;
          }
          if (!coords) return;
          onAddCity({
            cityId,
            cityName,
            lat: coords.lat,
            lng: coords.lng,
          });
        };

        return (
          <React.Fragment key={cityId}>
          {noteHere && (
            <p data-detour-note className="text-base text-[#b0b9c2] px-2 pt-1 pb-2">
              <Figures text={detourNote} />
            </p>
          )}
          <section data-town={cityId} className="mb-3">
            {/* The town's header: its name with the drive to it on one
                line that wraps, then its two buttons on a row of their
                own, each 44 px tall on the screen and sharing the width
                (Gauntlet U3, round 2: the drive ran under the buttons and
                the buttons were 30 px with an invisible hit area; rule 7
                is judged on the screenshot). Sticky so a town's name
                stays over its rows while they scroll. */}
            <div
              className={[
                // The sheet's scroll box has 8 px of padding (p-2), and the
                // pinned header sits 8 px below its edge; an 8 px band of the
                // header's own colour above it closes that strip, so no line
                // of the card above shows over it (Gauntlet U32).
                "sticky top-0 z-10 px-2 py-1.5 border-b",
                isHighlighted
                  ? "bg-[#262c36] text-[#f0f6fc] border-[#6e7681]"
                  : "bg-[#161b22] text-[#b0b9c2] border-[#30363d]",
              ].join(" ")}
              // Inline, not a Tailwind arbitrary shadow: that class was not
              // generated and the band silently did nothing (measured).
              // The band's own room above the header (U37): unpinned, the
              // band paints into this margin and over nothing; it clipped
              // "Towns that fit today" when it painted over the text above.
              style={{ boxShadow: `0 -${STICKY_BAND_PX}px 0 0 ${isHighlighted ? "#262c36" : "#161b22"}`, marginTop: STICKY_BAND_PX }}
            >
              {/* The drive is a phrase, said once here and not under every
                  row, with its figures in the mono face. detourMinutes is
                  the round trip, so half of it is the drive there, the
                  same figure the today screen shows; nothing when the
                  set never measured it. A stop's row says none: its day's
                  heading right above carries the drive the route measured,
                  and this figure was the town set's estimate of the same
                  drive (Gauntlet U3, round 3: "Lubbock · 1 h 40 min away"
                  under "Amarillo to Lubbock · 1 h 43 min"). */}
              <h3 className="text-base leading-6 break-words">
                {drawers ? (
                  <button
                    type="button"
                    data-town-toggle
                    onClick={() => toggleTown(cityId)}
                    aria-expanded={isOpen}
                    aria-controls={`town-places-${cityId}`}
                    className="w-full min-h-[44px] text-left focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
                  >
                    <span aria-hidden className="inline-block w-5 text-lg leading-6 text-[#f0f6fc]">{isOpen ? "▾" : "▸"}</span>
                    <span data-town-name className="font-medium text-[#f0f6fc]">{cityName}</span>
                    {/* Right after the name, as on /today, so it never wraps away from it (U52 critic). */}
                    {abroadTag}
                    {detourMinutes > 0 && !isAdded && (
                      <span className="ml-1 text-[#8b949e]">
                        · <Figures text={formatDrive(detourMinutes / 2)} /> {drivesFrom ? `from ${drivesFrom}` : "away"}
                      </span>
                    )}
                    {outOfTheWay && !isAdded && (
                      <span data-out-of-the-way className="ml-1 text-[#8b949e] whitespace-nowrap">· out of the way</span>
                    )}
                    {/* What the drawer holds, said while it is closed. */}
                    {!isOpen && (
                      <span data-drawer-summary className="block pl-5 text-[#b0b9c2]">
                        {/* In the sheet's link style, as the day's "See it on
                            the map" (U43): it reads as something to tap. */}
                        <span className="underline decoration-[#6e7681] underline-offset-4">{drawerSummary(rows)}</span>
                      </span>
                    )}
                  </button>
                ) : (
                <>
                {/* The card's title (U41): the name in the body white, the
                    rest of the line grey, so the eye finds the town first. */}
                <span data-town-name className="font-medium text-[#f0f6fc]">{cityName}</span>
                {abroadTag}
                {detourMinutes > 0 && !isAdded && (
                  <span className="ml-1 text-[#8b949e]">
                    · <Figures text={formatDrive(detourMinutes / 2)} /> {drivesFrom ? `from ${drivesFrom}` : "away"}
                  </span>
                )}
                {/* A town offered because the trip has a day to spare
                    (U21): said, so nobody takes it for one on the way. */}
                {outOfTheWay && !isAdded && (
                  <span data-out-of-the-way className="ml-1 text-[#8b949e] whitespace-nowrap">· out of the way</span>
                )}
                </>
                )}
              </h3>
              {primaryNote && cityId === primaryCityId && (
                <p data-primary-note className="text-base text-[#b0b9c2]">
                  <Figures text={primaryNote} />
                </p>
              )}
              <div className="mt-1 flex gap-2">
                {/* Read about the town before deciding. Opens the answer
                    under this row the same way a tap on a stop's square
                    does; nothing is added. The glossary's words ("what's
                    in Lubbock"); a long name wraps inside the button. */}
                {onCityPreview && !drawers && (
                  <button
                    type="button"
                    onClick={() => onCityPreview(cityId)}
                    aria-pressed={previewedCityId === cityId}
                    className={[
                      "flex-[2] min-w-0 min-h-[44px] text-base border px-2 py-1 text-left transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                      previewedCityId === cityId
                        ? "border-[#f0f6fc] text-[#f0f6fc]"
                        : "border-[#30363d] text-[#b0b9c2] hover:border-[#6e7681] hover:text-[#f0f6fc]",
                    ].join(" ")}
                  >
                    What&apos;s in {cityName}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddClick}
                  disabled={!isAdded && !canAdd}
                  title={
                    isAdded
                      ? "Take this stop out"
                      : atCap
                      ? "The trip has all the stops it can hold"
                      : "Stop here"
                  }
                  className={[
                    drawers ? "flex-1" : "flex-[3]",
                    "min-h-[44px] text-base border px-2 py-1 whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                    isAdded
                      ? "font-medium"
                      : canAdd
                      ? isPrimary
                        ? "font-semibold border-transparent hover:brightness-110"
                        : "font-medium hover:brightness-125"
                      : "border-[#21262d] text-[#6e7681] cursor-not-allowed",
                  ].join(" ")}
                  // The card's one obvious action (rule 3, Gauntlet U25):
                  // choosing where the day ends is the largest control and
                  // the only filled one, three parts of the row to "What's
                  // in"'s two (five critics: the two read alike; round 1's
                  // accent outline alone was not enough). Once added, the
                  // action is done and it steps back to an accent outline;
                  // disabled stays dim with its reason beside it.
                  style={
                    isAdded || (canAdd && !isPrimary)
                      ? { borderColor: accent, color: accent }
                      : canAdd
                      ? { backgroundColor: accent, color: "#0d1117" }
                      : undefined
                  }
                >
                  {isAdded ? "✓ Added" : "+ Stop here"}
                </button>
              </div>
            </div>
            {/* A stop's town with nothing written up keeps its row and
                says so, rather than standing as a bare name. */}
            <div id={`town-places-${cityId}`} hidden={!isOpen}>
            {rows.length === 0 && (
              <p className="text-base text-[#8b949e] px-2 py-2">Nothing written up for {cityName} yet.</p>
            )}
            {/* The lead: the mood's top-ranked spot, before anything else in
                the card. It is the answer to "why this town". Step 14 led
                with the first spot that had a description; U46 leads with
                the top one, described or not, so the pick is first. */}
            {lead && (
              <div
                data-lead
                onMouseEnter={() => onCityHover?.(cityId)}
                onMouseLeave={() => onCityHover?.(null)}
                className="flex items-start gap-2 px-2 pt-2 pb-1"
                style={{ borderLeft: `2px solid ${accent}` }}
              >
                {placeBody(lead)}
              </div>
            )}
            {rest.length > 0 && (
            <ul className="space-y-1 pt-1">
              {rest.map((r) => (
                <li
                  key={r.waypointId}
                  onMouseEnter={() => onCityHover?.(cityId)}
                  onMouseLeave={() => onCityHover?.(null)}
                  className="flex items-start gap-2 pl-2 pr-2 py-2 border border-transparent hover:border-[#30363d] bg-[#0d1117] cursor-pointer"
                  style={{ borderLeft: `2px solid ${accent}` }}
                >
                  {placeBody(r)}
                </li>
              ))}
            </ul>
            )}
            {/* In a drawer (U50), the town's write-up is asked for from
                inside it, after its places: the header keeps one way to
                open the town and one action, Stop here (round 1 critic:
                "What's in" beside the name read as a second way to open
                it, and led somewhere else). */}
            {drawers && onCityPreview && (
              <button
                type="button"
                data-whats-in
                onClick={() => onCityPreview(cityId)}
                aria-pressed={previewedCityId === cityId}
                className={[
                  "mt-1 w-full min-h-[44px] text-base border px-2 py-1 text-left transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                  previewedCityId === cityId
                    ? "border-[#f0f6fc] text-[#f0f6fc]"
                    : "border-[#30363d] text-[#b0b9c2] hover:border-[#6e7681] hover:text-[#f0f6fc]",
                ].join(" ")}
              >
                What&apos;s in {cityName}: its parts of town
              </button>
            )}
            {drawers && detail && detail.cityId === cityId && detail.node}
            </div>
            {/* The answer to "What's in Lubbock", under Lubbock. */}
            {!drawers && detail && detail.cityId === cityId && detail.node}
          </section>
          </React.Fragment>
        );
      })}
      {hiddenLine && <p data-hidden-towns className="text-base text-[#8b949e] px-2 py-1">{hiddenLine}</p>}
    </div>
  );
}
