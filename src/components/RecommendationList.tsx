"use client";

import { useMemo } from "react";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId, RankedWaypoint } from "@/lib/personas/types";
import { buildRankedGroups, type WaypointFetchResult } from "@/lib/routing/scoring";

interface RecommendationListProps {
  fetchResult: WaypointFetchResult;
  activePersonaId: PersonaId;
  highlightedCityId?: string | null;
  onCityHover?: (cityId: string | null) => void;
}

const TIER_LABELS: Record<RankedWaypoint["tier"], string> = {
  primary: "★ Primary",
  secondary: "Secondary",
  other: "Other",
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

export default function RecommendationList({
  fetchResult,
  activePersonaId,
  highlightedCityId,
  onCityHover,
}: RecommendationListProps) {
  const persona = PERSONAS[activePersonaId];
  const accent = persona.accentColor;

  const groups = useMemo(
    () => buildRankedGroups(fetchResult, activePersonaId),
    [fetchResult, activePersonaId]
  );

  const hasRows = groups.some((g) => g.rows.length > 0);

  if (fetchResult.cities.length === 0) {
    return (
      <div className="p-4 border border-[#30363d] bg-[#161b22]">
        <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] mb-2">
          No coverage
        </p>
        <p className="text-xs text-[#b0b9c2] leading-relaxed">
          Urban Explorer covers ~22 North American cities. Try an East Coast,
          West Coast, or Southwest corridor for richer recommendations.
        </p>
      </div>
    );
  }

  if (!hasRows) {
    return (
      <div className="p-4 border border-[#30363d] bg-[#161b22]">
        <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] mb-2">
          No waypoints yet
        </p>
        <p className="text-xs text-[#b0b9c2]">
          {fetchResult.degraded
            ? "Waypoint data is degraded — some chunks failed to load. Reload to retry."
            : "Candidate cities had no waypoint data in Urban Explorer. Try a different corridor."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {fetchResult.degraded && (
        <div className="px-3 py-2 border border-[#d29922] bg-[#161b22] mb-2">
          <p className="text-xs font-mono uppercase tracking-widest text-[#d29922]">
            Partial data — some waypoint chunks failed
          </p>
        </div>
      )}

      {groups.map((group) => {
        const { cityId, cityName, rows, detourMinutes } = group;
        if (rows.length === 0) return null;
        const isHighlighted = cityId === highlightedCityId;
        return (
          <section key={cityId} className="mb-3">
            <h3
              className={[
                "sticky top-0 z-10 text-xs font-mono uppercase tracking-widest px-2 py-1.5 border-b",
                isHighlighted
                  ? "bg-[#262c36] text-[#f0f6fc] border-[#6e7681]"
                  : "bg-[#161b22] text-[#7d8590] border-[#30363d]",
              ].join(" ")}
            >
              {cityName}
              <span className="ml-2 text-[#4a5159]">
                · +{Math.round(detourMinutes)}m detour
              </span>
            </h3>
            <ul className="space-y-1 pt-1">
              {rows.map((r) => (
                <li
                  key={r.waypointId}
                  onMouseEnter={() => onCityHover?.(cityId)}
                  onMouseLeave={() => onCityHover?.(null)}
                  className="flex items-start gap-2 pl-2 pr-2 py-2 border border-transparent hover:border-[#30363d] bg-[#0d1117] cursor-pointer"
                  style={{ borderLeft: `2px solid ${accent}` }}
                >
                  <span
                    aria-hidden
                    className="text-base leading-5 mt-0.5"
                    style={{ color: accent }}
                  >
                    {TYPE_GLYPHS[r.type] ?? "·"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f0f6fc] truncate">{r.name}</p>
                    <p className="text-xs text-[#7d8590] mt-0.5">
                      <span className="font-mono uppercase">{r.type.replace("_", " ")}</span>
                      <span className="mx-1">·</span>
                      <span>{cityName}</span>
                      <span className="mx-1">·</span>
                      <span className="font-mono">{Math.round(r.detourMinutes)}m</span>
                    </p>
                  </div>
                  <span
                    className={[
                      "text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 border whitespace-nowrap self-start mt-0.5",
                      r.tier === "primary"
                        ? "text-[#0d1117] border-transparent"
                        : r.tier === "secondary"
                        ? "text-[#b0b9c2] border-[#30363d]"
                        : "text-[#4a5159] border-[#21262d]",
                    ].join(" ")}
                    style={
                      r.tier === "primary"
                        ? { backgroundColor: accent }
                        : undefined
                    }
                  >
                    {TIER_LABELS[r.tier]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
