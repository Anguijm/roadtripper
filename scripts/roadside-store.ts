/**
 * Build the nationwide roadside store from an extract (the step after 22).
 *
 *   bun scripts/roadside-store.ts --from=data/osm/us-roadside.ndjson --db=data/roadside.sqlite
 *
 * Reads the extractor's output (one OSM element per line) through the one
 * parser, `fromOsmElement`, and writes every stop it makes into SQLite:
 * position, kind, what the map says, the Wikidata and Wikipedia links, and
 * empty columns for the encyclopedia lines and the model's score that later
 * passes fill in. Rebuilding replaces the table; the describe and score
 * passes are resumable on top of it because they key on the stop id.
 */

import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import Database from "better-sqlite3";
import { fromOsmElement, type OsmElement, type RoadsideStop } from "../src/lib/roadside/record";
import { storeWriter } from "../src/lib/roadside/store-write";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const from = args.get("from");
const dbPath = args.get("db") ?? "data/roadside.sqlite";
if (!from || !existsSync(from)) throw new Error("--from=<ndjson from scripts/osm/extract-roadside.py> is required");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
// Thirty seconds: the describe pass commits a chunk every minute or two and
// the scorer every few seconds, each holding the write lock for well under a
// second, so a rebuild running beside them waits a moment, not forever.
// Past thirty seconds something is wrong (a hung writer) and failing with
// SQLITE_BUSY is the right answer; a rerun resumes, since every write is an
// upsert.
db.pragma("busy_timeout = 30000");
// Upsert, not replace: a rebuild keeps every description fetched and every
// score bought for a stop whose record did not change, and removes the
// stops that are no longer in the extract. See src/lib/roadside/store-write.ts.
const writer = storeWriter(db);
// The floor for removing stops: half of what is already there, and never
// under ten once anything is there, so a store of a few rows cannot be
// wiped by a run that wrote one. An empty store has nothing to remove and
// gets no floor, so the very first build of a small test extract goes
// through. A rebuild of the same country writes about the same count; an
// empty or truncated extract writes far fewer and must not delete the rest.
const existing = (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop").get() as { n: number }).n;
const removalFloor = existing === 0 ? 0 : Math.max(10, Math.floor(existing / 2));

// `bad` is a line that is not JSON; `notAStop` is an element the parser
// refused (no name, no position, none of our kinds), which is expected of
// the extractor's loose superset and is reported, not counted as broken.
let read = 0, kept = 0, bad = 0, notAStop = 0, threw = 0;
let batch: RoadsideStop[] = [];
const rl = createInterface({ input: createReadStream(from, { encoding: "utf8" }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  read++;
  let el: OsmElement;
  try { el = JSON.parse(line) as OsmElement; } catch { bad++; continue; }
  // The parser refuses what it cannot make a stop of (no name, no
  // position, none of our kinds) by returning null; a throw would be a
  // shape it never expected, which one bad element in 600,000 must not
  // turn into a lost run. Counted with the refused, named on the first.
  let stop: RoadsideStop | null;
  try {
    stop = fromOsmElement(el);
  } catch (err) {
    // Named once, counted always; `el` may be anything JSON.parse returns
    // (null, a number), so the naming must not throw either.
    if (threw++ === 0) console.warn(`  element ${String(el?.type)}/${String(el?.id)} threw in the parser: ${err instanceof Error ? err.message : String(err)}`);
    stop = null;
  }
  if (!stop) { notAStop++; continue; }
  kept++;
  batch.push(stop);
  // One transaction per 10,000 rows: SQLite's cost is per transaction, not
  // per row, so 10,000 is about 30 commits for the whole country instead of
  // 324,000 fsyncs, while a batch is only a few megabytes of pending rows.
  if (batch.length >= 10_000) { writer.write(batch); batch = []; process.stdout.write(`\r  ${read.toLocaleString()} read, ${kept.toLocaleString()} stops   `); }
}
if (batch.length) writer.write(batch);
const removed = writer.removeUnseen(removalFloor);
process.stdout.write("\n");
// ANALYZE after the load so the planner knows the (lat, lng) index is
// selective; without it, a range query on a fresh table may scan.
db.exec("ANALYZE");
db.exec("VACUUM");
// The working file stays in WAL mode for the two writers that follow (the
// describe pass and the scorer); the checkpoint folds this run's log back
// into the main file before close so no -wal file is left beside it. The
// file the deployed app reads is not this one: the publish script's
// VACUUM INTO writes a fresh copy, and that copy is in DELETE journal
// mode by construction (checked 2026-09-28), so a read-only host never
// needs to create a -shm file to open it.
db.pragma("wal_checkpoint(TRUNCATE)");
const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
setMeta.run("builtAt", new Date().toISOString());
setMeta.run("source", from);
setMeta.run("stops", String(kept));
const byKind = db.prepare("SELECT kind, COUNT(*) AS n FROM roadside_stop GROUP BY kind ORDER BY n DESC").all() as Array<{ kind: string; n: number }>;
const scoredKept = (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE p IS NOT NULL").get() as { n: number }).n;
console.log(`${dbPath}: ${read.toLocaleString()} elements read, ${bad} not JSON, ${notAStop.toLocaleString()} not a stop (${threw} of them threw in the parser), ${kept.toLocaleString()} stops written, ${removed.toLocaleString()} removed, ${scoredKept.toLocaleString()} scores kept; by kind: ${byKind.map((r) => `${r.kind} ${r.n.toLocaleString()}`).join(", ")}`);
const withWd = (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE wikidata IS NOT NULL").get() as { n: number }).n;
const withWp = (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE wikipedia IS NOT NULL").get() as { n: number }).n;
console.log(`  ${withWd.toLocaleString()} with a Wikidata id, ${withWp.toLocaleString()} with a Wikipedia tag`);
db.close();
