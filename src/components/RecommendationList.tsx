"use client";

import { useMemo } from "react";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId, RankedWaypoint } from "@/lib/personas/types";
import { buildRankedGroups, type WaypointFetchResult } from "@/lib/routing/scoring";
import { formatDrive } from "@/lib/today/presets";
import { kindWord } from "@/lib/plan/words";

export interface AddCityPayload {
  cityId: string;
  cityName: string;
  lat: number;
  lng: number;
}

interface RecommendationListProps {
  fetchResult: WaypointFetchResult;
  activePersonaId: PersonaId;
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
}

/**
 * The notes a list of towns carries, in one place so the sheet can say them
 * once above its days (quality bar, rule 3: why every "Stop here" is off is
 * said once, beside them, not once per day and not in a tooltip). Nothing
 * when there are no towns at all: the sheet's title already says so.
 */
export function RecommendationNotices({ fetchResult, activePersonaId, atCap = false }: Pick<RecommendationListProps, "fetchResult" | "activePersonaId" | "atCap">) {
  const groups = useMemo(() => buildRankedGroups(fetchResult, activePersonaId), [fetchResult, activePersonaId]);
  if (fetchResult.cities.length === 0) return null;
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
const TIER_LABELS: Record<RankedWaypoint["tier"], string | null> = {
  primary: "★ The pick",
  secondary: "Also good",
  other: null,
};

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
  fetchResult,
  activePersonaId,
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
}: RecommendationListProps) {
  const persona = PERSONAS[activePersonaId];
  const accent = persona.accentColor;

  const groups = useMemo(() => {
    const all = buildRankedGroups(fetchResult, activePersonaId);
    return cityIds ? all.filter((g) => cityIds.has(g.cityId)) : all;
  }, [fetchResult, activePersonaId, cityIds]);

  const hasRows = groups.some((g) => g.rows.length > 0);

  // Both kinds of result carry cities. A page whose town read failed
  // passes an empty "fresh" set and tells the workspace, which says the
  // failure as the sheet's title; an empty set draws nothing here.
  if (fetchResult.cities.length === 0) {
    return null;
  }

  // Nothing to show: the note, unless the caller says the notes itself
  // (a day's slice of the towns says nothing; the sheet does, once).
  if (!hasRows) {
    return notices ? <RecommendationNotices fetchResult={fetchResult} activePersonaId={activePersonaId} atCap={atCap} /> : null;
  }

  return (
    <div className="flex flex-col">
      {/* Why every "Stop here" is off, said once beside them rather than
          in a tooltip (quality bar, rule 3). */}
      {notices && <RecommendationNotices fetchResult={fetchResult} activePersonaId={activePersonaId} atCap={atCap} />}

      {groups.map((group) => {
        const { cityId, cityName, rows, detourMinutes } = group;
        if (rows.length === 0) return null;
        const isHighlighted = cityId === highlightedCityId;
        const isAdded = addedCityIds.has(cityId);
        const coords = cityCoords.get(cityId);
        const canAdd = !isAdded && !pending && !atCap && Boolean(coords);
        const lead = rows.find((r) => r.description) ?? rows[0];
        const rest = lead ? rows.filter((r) => r.waypointId !== lead.waypointId) : rows;

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
          <section key={cityId} className="mb-3">
            <h3
              className={[
                // 44 px tall so the buttons' extended hit areas (see below)
                // stay inside the header and never reach the rows beneath.
                "sticky top-0 z-10 min-h-[44px] text-base px-2 py-1.5 border-b flex items-center justify-between gap-2",
                isHighlighted
                  ? "bg-[#262c36] text-[#f0f6fc] border-[#6e7681]"
                  : "bg-[#161b22] text-[#b0b9c2] border-[#30363d]",
              ].join(" ")}
            >
              {/* The town's name wraps; the drive to it is a phrase, said
                  once here and not under every row, with the number in the
                  mono face. detourMinutes is the round trip, so half of it
                  is the drive there, the same figure the today screen
                  shows. */}
              <span className="min-w-0 flex-1 break-words">
                {cityName}
                <span className="ml-2 text-[#8b949e] whitespace-nowrap">
                  <span className="num">{formatDrive(detourMinutes / 2)}</span> away
                </span>
              </span>
              {/* Read about the town before deciding. Opens the panel for a
                  town the same way a tap on a stop does; nothing is added. */}
              {onCityPreview && (
                <button
                  type="button"
                  onClick={() => onCityPreview(cityId)}
                  aria-pressed={previewedCityId === cityId}
                  className={[
                    // The visible button is 30 px tall (24 px line, 2 px
                    // padding each side, 1 px border each side). The
                    // invisible ::before adds 7 px above and below, which
                    // is 44 px, the touch-target minimum. It extends
                    // vertically only, so the two side-by-side buttons
                    // cannot overlap each other, and the header is 44 px
                    // tall with the buttons centred, so it cannot reach the
                    // rows beneath either.
                    "relative before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']",
                    // The glossary's words ("what's in Lubbock"); a long
                    // town name wraps inside the button rather than
                    // pushing past the sheet's edge.
                    "text-base border px-2 py-0.5 text-left transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
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
                  // Same 44 px hit area as the button beside it, so
                  // neither is the hard one to hit on a phone.
                  "relative before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-['']",
                  "text-base border px-2 py-0.5 whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none",
                  isAdded
                    ? "border-transparent bg-[#3fb950] text-[#0d1117] hover:bg-[#46c356]"
                    : canAdd
                    ? "border-[#30363d] text-[#b0b9c2] hover:border-[#6e7681] hover:text-[#f0f6fc]"
                    : "border-[#21262d] text-[#6e7681] cursor-not-allowed",
                ].join(" ")}
                style={
                  isAdded ? { backgroundColor: accent, color: "#0d1117" } : undefined
                }
              >
                {isAdded ? "✓ Added" : "+ Stop here"}
              </button>
            </h3>
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
                  {TIER_LABELS[r.tier] && (
                    <span
                      className={[
                        "text-base px-1.5 py-0.5 border whitespace-nowrap self-start",
                        r.tier === "primary"
                          ? "text-[#0d1117] border-transparent"
                          : "text-[#b0b9c2] border-[#30363d]",
                      ].join(" ")}
                      style={
                        r.tier === "primary"
                          ? { backgroundColor: accent }
                          : undefined
                      }
                    >
                      {TIER_LABELS[r.tier]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
