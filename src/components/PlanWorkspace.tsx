"use client";

import { useState, useCallback } from "react";
import RouteMap, { type CandidateMarker } from "@/components/RouteMap";
import PersonaSelector from "@/components/PersonaSelector";
import RecommendationList from "@/components/RecommendationList";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId } from "@/lib/personas/types";
import type { WaypointFetchResult } from "@/lib/routing/scoring";

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
  initialPersonaId: PersonaId;
  budgetHours: number;
  totalDistanceText: string;
  totalDurationText: string;
  totalDays: number;
  maxDetourMinutes: number;
}

export default function PlanWorkspace({
  origin,
  destination,
  encodedPolyline,
  bounds,
  candidateMarkers,
  waypointFetch,
  initialPersonaId,
  budgetHours,
  totalDistanceText,
  totalDurationText,
  totalDays,
  maxDetourMinutes,
}: PlanWorkspaceProps) {
  // Persona lives in CLIENT state — intentionally NOT in a URL param
  // routed via next/navigation. Using router.replace on a `force-dynamic`
  // page re-runs the Server Component which re-bills computeRoute.
  // URL sync is done via history.replaceState so the URL still reflects
  // the active persona for share/refresh without triggering navigation.
  const [activePersonaId, setActivePersonaId] = useState<PersonaId>(initialPersonaId);
  const [highlightedCityId, setHighlightedCityId] = useState<string | null>(null);

  const accent = PERSONAS[activePersonaId].accentColor;

  const handlePersonaChange = useCallback((next: PersonaId) => {
    setActivePersonaId(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("persona", next);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const handleMapClick = useCallback((cityId: string) => {
    setHighlightedCityId((curr) => (curr === cityId ? null : cityId));
  }, []);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Side panel */}
      <aside className="w-[360px] border-r border-[#30363d] bg-[#0d1117] flex flex-col min-h-0">
        <div className="p-3 border-b border-[#30363d] space-y-3">
          <PersonaSelector
            activePersonaId={activePersonaId}
            onChange={handlePersonaChange}
          />
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="font-mono uppercase tracking-widest text-[#7d8590]">
                Distance
              </p>
              <p className="text-[#f0f6fc] mt-0.5">{totalDistanceText}</p>
            </div>
            <div>
              <p className="font-mono uppercase tracking-widest text-[#7d8590]">
                Drive
              </p>
              <p className="text-[#f0f6fc] mt-0.5">{totalDurationText}</p>
            </div>
            <div>
              <p className="font-mono uppercase tracking-widest text-[#7d8590]">
                Days @ {budgetHours}h
              </p>
              <p className="text-[#f0f6fc] mt-0.5">{totalDays}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
              Candidates ({waypointFetch.cities.length}) · max {maxDetourMinutes}
              min detour
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <RecommendationList
            fetchResult={waypointFetch}
            activePersonaId={activePersonaId}
            highlightedCityId={highlightedCityId}
            onCityHover={setHighlightedCityId}
          />
        </div>
      </aside>

      {/* Map */}
      <main className="flex-1 relative">
        <RouteMap
          origin={origin}
          destination={destination}
          encodedPolyline={encodedPolyline}
          bounds={bounds}
          candidates={candidateMarkers}
          routeColor={accent}
          highlightedCandidateId={highlightedCityId}
          onCandidateClick={handleMapClick}
        />
      </main>
    </div>
  );
}
