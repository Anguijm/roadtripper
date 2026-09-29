"use client";

// SEC-2: name.en and summary.en come from the Gemini enrichment pipeline —
// an untrusted source. All fields below are rendered as React children
// (plain text). The dangerouslySetInnerHTML prop is forbidden in this file;
// CI grep on council.yml enforces the ban on every PR.

import { useMemo } from "react";
import { localizedText } from "@/lib/urban-explorer/cityAtlas";
import type { NeighborhoodLite } from "@/lib/urban-explorer/types";
import { scoreNeighborhood } from "@/lib/routing/scoring";
import type { PersonaConfig } from "@/lib/personas/types";
import type {
  LiteWaypoint,
  NeighborhoodLoadState,
  WaypointFetchFailure,
} from "@/lib/routing/scoring";

/**
 * Switch to grouped layout when any neighborhood has at least this many stops.
 * 3 is the point where a flat list with inline chips becomes hard to scan and
 * a header-per-neighbourhood grouping gives clearer spatial structure.
 */
const GROUP_THRESHOLD = 3;

interface NeighborhoodPanelProps {
  cityId: string;
  cityName: string;
  loadState: NeighborhoodLoadState;
  waypoints: LiteWaypoint[];
  failures: WaypointFetchFailure[];
  /** The scoring profile the chosen moods make (U6), built by `waypointProfileForMoods`. */
  persona: PersonaConfig;
  /** The chosen moods as one string; the reorder line remounts on it. */
  moodKey: string;
}

/**
 * What is in a town: its places, grouped by part of town when there are
 * enough of them. The words on screen are the glossary's (quality bar,
 * rule 1): a part of town is called by its own name, never "neighborhood";
 * a place by its own name, never "waypoint"; and no name is cut with an
 * ellipsis (rule 2).
 */
