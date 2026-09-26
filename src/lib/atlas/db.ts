import "server-only";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Read-only handle to the Urban Explorer atlas, exported to SQLite by
 * `scripts/export-atlas.mjs` and shipped with the build.
 *
 * This replaced a live cross-project Firestore read into
 * `urban-explorer-483600`. Two reasons, in order of importance:
 *
 *   1. Firestore has no spatial query. The corridor work needs "everything
 *      inside this box along the route", which is an R-tree lookup here and a
 *      geohash-prefix contortion there.
 *   2. It coupled this app's availability to another project's IAM grant.
 *
 * The trade is that the atlas is a point-in-time copy. `atlasExportedAt()`
 * exposes the export timestamp so staleness can be surfaced rather than
 * assumed away.
 */

let handle: Database.Database | null = null;

/** Candidate locations, in the order Next is likely to have put the file. */
function resolveAtlasPath(): string {
  const explicit = process.env.ATLAS_PATH;
  const candidates = [
    ...(explicit ? [explicit] : []),
    join(process.cwd(), "data", "atlas.sqlite"),
    // Next standalone output keeps traced files under .next/standalone.
    join(process.cwd(), ".next", "standalone", "data", "atlas.sqlite"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `atlas.sqlite not found. Looked in: ${candidates.join(", ")}. ` +
        `Run 'bun run atlas:export' locally, and check outputFileTracingIncludes for deploys.`
    );
  }
  return found;
}

let warnedStale = false;

export function atlasDb(): Database.Database {
  if (handle) return handle;
  handle = new Database(resolveAtlasPath(), { readonly: true, fileMustExist: true });
  // The file never changes at runtime, so durability pragmas buy nothing and
  // memory-mapped reads keep repeated corridor queries off the syscall path.
  handle.pragma("query_only = true");
  // 256 MB of memory-mapped reads. This is an address-space reservation, not an
  // allocation: pages fault in on demand and the kernel evicts them under
  // pressure, so it does not compete for the 512 MiB container limit the way a
  // 256 MB heap buffer would. The file is 7.3 MB today, so the whole atlas ends
  // up mapped and repeated corridor queries never reach a syscall. The ceiling
  // is deliberately far above current size because stage 4's roadside data will
  // grow this file by an order of magnitude, and a snug cap would quietly stop
  // covering it.
  handle.pragma("mmap_size = 268435456");
  return handle;
}

/** ISO timestamp of the export, or null if the meta row is absent. */
export function atlasExportedAt(): string | null {
  const row = atlasDb()
    .prepare<[], { value: string }>("select value from meta where key = 'exported_at'")
    .get();
  return row?.value ?? null;
}

/**
 * How old the atlas may get before it is worth saying something.
 *
 * 30 days because the Urban Explorer pipeline enriches in batches on the order
 * of weeks, so anything under a month is very likely identical and warning
 * would be noise. Lowering this only helps once the export runs on a schedule;
 * until then a tighter threshold would fire constantly and be ignored, which is
 * worse than not warning at all.
 */
export const ATLAS_STALE_AFTER_DAYS = 30;

/** Days since the export. Callers decide what counts as too old. */
export function atlasAgeDays(now: Date = new Date()): number | null {
  const at = atlasExportedAt();
  if (!at) return null;
  const ms = now.getTime() - new Date(at).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
}

/**
 * Whether the atlas is old enough to mention, with the age.
 *
 * The weakness this exists for: trading a live cross-project read for a local
 * snapshot swapped a loud failure for a silent one. An atlas six months behind
 * Urban Explorer looks exactly like a fresh one at every call site. This does
 * not fix that, it only makes it sayable: `/health` renders it and the first
 * open logs it, so it reaches Cloud Run logs without anyone going to look.
 */
export function atlasStaleness(): { ageDays: number | null; stale: boolean; exportedAt: string | null } {
  const ageDays = atlasAgeDays();
  return {
    ageDays,
    stale: ageDays !== null && ageDays > ATLAS_STALE_AFTER_DAYS,
    exportedAt: atlasExportedAt(),
  };
}

/** Logs once per process, on the first check, rather than on every request. */
export function warnIfAtlasStale(): void {
  if (warnedStale) return;
  warnedStale = true;
  const { ageDays, stale, exportedAt } = atlasStaleness();
  if (stale) {
    console.warn(
      `[atlas] snapshot is ${Math.floor(ageDays!)} days old (exported ${exportedAt}), ` +
        `past the ${ATLAS_STALE_AFTER_DAYS} day mark. Run 'bun run atlas:export'.`
    );
  }
}
