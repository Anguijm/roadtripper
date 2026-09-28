/**
 * Fill the store's encyclopedia lines (the pass after roadside-store).
 *
 *   bun scripts/roadside-describe.ts [--db=data/roadside.sqlite] [--limit=N]
 *
 * Every stop with a Wikidata id or a Wikipedia tag and no `described_at`
 * gets Wikidata's short description and, where an English page exists, its
 * opening and URL, through the same client the corridor used (batched,
 * paced, one request at a time). Written back per chunk, so a run that
 * stops resumes where it was. Order: the tagged kinds first, then the
 * Wikidata-only "notable" places, so the scorer can start on the kinds
 * that matter most while the flood is still being described.
 */

import Database from "better-sqlite3";
import { describeStops } from "../src/lib/roadside/describe";
import type { RoadsideStop } from "../src/lib/roadside/record";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const dbPath = args.get("db") ?? "data/roadside.sqlite";
const limit = args.has("limit") ? Number(args.get("limit")) : Infinity;
/**
 * Rows per chunk. The client batches Wikidata 50 ids a request and Wikipedia
 * 20 titles a request, so a chunk of 2,000 is about 40 plus up to 100
 * requests, a minute or so at the client's 250 ms pace: long enough that the
 * per-chunk write is not the bottleneck, short enough that a dropped
 * connection loses a minute, not an hour. The chunk is also the unit of
 * resumption: rows are marked described only when their chunk is written.
 */
const CHUNK = 2_000;

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
// The scorer (jev-lab) writes other columns of the same table while this runs.
db.pragma("busy_timeout = 30000");
type Row = { id: string; name: string; lat: number; lng: number; kind: RoadsideStop["kind"]; detail: string | null; wikidata: string | null; wikipedia: string | null };
const next = db.prepare(`
  SELECT id, name, lat, lng, kind, detail, wikidata, wikipedia FROM roadside_stop
  WHERE described_at IS NULL AND (wikidata IS NOT NULL OR wikipedia IS NOT NULL)
  ORDER BY CASE kind WHEN 'notable' THEN 1 ELSE 0 END, id
  LIMIT ?`);
// The ORDER BY above: every tagged kind first (attractions, museums, the
// historic whitelist...), the Wikidata-only "notable" places last. The
// scorer's first tranche is the tagged kinds, so it can start the moment
// those are described while the flood (180,000 rows on the US file) is
// still being fetched; and if the run is cut short, the rows without a
// line are the ones the model would have scored lowest anyway.
const write = db.prepare(`UPDATE roadside_stop SET short = @short, extract = @extract, url = @url, described_at = @at WHERE id = @id`);
const writeMany = db.transaction((rows: Array<Record<string, unknown>>) => { for (const r of rows) write.run(r); });
const remaining = () => (db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE described_at IS NULL AND (wikidata IS NOT NULL OR wikipedia IS NOT NULL)").get() as { n: number }).n;

let done = 0;
console.log(`${remaining().toLocaleString()} stops to describe`);
while (done < limit) {
  const rows = next.all(Math.min(CHUNK, limit - done)) as Row[];
  if (rows.length === 0) break;
  const stops: RoadsideStop[] = rows.map((r) => ({ ...r, source: "osm", reason: null }));
  const t0 = Date.now();
  // A chunk that fails after the client's own retry is tried again after a
  // longer pause, five times, then the run stops with the rows still
  // undescribed: a rerun resumes at them.
  let described: Awaited<ReturnType<typeof describeStops>> | null = null;
  for (let attempt = 1; attempt <= 5 && !described; attempt++) {
    try {
      described = await describeStops(stops, { fetch: (...a) => fetch(...a), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    } catch (err) {
      console.warn(`  chunk failed (attempt ${attempt} of 5): ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === 5) throw err;
      // 30 s, 60 s, 90 s, 120 s: the client has already retried once after
      // five seconds inside the chunk, so a failure here is an outage of
      // more than a few seconds, and Wikimedia's own guidance for a client
      // that hit an error is to back off, not to hammer. Two minutes at the
      // fourth try is the longest a person watching would wait before
      // rerunning by hand, which the resumable chunk makes cheap.
      await new Promise((r) => setTimeout(r, 30_000 * attempt));
    }
  }
  if (!described) throw new Error("unreachable");
  const at = new Date().toISOString();
  writeMany(rows.map((r) => { const d = described.get(r.id); return { id: r.id, short: d?.short ?? null, extract: d?.extract ?? null, url: d?.url ?? null, at }; }));
  done += rows.length;
  console.log(`  ${done.toLocaleString()} described (${Math.round((Date.now() - t0) / 1000)} s for ${rows.length}); ${remaining().toLocaleString()} left`);
}
db.close();
