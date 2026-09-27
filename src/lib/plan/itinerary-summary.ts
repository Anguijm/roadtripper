/**
 * The itinerary in one line, so it can sit above the candidates without
 * pushing the first reason below the fold: "2 stops · Lubbock, Austin ·
 * 7 h 20 min". Pure; the workspace renders it with a toggle that opens the
 * full itinerary.
 */

import { formatDuration } from "@/lib/routing/format";

export function itinerarySummary(
  stops: ReadonlyArray<{ cityName: string }>,
  legDurationsSeconds: ReadonlyArray<number>,
  finalLegSeconds: number
): string {
  const count = stops.length;
  const head = `${count} ${count === 1 ? "stop" : "stops"}`;
  const names = stops.map((s) => s.cityName).join(", ");
  const total = legDurationsSeconds.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) + (Number.isFinite(finalLegSeconds) ? finalLegSeconds : 0);
  const drive = total > 0 ? formatDuration(total) : null;
  return [head, names || null, drive].filter(Boolean).join(" · ");
}
