"use client";

import type { TripStopMarker } from "@/components/RouteMap";

export interface ItineraryProps {
  fromName: string;
  toName: string;
  stops: TripStopMarker[];
  failedStopId?: string | null;
  selectedCityId?: string | null;
  pending?: boolean;
  onRemoveStop: (cityId: string) => void;
  onStopClick?: (cityId: string) => void;
  accent: string;
}

/**
 * Ordered list of the user's trip:  Start → Stop 1 → Stop 2 → … → End.
 *
 * Council ISC anchors:
 *   PROD-2  rendered ABOVE recommendations whenever stops.length > 0
 *   PROD-3  failed stops surface a warning indicator (failedStopIds set)
 *   PROD-4  Remove buttons disabled while pending
 */
export default function Itinerary({
  fromName,
  toName,
  stops,
  failedStopId,
  selectedCityId,
  pending = false,
  onRemoveStop,
  onStopClick,
  accent,
}: ItineraryProps) {
  if (stops.length === 0) {
    return (
      <div className="p-3 border border-dashed border-[#30363d] bg-[#0d1117]">
        <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] mb-1">
          Trip
        </p>
        <p className="text-xs text-[#b0b9c2] leading-relaxed">
          Pick stops from the list to build your trip.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[#30363d] bg-[#0d1117]">
      <div className="px-3 py-2 border-b border-[#30363d] flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
          Trip · {stops.length} stop{stops.length === 1 ? "" : "s"}
        </p>
        {pending && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#d29922]">
            Updating…
          </span>
        )}
      </div>
      <ol className="divide-y divide-[#30363d]">
        <li className="px-3 py-2 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono"
            style={{ color: "#3fb950" }}
          >
            ●
          </span>
          <span className="text-sm text-[#f0f6fc] truncate flex-1">
            {fromName}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#4a5159]">
            Start
          </span>
        </li>

        {stops.map((stop, index) => {
          const failed = failedStopId === stop.cityId;
          const selected = selectedCityId === stop.cityId;
          return (
            <li
              key={stop.cityId}
              className={`px-3 py-2 flex items-center gap-2 ${onStopClick ? "cursor-pointer" : ""} ${selected ? "bg-[#161b22]" : "hover:bg-[#0d1117]"}`}
              style={{ borderLeft: `2px solid ${failed ? "#f85149" : selected ? "#f0f6fc" : accent}` }}
              onClick={onStopClick ? () => onStopClick(stop.cityId) : undefined}
            >
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold"
                style={{
                  backgroundColor: failed ? "#f85149" : accent,
                  color: "#0d1117",
                }}
              >
                {index + 1}
              </span>
              <span className="text-sm text-[#f0f6fc] truncate flex-1">
                {stop.cityName}
                {failed && (
                  <span
                    className="ml-2 text-[10px] font-mono uppercase tracking-widest text-[#f85149]"
                    title="Last route update failed for this stop"
                  >
                    ⚠ failed
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveStop(stop.cityId);
                }}
                disabled={pending}
                className="text-[10px] font-mono uppercase tracking-widest text-[#7d8590] hover:text-[#f85149] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </li>
          );
        })}

        <li className="px-3 py-2 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono"
            style={{ color: "#f85149" }}
          >
            ●
          </span>
          <span className="text-sm text-[#f0f6fc] truncate flex-1">
            {toName}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#4a5159]">
            End
          </span>
        </li>
      </ol>
    </div>
  );
}