export default function NeighborhoodPanel({
  cityId,
  cityName,
  loadState,
  waypoints,
  failures,
  persona,
  moodKey,
}: NeighborhoodPanelProps) {

  const hasNeighborhoodFailure =
    loadState.kind === "failed" ||
    failures.some((f) => f.kind === "neighborhoods" && f.cityId === cityId);

  const { sorted, byNeighborhoodId } = useMemo(() => {
    if (loadState.kind !== "loaded") {
      return {
        sorted: [] as NeighborhoodLite[],
        byNeighborhoodId: new Map<string | null, LiteWaypoint[]>(),
      };
    }
    const byId = new Map<string | null, LiteWaypoint[]>();
    for (const w of waypoints) {
      const key = w.neighborhoodId;
      const list = byId.get(key);
      if (list) list.push(w);
      else byId.set(key, [w]);
    }
    const sorted = [...loadState.data].sort((a, b) => {
      // Number() coerces strings; || 0 collapses NaN from non-numeric Firestore values.
      const sa = scoreNeighborhood(Number(a.trending_score ?? 0) || 0, byId.get(a.id) ?? [], persona);
      const sb = scoreNeighborhood(Number(b.trending_score ?? 0) || 0, byId.get(b.id) ?? [], persona);
      // Secondary sort on id ensures a stable order for equal scores across renders.
      if (sb !== sa) return sb - sa;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });
    return { sorted, byNeighborhoodId: byId };
  }, [loadState, waypoints, persona]);

  const useGroupedLayout = useMemo(
    () =>
      sorted.some(
        (n) => (byNeighborhoodId.get(n.id)?.length ?? 0) >= GROUP_THRESHOLD
      ),
    [sorted, byNeighborhoodId]
  );

  // Failed state — PROD-3
  if (hasNeighborhoodFailure) {
    return (
      <div className="border border-[#30363d] bg-[#0d1117] mt-2">
        <PanelHeader cityName={cityName} />
        <div className="px-3 py-3">
          <p className="text-base text-[#d29922] mb-2">
            Couldn&apos;t load the parts of town; here are the places.
          </p>
          <FlatWaypointList waypoints={waypoints} />
        </div>
      </div>
    );
  }

  // Empty state — PROD-2: no panel header, contextual copy instead
  if (loadState.kind === "empty") {
    return (
      <div className="border border-[#30363d] bg-[#0d1117] mt-2 px-3 py-3">
        <p className="text-base text-[#b0b9c2] mb-2">
          Everything in {cityName}.
        </p>
        <FlatWaypointList waypoints={waypoints} />
      </div>
    );
  }

  // Loaded — no neighborhood records returned (distinct from kind:"empty")
  if (sorted.length === 0) {
    return (
      <div className="border border-[#30363d] bg-[#0d1117] mt-2 px-3 py-3">
        <p className="text-base text-[#b0b9c2] mb-2">
          No parts of town listed for {cityName}; here is everything.
        </p>
        <FlatWaypointList waypoints={waypoints} />
      </div>
    );
  }

  // Loaded — grouped layout when ≥1 neighborhood has GROUP_THRESHOLD+ waypoints
  if (useGroupedLayout) {
    // Collect waypoints that have no neighborhood OR whose neighborhoodId doesn't
    // match any neighborhood returned by the server. Without this, those waypoints
    // would be silently dropped from the grouped view.
    const knownIds = new Set(sorted.map((nb) => nb.id));
    const ungrouped: LiteWaypoint[] = [];
    for (const [key, ws] of byNeighborhoodId.entries()) {
      if (key === null || !knownIds.has(key)) ungrouped.push(...ws);
    }
    return (
      <div className="border border-[#30363d] bg-[#0d1117] mt-2">
        {/* aria-live regions don't announce initial content — only changes.
            Keying the span on the chosen moods causes a remount on a mood switch,
            which is treated as a new insertion and announced. */}
        <div aria-live="polite" className="sr-only">
          <span key={moodKey}>{sorted.length > 0 ? "The parts of town are reordered for this mood." : ""}</span>
        </div>
        <PanelHeader cityName={cityName} />
        <div className="divide-y divide-[#30363d]">
          {sorted.map((nb) => {
            const nbWaypoints = byNeighborhoodId.get(nb.id) ?? [];
            if (nbWaypoints.length === 0) return null;
            return (
              <NeighborhoodGroup
                key={nb.id}
                neighborhood={nb}
                waypoints={nbWaypoints}
              />
            );
          })}
          {ungrouped.length > 0 && (
            <div className="px-3 py-2">
              <p className="text-base text-[#8b949e] mb-1">
                Elsewhere in town
              </p>
              <FlatWaypointList waypoints={ungrouped} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loaded — flat list with neighborhood chip per item (below threshold)
  return (
    <div className="border border-[#30363d] bg-[#0d1117] mt-2">
      <div aria-live="polite" className="sr-only">
        <span key={moodKey}>{sorted.length > 0 ? "The parts of town are reordered for this mood." : ""}</span>
      </div>
      <PanelHeader cityName={cityName} />
      <div className="divide-y divide-[#30363d]">
        {waypoints.map((w) => {
          const nb = sorted.find((n) => n.id === w.neighborhoodId);
          return (
            <div key={w.id} className="px-3 py-2 flex items-center gap-2">
              <span className="text-base text-[#f0f6fc] break-words min-w-0 flex-1">
                {w.name}
              </span>
              {nb && (
                <span className="text-base text-[#8b949e] shrink-0 border border-[#30363d] px-1">
                  {localizedText(nb.name)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PanelHeader({ cityName }: { cityName: string }) {
  return (
    <div className="px-3 py-2 border-b border-[#30363d]">
      <p className="text-base text-[#b0b9c2] break-words">
        What&apos;s in {cityName}
      </p>
    </div>
  );
}

function NeighborhoodGroup({
  neighborhood,
  waypoints,
}: {
  neighborhood: NeighborhoodLite;
  waypoints: LiteWaypoint[];
}) {
  return (
    <div className="px-3 py-2">
      <p className="text-base text-[#b0b9c2] mb-1 break-words">
        {localizedText(neighborhood.name)}
      </p>
      {neighborhood.summary && (
        <p className="text-base text-[#8b949e] mb-1 leading-relaxed break-words">
          {localizedText(neighborhood.summary)}
        </p>
      )}
      <ul className="space-y-0.5">
        {waypoints.map((w) => (
          <li
            key={w.id}
            className="text-base text-[#f0f6fc] break-words pl-2 border-l border-[#30363d]"
          >
            {w.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlatWaypointList({ waypoints }: { waypoints: LiteWaypoint[] }) {
  if (waypoints.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {waypoints.map((w) => (
        <li key={w.id} className="text-base text-[#f0f6fc] break-words">
          {w.name}
        </li>
      ))}
    </ul>
  );
}
