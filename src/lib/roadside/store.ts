import "server-only";

/**
 * The nationwide roadside store (the step after 22): one SQLite file beside
 * the atlas, built offline from an OpenStreetMap extract, described from
 * the encyclopedias and scored once by the model. At plan time the app only
 * looks things up: the stops inside the route's tiles, above the line, then
 * within the buffer of the road itself. No network, no model, no key.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { decodePolyline, type LatLng } from "@/lib/routing/polyline";
import { corridorTiles, DEFAULT_BUFFER_KM } from "./corridor";
import { roadsideAlong, type RoadsideMarker } from "./along";
import { MAP_THRESHOLD, RoadsideSurvivorSchema, type RoadsideSurvivor } from "./survivors";
import { ROADSIDE_TAGS, type TagScores } from "./tags";

/**
 * The main checkout's directory when `cwd` is a linked git worktree, else
 * null. A linked worktree's `.git` is a file, "gitdir: <main>/.git/
 * worktrees/<name>" (git's documented layout; the path can be relative to
 * the worktree), and the main checkout is what stands before `/.git/`.
 * Pure but for the one small file it reads; anything else (no `.git`, a
 * `.git` directory, a line that is not a worktree's) is null.
 *
 * Why read the file rather than ask git. This runs on the plan page at
 * request time (resolveStorePath, once per plan render, a stat and a
 * read of a few bytes), and a child process per request, or a git binary
 * in the deploy image, is a cost and a dependency the one lookup does not
 * earn. The file's format is the one `git worktree add` has written since
 * worktrees existed (gitrepository-layout: a `.git` file holds "gitdir:
 * <path>"), and a linked worktree's gitdir is always under the main
 * checkout's `.git/worktrees/`, which is the only fact used. The trade is
 * that this is a reading of git's layout, not git's own answer: it does
 * not honour GIT_DIR or GIT_COMMON_DIR; a main checkout that was moved
 * leaves the gitdir line dangling, and resolveStorePath's existsSync is
 * what catches that (no store, not a throw); and a submodule's `.git`
 * file ("gitdir: ../.git/modules/<name>") or any other pointer is null on
 * purpose, since only a worktree has a main checkout with a store beside
 * its atlas. The file is trusted as far as naming a directory to look in
 * for a data file, never executed or written; the worst a crafted one
 * does is make the store not found.
 *
 * The regex takes either separator, `[\\/]`, because `resolve` gives
 * backslashes on Windows and forward slashes elsewhere, and git itself
 * writes the line with forward slashes on both; one pattern for every
 * platform, not one that depends on resolve's normalisation. The
 * captured `<main>` keeps whatever separators it has and `join` in
 * resolveStorePath normalises them for the platform. `\s*$` on the first
 * regex trims a trailing newline or CRLF; a path with spaces is kept
 * whole, since git writes the line unquoted; a file with no `gitdir:`
 * line, or one that is not text, is null through the same `catch`.
 *
 * A dev's lookup only (council round 3 on #87, item 4). In production it
 * returns null at once, before touching the filesystem: a deploy is built
 * from a checkout or an image, never from a linked worktree with a main
 * checkout beside it, so there is nothing to find, and the store there is
 * ROADSIDE_STORE_PATH, the file beside the atlas or the standalone copy.
 * The check is `process.env.NODE_ENV === "production"`, which Next's
 * production build inlines as a constant, so the whole read is dead code
 * there; under `next dev`, where the Gauntlet runs each component in a
 * worktree, it is "development" and the lookup stands. `next start` in a
 * worktree is production too, and so does not find the main checkout's
 * store by this route; set ROADSIDE_STORE_PATH for that (round 2's check
 * of the production build did).
 *
 * Moves with it: resolveStorePath (its one caller), docs/roadside-store.md
 * (which says where the app looks), and the tests "finds the main
 * checkout's store from a linked worktree, and lets the worktree's own
 * file and the explicit path win", "names no store from a plain
 * checkout, or with no .git at all, and never throws" and "never reads
 * .git in production, a worktree's file or not" in
 * src/lib/roadside/__tests__/store.test.ts, which lay out a main checkout
 * and a worktree under tmpdir as git does (an absolute and a relative
 * gitdir line, a `.git` directory, no `.git`, a pointer elsewhere, a file
 * that is not a pointer). A change to either regex goes with a case there.
 */
