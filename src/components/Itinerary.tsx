"use client";

import type { TripStopMarker } from "@/components/RouteMap";
import { formatDurationPlain } from "@/lib/routing/format";

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

/** A leg's drive as a phrase: "1 h 20 min of driving". The number is the mono face. */
function LegTime({ seconds }: { seconds: number }) {
  return (
    <span className="block text-base text-[#8b949e]">
      <span className="num">{formatDurationPlain(seconds)}</span> of driving
    </span>
  );
}

/**
 * Ordered list of the user's trip:  Start → Stop 1 → Stop 2 → … → End.
 *
 * Council ISC anchors:
 *   PROD-2  rendered ABOVE recommendations whenever stops.length > 0
 *   PROD-3  failed stops surface a warning indicator (failedStopIds set)
 *   PROD-4  Remove buttons disabled while pending
 *
 * Every word in sentence case in the body face at 16 px; a town's name
 * wraps and is never cut with an ellipsis (quality bar, rules 1 and 2).
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
        <p className="text-base text-[#8b949e] mb-1">
          Your trip
        </p>
        <p className="text-base text-[#b0b9c2] leading-relaxed">
          Pick stops from the list to build your trip.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[#30363d] bg-[#0d1117]">
      <div className="px-3 py-2 border-b border-[#30363d] flex items-center justify-between gap-2">
        <p className="text-base text-[#8b949e]">
          Your trip: {stops.length} stop{stops.length === 1 ? "" : "s"}
        </p>
        {pending && (
          <span className="text-base text-[#d29922]">
            Updating…
          </span>
        )}
      </div>
      <ol className="divide-y divide-[#30363d]">
        <li className="px-3 py-2 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-5 h-5 text-[10px] shrink-0"
            style={{ color: "#3fb950" }}
          >
            ●
          </span>
          <span className="text-base text-[#f0f6fc] break-words min-w-0 flex-1">
            {fromName}
          </span>
          <span className="text-base text-[#8b949e] shrink-0">
            Start
          </span>
        </li>

        {stops.map((stop, index) => {
          const failed = failedStopId === stop.cityId;
          const selected = selectedCityId === stop.cityId;
          const legSecs = legDurations?.[index];
          const stopBody = (
            <>
              <span
                aria-hidden
                className="inline-flex items-center justify-center w-5 h-5 text-[10px] num font-bold shrink-0"
                style={{
                  backgroundColor: failed ? "#f85149" : accent,
                  color: "#0d1117",
                }}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base text-[#f0f6fc] break-words">
                  {stop.cityName}
                </span>
                {failed && (
                  <span
                    className="block text-base text-[#f85149]"
                    title="The last route update failed for this stop"
                  >
                    Didn&apos;t update
                  </span>
                )}
                {legSecs !== undefined && !failed && <LegTime seconds={legSecs} />}
              </span>
            </>
          );
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
                  aria-label={`What's in ${stop.cityName}${selected ? " (open)" : ""}`}
                  className="flex items-center gap-2 flex-1 min-w-0 min-h-[44px] px-3 py-2 text-left hover:bg-[#161b22] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#8b949e]"
                >
                  {stopBody}
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0 min-h-[44px] px-3 py-2">
                  {stopBody}
                </div>
              )}
              <div className="px-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onRemoveStop(stop.cityId)}
                  disabled={pending}
                  className="min-h-[44px] text-base text-[#8b949e] hover:text-[#f85149] disabled:opacity-40 disabled:cursor-not-allowed"
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
              aria-label={destinationSelected ? `${toName}: tap to keep planning` : `Lock the route at ${toName}`}
              className="flex items-center gap-2 flex-1 min-w-0 min-h-[44px] px-3 py-2 text-left hover:bg-[#161b22] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#8b949e]"
            >
              <span aria-hidden className="inline-flex items-center justify-center w-5 h-5 text-[10px] shrink-0" style={{ color: "#f85149" }}>
                ●
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base text-[#f0f6fc] break-words">{toName}</span>
                {finalLegSeconds !== undefined && <LegTime seconds={finalLegSeconds} />}
              </span>
              <span className={`text-base whitespace-nowrap shrink-0 ${destinationSelected ? "text-[#3fb950]" : "text-[#8b949e]"}`}>
                {destinationSelected ? "Done" : "End"}
              </span>
            </button>
          ) : (
            <>
              <span aria-hidden className="inline-flex items-center justify-center w-5 h-5 text-[10px] shrink-0" style={{ color: "#f85149" }}>
                ●
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base text-[#f0f6fc] break-words">{toName}</span>
                {finalLegSeconds !== undefined && <LegTime seconds={finalLegSeconds} />}
              </span>
              <span className="text-base text-[#8b949e] shrink-0">
                End
              </span>
            </>
          )}
        </li>
      </ol>
    </div>
  );
}
