"use client";

// SEC-2: name.en and summary.en come from the Gemini enrichment pipeline —
// an untrusted source. All fields below are rendered as React children
// (plain text). The dangerouslySetInnerHTML prop is forbidden in this file;
// CI grep on council.yml enforces the ban on every PR.

import { useMemo, useEffect, useRef, useState } from "react";
import { localizedText } from "@/lib/urban-explorer/cityAtlas";
import type { NeighborhoodLite } from "@/lib/urban-explorer/types";
import { scoreNeighborhood } from "@/lib/routing/scoring";
import { getPersona } from "@/lib/personas";
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
  personaId: string | null;
}

export default function NeighborhoodPanel({
  cityId,
  cityName,
  loadState,
  waypoints,
  failures,
  personaId,
}: NeighborhoodPanelProps) {
  // getPersona always returns a valid config — it falls back to the default
  // persona for any null / unrecognised id, so no crash path exists here.
  const persona = useMemo(() => getPersona(personaId), [personaId]);

  const [sortAnnouncement, setSortAnnouncement] = useState("");
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
      const sa = scoreNeighborhood(a.trending_score ?? 0, byId.get(a.id) ?? [], persona);
      const sb = scoreNeighborhood(b.trending_score ?? 0, byId.get(b.id) ?? [], persona);
      return sb - sa;
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

  // Announce sort order changes to screen readers only when persona changes,
  // not on every waypoint load that happens to re-sort the list.
  const initialMountRef = useRef(true);
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    setSortAnnouncement("Neighborhood list reordered for selected travel style.");
  }, [personaId]);

  // Failed state — PROD-3
  if (hasNeighborhoodFailure) {
    return (
      <div className="border border-[#30363d] bg-[#0d1117] mt-2">
        <PanelHeader cityName={cityName} />
        <div className="px-3 py-3">
          <p className="text-xs text-[#d29922] mb-2">
            Couldn&apos;t load neighborhoods — showing stops directly.
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
        <p className="text-xs text-[#b0b9c2] mb-2">
          Showing all stops in {cityName}.
        </p>
        <FlatWaypointList waypoints={waypoints} />
      </div>
    );
  }

  // Loaded — grouped layout when ≥1 neighborhood has GROUP_THRESHOLD+ waypoints
  if (useGroupedLayout) {
    const ungrouped = byNeighborhoodId.get(null) ?? [];
    return (
      <div className="border border-[#30363d] bg-[#0d1117] mt-2">
        <div aria-live="polite" className="sr-only">{sortAnnouncement}</div>
        <PanelHeader cityName={cityName} label="Neighborhoods" />
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
              <p className="text-[10px] font-mono uppercase tracking-widest text-[#7d8590] mb-1">
                Other stops
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
      <div aria-live="polite" className="sr-only">{sortAnnouncement}</div>
      <PanelHeader cityName={cityName} label="Stops" />
      <div className="divide-y divide-[#30363d]">
        {waypoints.map((w) => {
          const nb = sorted.find((n) => n.id === w.neighborhoodId);
          return (
            <div key={w.id} className="px-3 py-2 flex items-center gap-2">
              <span className="text-sm text-[#f0f6fc] truncate flex-1">
                {w.name}
              </span>
              {nb && (
                <span className="text-[10px] font-mono text-[#7d8590] shrink-0 border border-[#30363d] px-1">
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

function PanelHeader({
  cityName,
  label,
}: {
  cityName: string;
  label?: string;
}) {
  return (
    <div className="px-3 py-2 border-b border-[#30363d]">
      <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
        {cityName}
        {label && ` · ${label}`}
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
      <p className="text-[10px] font-mono uppercase tracking-widest text-[#b0b9c2] mb-1">
        {localizedText(neighborhood.name)}
      </p>
      {neighborhood.summary && (
        <p className="text-[10px] text-[#7d8590] mb-1 leading-relaxed">
          {localizedText(neighborhood.summary)}
        </p>
      )}
      <ul className="space-y-0.5">
        {waypoints.map((w) => (
          <li
            key={w.id}
            className="text-xs text-[#f0f6fc] truncate pl-2 border-l border-[#30363d]"
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
        <li key={w.id} className="text-xs text-[#f0f6fc] truncate">
          {w.name}
        </li>
      ))}
    </ul>
  );
}
