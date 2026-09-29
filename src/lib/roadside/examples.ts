import "server-only";

/**
 * Two real names for the home's example line (Gauntlet U4): "Places like
 * the Cadillac Ranch and the Big Texan, along your road." Read from the
 * roadside store when it is there, the same two on every request; the two
 * everybody on I-40 knows when it is not. No network, no model, no write.
 */

import type Database from "better-sqlite3";
import { resolveStorePath, roadsideStore } from "./store";

export type ExampleNames = readonly [string, string];

/** The names when there is no store. The sentence adds "the" to the first and keeps the second's. */
export const FALLBACK_EXAMPLES: ExampleNames = ["Cadillac Ranch", "the Big Texan"];

/**
 * A name the line can hold: at 16 px on a 390 px phone the sentence with
 * two names of this length is two lines under the title, and a longer name
 * would push the button below the fold. Nothing is cut (quality bar, rule
 * 2); a longer name is simply not the example.
 *
 * Changing it: src/lib/roadside/__tests__/examples.test.ts reads this
 * constant rather than pinning 40, and its fixtures bound it, the two names
 * it expects chosen at 21 characters and the one it expects skipped at 59;
 * 21 or less, or 59 or more, fails that test, and a value between passes it
 * unchanged. No test measures the line: src/app/__tests__/home.fold.ssr.test.tsx
 * mocks the two names, so the fit is the runner's screenshot at 390 by 844
 * with the fold open and a range set, the case with the least room (each
 * line the sentence gains is 24 px, the body face's line height at 16 px,
 * taken from the fold's room under the button; the sums are in the active
 * plan's weakest part).
 */
export const MAX_EXAMPLE_NAME_LENGTH = 40;

/**
 * The rule: the two strongest stops that have a Wikipedia page, by the
 * model's p descending, then by name ascending so a tie is settled the same
 * way every time. A page is the store's mark of a place people have heard
 * of; the score orders those. Names longer than the line can hold are
 * skipped, not cut. Null when the store has fewer than two such stops.
 */
export function exampleNamesFrom(db: Database.Database): ExampleNames | null {
  const rows = db
    .prepare(
      `SELECT name FROM roadside_stop
       WHERE p IS NOT NULL AND url IS NOT NULL
         AND trim(name) <> '' AND length(name) <= ?
       ORDER BY p DESC, name ASC LIMIT 2`
    )
    .all(MAX_EXAMPLE_NAME_LENGTH) as { name: string }[];
  return rows.length === 2 ? [rows[0].name, rows[1].name] : null;
}

/**
 * Once per path for the life of the process: the store is opened read-only
 * and does not change under a running server, and a scan of the country's
 * stops by p is not something to do on every request for the home.
 */
const remembered = new Map<string, ExampleNames>();

/** The two names the home shows, from the store at `path` or the fallback. */
export function homeExampleNames(path: string | null = resolveStorePath()): ExampleNames {
  if (!path) return FALLBACK_EXAMPLES;
  const kept = remembered.get(path);
  if (kept) return kept;
  try {
    const db = roadsideStore(path);
    const names = (db && exampleNamesFrom(db)) ?? FALLBACK_EXAMPLES;
    remembered.set(path, names);
    return names;
  } catch (err) {
    console.warn(`[roadside] no example names from the store: ${err instanceof Error ? err.message : String(err)}`);
    return FALLBACK_EXAMPLES;
  }
}

/** For tests: forget what was read, so a rebuilt fixture is read again. */
export function forgetExampleNames(): void {
  remembered.clear();
}
