import type { RankedWaypoint } from "@/lib/personas/types";

/** A row's badge in data terms; the words are the list's ("★ The pick", "Also good"). */
export type RowBadge = "pick" | "good" | null;

/**
 * Each row's badge (Gauntlet U24). "The pick" is singular: one per town,
 * its highest-scoring primary-kind place (rows come ordered by score),
 * named wherever it sits, the lead included (U44: since the badge became
 * words on the kind line, U42, saying it on the lead costs nothing, and
 * three critics found the ranking half shown without it). Every other primary-kind place, and every
 * secondary-kind one, is "Also good"; the rest say nothing. A town out of
 * the way (U21) has no pick, so its best does not read as recommending
 * the detour over the towns on the way. Pure: keyed by waypoint id.
 */
export function rowBadges(
  rows: ReadonlyArray<Pick<RankedWaypoint, "waypointId" | "tier">>,
  outOfTheWay: boolean
): Map<string, RowBadge> {
  const out = new Map<string, RowBadge>();
  const pickId = outOfTheWay ? null : rows.find((r) => r.tier === "primary")?.waypointId ?? null;
  for (const r of rows) {
    if (r.waypointId === pickId) out.set(r.waypointId, "pick");
    else out.set(r.waypointId, r.tier === "other" ? null : "good");
  }
  return out;
}