export function mainWorktreeDir(cwd: string): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const dotGit = join(cwd, ".git");
  try {
    if (!statSync(dotGit).isFile()) return null;
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"));
    if (!m) return null;
    const gitdir = resolve(cwd, m[1]);
    const w = /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+$/.exec(gitdir);
    return w ? w[1] : null;
  } catch {
    return null;
  }
}

/**
 * Which of the places the store may be it was found in, in the words the
 * log says it in. The log never says the path (council round 1 on #87):
 * a directory layout belongs to the machine, not to a log line read in
 * any environment. A dev who needs the path has ROADSIDE_STORE_PATH to
 * set and resolveStorePath() to call.
 */
export type StoreSource = "ROADSIDE_STORE_PATH" | "beside the atlas" | "in the standalone output" | "in the main checkout";

export interface StoreLocation {
  path: string;
  source: StoreSource;
}

/**
 * Where the store is, in order: ROADSIDE_STORE_PATH (a volume on the
 * deployed app), beside the atlas in the working directory, under Next's
 * standalone output when the build traced it in, and, when the working
 * directory is a linked git worktree, beside the atlas in the main
 * checkout. The first three are the places the atlas looks
 * (src/lib/atlas/db.ts), for the same reason: the file is data, not code,
 * and the deploy decides where data lives. The fourth is for a worktree
 * (Gauntlet U3, round 4): the store is 111 MB, gitignored and built once,
 * so a worktree beside the main checkout has none of its own, and the dev
 * server the runner started there logged "no store found" and drew no
 * roadside place under the days. A deploy has no `.git`, so nothing
 * changes there. `cwd` and `explicit` are parameters for the tests only.
 * The first that exists wins, with the words for where it was.
 */
export function resolveStore(cwd: string = process.cwd(), explicit: string | undefined = process.env.ROADSIDE_STORE_PATH): StoreLocation | null {
  const main = mainWorktreeDir(cwd);
  const candidates: StoreLocation[] = [
    ...(explicit ? [{ path: explicit, source: "ROADSIDE_STORE_PATH" as const }] : []),
    { path: join(cwd, "data", "roadside.sqlite"), source: "beside the atlas" },
    { path: join(cwd, ".next", "standalone", "data", "roadside.sqlite"), source: "in the standalone output" },
    ...(main ? [{ path: join(main, "data", "roadside.sqlite"), source: "in the main checkout" as const }] : []),
  ];
  return candidates.find((c) => existsSync(c.path)) ?? null;
}

/** The store's path alone, for whoever opens it; null when it is nowhere. */
export function resolveStorePath(cwd: string = process.cwd(), explicit: string | undefined = process.env.ROADSIDE_STORE_PATH): string | null {
  return resolveStore(cwd, explicit)?.path ?? null;
}

/**
 * One read-only connection per path for the life of the process (the
 * default path is what the app uses; a custom path is what tests use), so
 * a test that asks twice does not open two handles and hold two locks.
 * `closeRoadsideStores` is for tests to release them.
 */
const handles = new Map<string, Database.Database>();

/** The store, opened read-only once per path; null when the file is not there. */
export function roadsideStore(path: string | null = resolveStorePath()): Database.Database | null {
  if (!path || !existsSync(path)) return null;
  let db = handles.get(path);
  if (!db) {
    db = new Database(path, { readonly: true, fileMustExist: true });
    handles.set(path, db);
  }
  return db;
}

export function closeRoadsideStores(): void {
  for (const db of handles.values()) db.close();
  handles.clear();
}

type Row = { id: string; name: string; lat: number; lng: number; kind: string; p: number; short: string | null; extract: string | null; detail: string | null; url: string | null };


