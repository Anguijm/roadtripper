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
import { fromOsmElement, type OsmElement } from "../src/lib/roadside/record";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const from = args.get("from");
const dbPath = args.get("db") ?? "data/roadside.sqlite";
if (!from || !existsSync(from)) throw new Error("--from=<ndjson from scripts/osm/extract-roadside.py> is required");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS roadside_stop (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT,
    wikidata TEXT,
    wikipedia TEXT,
    short TEXT,
    extract TEXT,
    url TEXT,
    described_at TEXT,
    p REAL,
    scored_at TEXT
  );
  CREATE INDEX IF NOT EXISTS roadside_stop_lat_lng ON roadside_stop (lat, lng);
  CREATE INDEX IF NOT EXISTS roadside_stop_kind ON roadside_stop (kind);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
// A rebuild starts the table over but keeps nothing stale: the describe and
// score passes are cheap to rerun against the cache and the ledger.
db.exec("DELETE FROM roadside_stop");
const insert = db.prepare(`INSERT OR REPLACE INTO roadside_stop (id, name, lat, lng, kind, detail, wikidata, wikipedia) VALUES (@id, @name, @lat, @lng, @kind, @detail, @wikidata, @wikipedia)`);
const insertMany = db.transaction((rows: Array<Record<string, unknown>>) => { for (const r of rows) insert.run(r); });

let read = 0, kept = 0, bad = 0;
let batch: Array<Record<string, unknown>> = [];
const rl = createInterface({ input: createReadStream(from, { encoding: "utf8" }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  read++;
  let el: OsmElement;
  try { el = JSON.parse(line) as OsmElement; } catch { bad++; continue; }
  const stop = fromOsmElement(el);
  if (!stop) continue;
  kept++;
  batch.push({ id: stop.id, name: stop.name, lat: stop.lat, lng: stop.lng, kind: stop.kind, detail: stop.detail, wikidata: stop.wikidata, wikipedia: stop.wikipedia });
  if (batch.length >= 10_000) { insertMany(batch); batch = []; process.stdout.write(`\r  ${read.toLocaleString()} read, ${kept.toLocaleString()} stops   `); }
}
if (batch.length) insertMany(batch);
process.stdout.write("\n");
const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
setMeta.run("builtAt", new Date().toISOString());
setMeta.run("source", from);
setMeta.run("stops", String(kept));
const byKind = db.prepare("SELECT kind, COUNT(*) AS n FROM roadside_stop GROUP BY kind ORDER BY n DESC").all() as Array<{ kind: string; n: number }>;
console.log(`${dbPath}: ${read.toLocaleString()} elements read, ${bad} unreadable, ${kept.toLocaleString()} stops; by kind: ${byKind.map((r) => `${r.kind} ${r.n.toLocaleString()}`).join(", ")}`);
const withWd = (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE wikidata IS NOT NULL").get() as { n: number }).n;
const withWp = (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE wikipedia IS NOT NULL").get() as { n: number }).n;
console.log(`  ${withWd.toLocaleString()} with a Wikidata id, ${withWp.toLocaleString()} with a Wikipedia tag`);
db.close();
