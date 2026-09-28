/**
 * The itinerary in one line, so it can sit above the towns without
 * pushing the first reason below the fold: "2 stops · Lubbock, Austin ·
 * 7 h 20 min of driving". Pure; the workspace renders it with a toggle
 * that opens the full itinerary. The drive is said the way a person says
 * it (quality bar, rule 1), never the compact "7h 20m".
 */

import { formatDurationPlain } from "@/lib/routing/format";

export function itinerarySummary(
  stops: ReadonlyArray<{ cityName: string }>,
  legDurationsSeconds: ReadonlyArray<number>,
  finalLegSeconds: number
): string {
  const count = stops.length;
  const head = `${count} ${count === 1 ? "stop" : "stops"}`;
  const names = stops.map((s) => s.cityName).join(", ");
  // One unknown leg makes the total unknown; a partial sum presented as the
  // drive would be a smaller number than the truth, which is the wrong way
  // to be wrong on a deadline.
  const parts = [...legDurationsSeconds, finalLegSeconds];
  const known = parts.every((x) => Number.isFinite(x) && x >= 0);
  const total = known ? parts.reduce((a, b) => a + b, 0) : 0;
  const drive = known && total > 0 ? `${formatDurationPlain(total)} of driving` : null;
  return [head, names || null, drive].filter(Boolean).join(" · ");
}