/**
 * How many stop ids go into one `IN (...)` list.
 *
 * SQLite's compiled-in ceiling on host parameters is 32,766 on anything
 * current and 999 on builds older than 3.32, and better-sqlite3 ships
 * whichever the machine built. 900 is under the older limit, so the query
 * cannot fail on a corridor that happens to be busy; a route with a few
 * hundred markers is one round trip either way.
 *
 * To tune it: the test "never puts more host parameters in one statement
 * than the oldest SQLite accepts" in `__tests__/store.tags.test.ts` is
 * what holds this, and it asserts the 999 ceiling rather than this
 * constant, so raising the value past 999 fails there. Do not trust a
 * behavioural test instead: on a machine with the 32,766 ceiling a single
 * unchunked query simply succeeds, which is how the first version of that
 * test passed with the chunking removed.
 */
const TAG_CHUNK = 900;


/**
 * Whether this database has a `roadside_tag` table at all, remembered per
 * handle.
 *
 * A store built before the tagging pass does not have one, and the query
 * below would raise "no such table" for every plan render against it.
 * `roadsideForRoute` catches, so nothing would crash: every roadside
 * marker would simply stop appearing, on every route, with one line in a
 * log. A silent empty map is a worse failure than a loud one, so the
 * absence is checked rather than caught.
 *
 * Cached in a `WeakMap` on the handle: `sqlite_master` is read once per
 * database rather than once per render, and the entry goes when the handle
 * does. A store that gains the table while the process is running keeps
 * the old answer until the handle is reopened, which is what
 * `closeRoadsideStores` does.
 */
const tagTableSeen = new WeakMap<Database.Database, boolean>();

function hasTagTable(db: Database.Database): boolean {
  const known = tagTableSeen.get(db);
  if (known !== undefined) return known;
  const found = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'roadside_tag'").get() !== undefined;
  tagTableSeen.set(db, found);
  if (!found) console.info("[roadside] store has no roadside_tag table; stops will carry no tag scores");
  return found;
}

/** The eighteen tags as a set, so an unknown row from the table is dropped rather than typed away. */
const KNOWN_TAGS: ReadonlySet<string> = new Set(ROADSIDE_TAGS);

type TagRow = { stop_id: string; tag: string; p: number };

/**
 * The tag scores for the given stops, by id.
 *
 * One indexed seek per stop: `roadside_tag`'s primary key is
 * `(stop_id, tag)` and the table is `WITHOUT ROWID`, so the rows for a
 * stop are contiguous in the index and an `IN (...)` list is a walk of it
 * rather than a scan.
 *
 * Called with the markers the corridor already narrowed to, not with every
 * candidate inside the bounding tiles. That ordering is the whole cost
 * argument: the tiles can hold thousands of stops the road never comes
 * near, and reading tags for those would be work thrown away.
 *
 * Nothing the table holds is trusted, because nothing in this repository
 * writes it: the rows come from the tagging bench in jev-lab
 * (`bench/roadside_tag_score.py`, spec J11), which reads its questions
 * from `data/tag-questions.json` and writes `roadside_tag` directly.
 *
 * So a row is carried only if it is a tag the vocabulary knows *and* its
 * value is a probability — a finite number in 0 to 1. A renamed tag must
 * read as absent rather than arrive as a key nothing will look up, and a
 * `NaN` or an `Infinity` must not reach a marker at all. Both are the same
 * check at the same boundary: this is where data from another repository
 * enters, and filtering the key but not the value would be half a border.
 *
 * `rankFor` still decides what a score *means* for ranking, and `scoreOf`
 * still refuses a bad number, because a marker can also come from a
 * committed survivors file that never passed through here. The two are not
 * duplicates: this one keeps rubbish out of the object, that one keeps the
 * comparator honest about an object it did not build.
 */
export function tagScoresByStop(db: Database.Database, ids: readonly string[]): Map<string, TagScores> {
  const out = new Map<string, TagScores>();
  if (ids.length === 0 || !hasTagTable(db)) return out;
  for (let i = 0; i < ids.length; i += TAG_CHUNK) {
    const chunk = ids.slice(i, i + TAG_CHUNK);
    const q = db.prepare(`SELECT stop_id, tag, p FROM roadside_tag WHERE stop_id IN (${chunk.map(() => "?").join(",")})`);
    for (const r of q.all(...chunk) as TagRow[]) {
      if (!KNOWN_TAGS.has(r.tag)) continue;
      if (typeof r.p !== "number" || !Number.isFinite(r.p) || r.p < 0 || r.p > 1) continue;
      const found = out.get(r.stop_id);
      const scores = found ?? {};
      (scores as Record<string, number>)[r.tag] = r.p;
      if (!found) out.set(r.stop_id, scores);
    }
  }
  return out;
}

