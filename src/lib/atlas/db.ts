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

export function atlasDb(): Database.Database {
  if (handle) return handle;
  handle = new Database(resolveAtlasPath(), { readonly: true, fileMustExist: true });
  // The file never changes at runtime, so durability pragmas buy nothing and
  // memory-mapped reads keep repeated corridor queries off the syscall path.
  handle.pragma("query_only = true");
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

/** Days since the export. Callers decide what counts as too old. */
export function atlasAgeDays(now: Date = new Date()): number | null {
  const at = atlasExportedAt();
  if (!at) return null;
  const ms = now.getTime() - new Date(at).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
}
