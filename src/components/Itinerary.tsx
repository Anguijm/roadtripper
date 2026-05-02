"use client";

import type { TripStopMarker } from "@/components/RouteMap";
import { formatDuration } from "@/lib/routing/format";

export interface ItineraryProps {
  fromName: string;
  toName: string;
  stops: TripStopMarker[];
  /** Drive time in seconds for each leg: legDurations[i] = origin/stop[i-1] → stop[i]. */
  legDurations?: number[];
  /** Drive time in seconds for the final leg: last stop → destination. */
  finalLegSeconds?: number;
  failedStopId?: string | null;
  selectedCityId?: string | null;
  destinationSelected?: boolean;
  pending?: boolean;
  onRemoveStop: (cityId: string) => void;
  onStopClick?: (cityId: string) => void;
  onDestinationClick?: () => void;
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
  legDurations,
  finalLegSeconds,
  failedStopId,
  selectedCityId,
  destinationSelected = false,
  pending = false,
  onRemoveStop,
  onStopClick,
  onDestinationClick,
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
          const legSecs = legDurations?.[index];
          return (
            <li
              key={stop.cityId}
              className={`flex items-center ${selected ? "bg-[#161b22]" : ""}`}
              style={{ borderLeft: `2px solid ${failed ? "#f85149" : selected ? "#f0f6fc" : accent}` }}
            >
              {onStopClick ? (
                <button
                  type="button"
                  onClick={() => onStopClick(stop.cityId)}
                  aria-label={`View neighborhoods for ${stop.cityName}${selected ? " (selected)" : ""}`}
                  className="flex items-center gap-2 flex-1 min-h-[44px] px-3 py-2 text-left hover:bg-[#161b22] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#7d8590]"
                >
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold shrink-0"
                    style={{
                      backgroundColor: failed ? "#f85149" : accent,
                      color: "#0d1117",
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm text-[#f0f6fc] truncate">
                    {stop.cityName}
                    {failed && (
                      <span
                        className="ml-2 text-[10px] font-mono uppercase tracking-widest text-[#f85149]"
                        title="Last route update failed for this stop"
                      >
                        ⚠ failed
                      </span>
                    )}
                    {legSecs !== undefined && !failed && (
                      <span className="ml-2 text-[10px] font-mono text-[#b0b9c2]">
                        · {formatDuration(legSecs)}
                      </span>
                    )}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-h-[44px] px-3 py-2">
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-bold shrink-0"
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
                    {legSecs !== undefined && !failed && (
                      <span className="ml-2 text-[10px] font-mono text-[#b0b9c2]">
                        · {formatDuration(legSecs)}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="px-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onRemoveStop(stop.cityId)}
                  disabled={pending}
                  className="text-[10px] font-mono uppercase tracking-widest text-[#7d8590] hover:text-[#f85149] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}

        <li
          className={onDestinationClick
            ? `flex items-center${destinationSelected ? " bg-[#161b22]" : ""}`
            : "px-3 py-2 flex items-center gap-2"
          }
          style={onDestinationClick && destinationSelected ? { borderLeft: "2px solid #f85149" } : undefined}
        >
          {onDestinationClick ? (
            <button
              type="button"
              onClick={onDestinationClick}
              aria-label={destinationSelected ? `${toName} — tap to resume planning` : `Select ${toName} as final destination`}
              className="flex items-center gap-2 flex-1 min-h-[44px] px-3 py-2 text-left hover:bg-[#161b22] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#7d8590]"
            >
              <span aria-hidden className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono shrink-0" style={{ color: "#f85149" }}>
                ●
              </span>
              <span className="text-sm text-[#f0f6fc] truncate flex-1">
                {toName}
                {finalLegSeconds !== undefined && (
                  <span className="ml-2 text-[10px] font-mono text-[#b0b9c2]">
                    · {formatDuration(finalLegSeconds)}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-mono uppercase tracking-widest whitespace-nowrap ${destinationSelected ? "text-[#3fb950]" : "text-[#7d8590]"}`}>
                {destinationSelected ? "Done ✓" : "End"}
              </span>
            </button>
          ) : (
            <>
              <span aria-hidden className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono" style={{ color: "#f85149" }}>
                ●
              </span>
              <span className="text-sm text-[#f0f6fc] truncate flex-1">
                {toName}
                {finalLegSeconds !== undefined && (
                  <span className="ml-2 text-[10px] font-mono text-[#b0b9c2]">
                    · {formatDuration(finalLegSeconds)}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#4a5159]">
                End
              </span>
            </>
          )}
        </li>
      </ol>
    </div>
  );
}
