"use client";

import React, { useMemo, type ReactNode } from "react";
import type { PersonaConfig, RankedWaypoint } from "@/lib/personas/types";
import { buildRankedGroupsWith, type WaypointFetchResult } from "@/lib/routing/scoring";
import { formatDrive } from "@/lib/today/presets";
import { kindWord } from "@/lib/plan/words";
import Figures from "@/components/Figures";

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
const BADGE_LABELS = { pick: "★ The pick", good: "Also good" } as const;
export type RowBadge = keyof typeof BADGE_LABELS | null;

/**
 * Each row's badge (Gauntlet U24). "The pick" is singular: one per town,
 * its highest-scoring primary-kind place (rows come ordered by score), and
 * none at all when that place is the town's lead, which is shown first
 * and needs no badge to say so. Every other primary-kind place, and every
 * secondary-kind one, is "Also good"; the rest say nothing. A town out of
 * the way (U21) has no pick, so its best does not read as recommending
 * the detour over the towns on the way. Pure: keyed by waypoint id.
 */
export function rowBadges(
  rows: ReadonlyArray<Pick<RankedWaypoint, "waypointId" | "tier">>,
  leadId: string | null,
  outOfTheWay: boolean
): Map<string, RowBadge> {
  const out = new Map<string, RowBadge>();
  const pickId = outOfTheWay ? null : rows.find((r) => r.tier === "primary")?.waypointId ?? null;
  for (const r of rows) {
    if (r.waypointId === pickId) out.set(r.waypointId, r.waypointId === leadId ? null : "pick");
    else out.set(r.waypointId, r.tier === "other" ? null : "good");
  }
  return out;
}

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
}: RecommendationListProps) {
  const accent = moodProfile.accentColor;

  const groups = useMemo(() => {
    const all = buildRankedGroupsWith(fetchResult, moodProfile);
    return cityIds ? all.filter((g) => cityIds.has(g.cityId)) : all;
  }, [fetchResult, moodProfile, cityIds]);

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
  if (!hasRows && !keepEmpty) {
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
        const lead = rows.find((r) => r.description) ?? rows[0];
        const rest = lead ? rows.filter((r) => r.waypointId !== lead.waypointId) : rows;
        const badges = rowBadges(rows, lead?.waypointId ?? null, !!outOfTheWay);

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
                "sticky top-0 z-10 px-2 py-1.5 border-b",
                isHighlighted
                  ? "bg-[#262c36] text-[#f0f6fc] border-[#6e7681]"
                  : "bg-[#161b22] text-[#b0b9c2] border-[#30363d]",
              ].join(" ")}
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
                {cityName}
                {detourMinutes > 0 && !isAdded && (
                  <span className="ml-2 text-[#8b949e]">
                    · <Figures text={formatDrive(detourMinutes / 2)} /> away
                  </span>
                )}
                {/* A town offered because the trip has a day to spare
                    (U21): said, so nobody takes it for one on the way. */}
                {outOfTheWay && !isAdded && (
                  <span data-out-of-the-way className="ml-2 text-[#8b949e] whitespace-nowrap">· out of the way</span>
                )}
              </h3>
              <div className="mt-1 flex gap-2">
                {/* Read about the town before deciding. Opens the answer
                    under this row the same way a tap on a stop's square
                    does; nothing is added. The glossary's words ("what's
                    in Lubbock"); a long name wraps inside the button. */}
                {onCityPreview && (
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
                    "flex-[3] min-h-[44px] text-base border px-2 py-1 whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
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
            {rows.length === 0 && (
              <p className="text-base text-[#8b949e] px-2 py-2">Nothing written up for {cityName} yet.</p>
            )}
            {/* The reason leads (step 14): the mood's top-ranked spot that
                has a description, name and description, before anything else
                in the card. It is the answer to "why this town" and must be
                the first thing seen. Every atlas place has a description
                today (asserted in the atlas tests), so in practice this is the
                top-ranked spot; the fallback to a spot without one only
                matters if that ever changes. */}
            {lead && (
              <div
                data-lead
                onMouseEnter={() => onCityHover?.(cityId)}
                onMouseLeave={() => onCityHover?.(null)}
                className="px-2 pt-2 pb-1"
                style={{ borderLeft: `2px solid ${accent}` }}
              >
                <p className="text-base text-[#f0f6fc] break-words">
                  <span aria-hidden className="mr-1.5" style={{ color: accent }}>{TYPE_GLYPHS[lead.type] ?? "·"}</span>
                  {lead.name}
                </p>
                {lead.description && (
                  <p className="text-base text-[#b0b9c2] mt-1" data-reason>{lead.description}</p>
                )}
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
                    </p>
                  </div>
                  {(() => {
                    const badge = badges.get(r.waypointId);
                    return badge ? (
                      <span
                        data-badge={badge}
                        className={[
                          "text-base px-1.5 py-0.5 border whitespace-nowrap self-start",
                          badge === "pick" ? "text-[#0d1117] border-transparent" : "text-[#b0b9c2] border-[#30363d]",
                        ].join(" ")}
                        style={badge === "pick" ? { backgroundColor: accent } : undefined}
                      >
                        {BADGE_LABELS[badge]}
                      </span>
                    ) : null;
                  })()}
                </li>
              ))}
            </ul>
            )}
            {/* The answer to "What's in Lubbock", under Lubbock. */}
            {detail && detail.cityId === cityId && detail.node}
          </section>
          </React.Fragment>
        );
      })}
    </div>
  );
}