/**
 * The same markers, each carrying its tag scores. A stop with no rows in
 * `roadside_tag` keeps no `scores` field at all rather than an empty one,
 * so "never tagged" and "tagged as nothing" stay distinguishable in a
 * capture or a log; `rankFor` ranks them identically either way.
 */
export function withTagScores(db: Database.Database, markers: RoadsideMarker[]): RoadsideMarker[] {
  const byStop = tagScoresByStop(db, markers.map((m) => m.id));
  if (byStop.size === 0) return markers;
  return markers.map((m) => {
    const scores = byStop.get(m.id);
    // A copy, not the map's object. `survivorsAlongRoute` dedupes by id so
    // its markers cannot collide, but this is exported and the map holds
    // one object per stop: two markers with the same id would otherwise
    // share it, and so would the map itself.
    return scores ? { ...m, scores: { ...scores } } : m;
  });
}

/**
 * The survivors inside a route's corridor: every scored stop at or above the
 * line inside any of the route's padded tiles (one indexed range query per
 * tile), then the exact test against the road. Rows the schema refuses are
 * skipped, not fatal.
 */
export function survivorsAlongRoute(db: Database.Database, route: LatLng[], threshold = MAP_THRESHOLD, bufferKm = DEFAULT_BUFFER_KM): RoadsideMarker[] {
  if (route.length < 2) return [];
  const tiles = corridorTiles(route, { bufferKm });
  const q = db.prepare(`
    SELECT id, name, lat, lng, kind, p, short, extract, detail, url FROM roadside_stop
    WHERE p >= ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`);
  const byId = new Map<string, RoadsideSurvivor>();
  for (const t of tiles) {
    for (const r of q.all(threshold, t.box.minLat, t.box.maxLat, t.box.minLng, t.box.maxLng) as Row[]) {
      if (byId.has(r.id)) continue;
      // The one line to read, best first: the Wikipedia opening is a
      // sentence a person wrote about this place; Wikidata's short
      // description is a few words of type ("art museum in Austin, Texas");
      // the map's own line is whatever the mapper typed, from a sentence to
      // "statue". The same order as `aboutFor` in survivors.ts.
      const about = r.extract?.trim() || r.short?.trim() || r.detail?.trim() || null;
      const parsed = RoadsideSurvivorSchema.safeParse({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, kind: r.kind, p: r.p, about, url: r.url });
      if (parsed.success) byId.set(r.id, parsed.data);
    }
  }
  // Tags after the corridor narrows, never before: see `tagScoresByStop`.
  return withTagScores(db, roadsideAlong([...byId.values()], route, bufferKm));
}

let warnedMissing = false;
let saidPath = false;

/** The survivors along a planned route, or none if the store is missing or the route cannot be read. */
export function roadsideForRoute(encodedPolyline: string): RoadsideMarker[] {
  try {
    const found = resolveStore();
    const db = roadsideStore(found?.path ?? null);
    if (db && found && !saidPath) {
      // Once per process, the other half of the warning below: a capture
      // with no diamonds can then be read against the log (Gauntlet U3,
      // round 4: three rounds of captures drew none, and the log's one
      // line about it was the "no store found" warning nobody read). It
      // says which of the four places the store was found in, in words,
      // and never the path, in every environment (council round 1 on
      // #87): the path is the machine's directory layout, and a dev who
      // needs it has ROADSIDE_STORE_PATH and resolveStorePath().
      saidPath = true;
      console.info(`[roadside] store: ${found.source}`);
    }
    if (!db) {
      // Once per process, not once per plan: a deployment without the file
      // should say so in the log, and a busy server should not say it a
      // thousand times.
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(`[roadside] no store found (ROADSIDE_STORE_PATH, data/roadside.sqlite, or the standalone output); the plan page shows no roadside stops. See docs/roadside-store.md.`);
      }
      return [];
    }
    return survivorsAlongRoute(db, decodePolyline(encodedPolyline));
  } catch (err) {
    console.warn(`[roadside] no stops for this route: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
