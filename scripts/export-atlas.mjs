/**
 * Export the Urban Explorer atlas from Firestore into a local SQLite file.
 *
 * Road Tripper used to read `urban-explorer-483600` live, across a project
 * boundary, on every cache miss. That coupled one app's availability to another
 * app's IAM, and Firestore has no spatial query, which the corridor work in
 * stage 4 requires. This produces a file that ships with the build instead.
 *
 * Deliberately NOT exported: `vibe_tasks` (35,319 docs). Those are Urban
 * Explorer's scavenger-hunt mechanic and Road Tripper has no use for them.
 *
 * Deliberately exported: `description`, which the old Firestore projection
 * dropped. It is the sentence that says why a stop is worth making, and step 12
 * renders it.
 *
 *   bun run atlas:export
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Database from "better-sqlite3";
import { mkdirSync, statSync, renameSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const OUT = process.env.ATLAS_OUT ?? "data/atlas.sqlite";
// Written here first and renamed over OUT at the end. rename(2) is atomic
// within a filesystem, so a reader sees either the previous complete atlas or
// the new complete one, never a half-written file.
const TMP = `${OUT}.tmp`;
// Project and database names, not credentials: auth is Application Default
// Credentials. Overridable so the export can be aimed at a staging copy to
// check for schema drift before it touches the real file:
//   UE_PROJECT=urban-explorer-staging ATLAS_OUT=/tmp/probe.sqlite bun run atlas:export
const UE_PROJECT = process.env.UE_PROJECT ?? "urban-explorer-483600";
const UE_DB = process.env.UE_DB ?? "urbanexplorer";

const app = initializeApp(
  { credential: applicationDefault(), projectId: UE_PROJECT },
  "atlas-export"
);
const fs = getFirestore(app, UE_DB);

/** Firestore stores either flat lat/lng or a nested location. Normalize once. */
const coords = (v) => [
  v.lat ?? v.location?.latitude ?? v.location?._latitude,
  v.lng ?? v.location?.longitude ?? v.location?._longitude,
];

/** LocalizedText is { en, ja, ... }. Road Tripper is English-only today; the
 *  column stays a plain string so the read layer needs no shape knowledge. */
const en = (t) => (typeof t === "string" ? t : (t?.en ?? null));

/**
 * Carry the drive-time graph across a rebuild.
 *
 * The atomic rename below writes a BRAND NEW database and swaps it over the old
 * one, which means anything this script does not write is destroyed. The drive
 * graph is built by a different script, takes a long time, and is not derivable
 * from Firestore, so a refresh of the places would silently wipe it and the only
 * symptom would be the app quietly falling back to paid API calls.
 *
 * Read it out first, write it back after. A city that no longer exists is
 * dropped with the rest, since a drive time to nowhere is not useful.
 */
function carryOverDriveGraph(path) {
  if (!existsSync(path)) return { rows: [], meta: [] };
  try {
    const old = new Database(path, { readonly: true });
    const has = (t) => old.prepare(
      "select count(*) c from sqlite_master where type='table' and name=?"
    ).get(t).c > 0;
    const rows = has("city_drive_times")
      ? old.prepare("select from_city_id, to_city_id, minutes, meters from city_drive_times").all()
      : [];
    const meta = has("meta")
      ? old.prepare("select key, value from meta where key like 'drive_graph%'").all()
      : [];
    old.close();
    return { rows, meta };
  } catch (err) {
    console.warn(`  could not read the previous atlas, drive graph will be empty: ${err.message}`);
    return { rows: [], meta: [] };
  }
}

const carried = carryOverDriveGraph(OUT);

mkdirSync(dirname(OUT), { recursive: true });
for (const stale of [TMP, `${TMP}-wal`, `${TMP}-shm`]) rmSync(stale, { force: true });
const db = new Database(TMP);
db.pragma("journal_mode = WAL");

db.exec(`
  drop table if exists cities;
  drop table if exists neighborhoods;
  drop table if exists waypoints;
  drop table if exists waypoint_rtree;
  drop table if exists meta;

  create table meta (key text primary key, value text not null);

  create table cities (
    id text primary key, name text not null, country text, region text,
    tier text, vibe_class text, lat real not null, lng real not null,
    lore_anchor text, coverage_tier text, max_radius_km real
  );
  create index cities_lng on cities(lng);

  create table neighborhoods (
    id text primary key, city_id text not null, name text not null,
    summary text, lore text, lat real, lng real, trending_score real
  );
  create index neighborhoods_city on neighborhoods(city_id);

  create table waypoints (
    id text primary key, city_id text not null, neighborhood_id text,
    name text not null, description text, type text not null,
    lat real not null, lng real not null, trending_score real,
    google_place_id text, business_status text
  );
  create index waypoints_city on waypoints(city_id);
  create index waypoints_type on waypoints(type);

  -- Spatial index. Degenerate boxes (min == max) because these are points; the
  -- R-tree still answers "everything inside this corridor box" without a scan.
  create virtual table waypoint_rtree using rtree(rowid, minLng, maxLng, minLat, maxLat);
`);

// Drive times between cities. Written by scripts/build-drive-graph.mjs, not by
// this script, because it comes from a routing provider rather than Firestore
// and takes far longer to build. Created here so the schema lives in one place
// and a fresh atlas is queryable (empty) rather than missing a table.
//
// Directed: A to B need not equal B to A (one-way systems, mountain passes).
db.exec(`
  create table if not exists city_drive_times (
    from_city_id text not null,
    to_city_id   text not null,
    minutes      real not null,
    meters       real,
    primary key (from_city_id, to_city_id)
  );
  create index if not exists cdt_from on city_drive_times(from_city_id, minutes);
`);

/**
 * Two waypoints are the same place when they share a city, share a name, and
 * sit within this distance of each other.
 *
 * 2 km is not a guess. Across the 1,056 same-name groups in continental US
 * cities, the maximum separation inside a group is 0.27 km at the median and
 * 1.09 km at p90, and 1,017 of the 1,056 fall entirely within 2 km. Only 4
 * groups spread past 5 km. So the pipeline is emitting one real place several
 * times with jittered coordinates and separately-written descriptions, rather
 * than recording genuine branches of a chain.
 *
 * Deliberately conservative: a pair of same-named places genuinely far apart
 * (two branches, two parks) stays as two rows. The cost of merging those wrongly
 * is worse than the cost of leaving a rare duplicate.
 */
const DUPLICATE_RADIUS_KM = 2;

const kmBetween = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Conservative on purpose: case and whitespace only. Stripping articles or
 *  punctuation would start merging places that are actually different. */
const nameKey = (n) => String(n ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Collapse repeated records of the same place, keeping the richest one.
 *
 * "Richest" is trending_score first, then description length, then the id, so
 * the choice is deterministic and a re-export produces the same atlas.
 */
function dedupeWaypoints(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.city_id}|${nameKey(r.name)}`;
    const list = groups.get(k);
    if (list) list.push(r); else groups.set(k, [r]);
  }
  const kept = [];
  let dropped = 0;
  for (const list of groups.values()) {
    if (list.length === 1) { kept.push(list[0]); continue; }
    // Single-linkage clustering, so far-apart same-name places survive as
    // separate rows. Merging ALL matching clusters matters: first-match-wins
    // leaves an item in one cluster while it is still within the radius of
    // another, which left exactly one colocated duplicate behind and was only
    // caught because a test counted them.
    const clusters = [];
    for (const r of list) {
      const hits = [];
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].some((x) => kmBetween(x, r) <= DUPLICATE_RADIUS_KM)) hits.push(i);
      }
      if (hits.length === 0) { clusters.push([r]); continue; }
      const merged = [r];
      for (const i of hits) merged.push(...clusters[i]);
      for (const i of hits.slice().reverse()) clusters.splice(i, 1);
      clusters.push(merged);
    }
    for (const c of clusters) {
      c.sort((a, b) =>
        (b.trending_score ?? 0) - (a.trending_score ?? 0) ||
        (b.description?.length ?? 0) - (a.description?.length ?? 0) ||
        String(a.id).localeCompare(String(b.id))
      );
      kept.push(c[0]);
      dropped += c.length - 1;
    }
  }
  return { kept, dropped };
}

const pull = async (col) => (await fs.collection(col).get()).docs;
const t0 = Date.now();

console.log("reading Firestore...");
const [cityDocs, nbDocs, wpDocs] = await Promise.all([
  pull("cities"),
  pull("vibe_neighborhoods"),
  pull("vibe_waypoints"),
]);
console.log(`  cities ${cityDocs.length}  neighborhoods ${nbDocs.length}  waypoints ${wpDocs.length}`);

const insCity = db.prepare(
  `insert or replace into cities values (@id,@name,@country,@region,@tier,@vibe_class,@lat,@lng,@lore_anchor,@coverage_tier,@max_radius_km)`
);
const insNb = db.prepare(
  `insert or replace into neighborhoods values (@id,@city_id,@name,@summary,@lore,@lat,@lng,@trending_score)`
);
const insWp = db.prepare(
  `insert or replace into waypoints values (@id,@city_id,@neighborhood_id,@name,@description,@type,@lat,@lng,@trending_score,@google_place_id,@business_status)`
);
const insRt = db.prepare(`insert into waypoint_rtree values (?,?,?,?,?)`);
const insMeta = db.prepare(`insert or replace into meta values (?,?)`);

const skipped = { cities: 0, neighborhoods: 0, waypoints: 0 };
let duplicatesDropped = 0;

db.transaction(() => {
  for (const d of cityDocs) {
    const v = d.data();
    const [lat, lng] = coords(v);
    // A city without coordinates cannot be routed to, so it is not a city we
    // can use. Counted and reported rather than silently dropped.
    if (typeof lat !== "number" || typeof lng !== "number" || v.isArchived) { skipped.cities++; continue; }
    insCity.run({
      id: d.id, name: en(v.name) ?? d.id, country: v.country ?? null, region: v.region ?? null,
      tier: v.tier ?? null, vibe_class: v.vibeClass ?? null, lat, lng,
      lore_anchor: v.loreAnchor ?? null, coverage_tier: v.coverageTier ?? null,
      max_radius_km: v.maxRadiusKm ?? null,
    });
  }
  for (const d of nbDocs) {
    const v = d.data();
    if (!v.city_id) { skipped.neighborhoods++; continue; }
    const [lat, lng] = coords(v);
    insNb.run({
      id: d.id, city_id: v.city_id, name: en(v.name) ?? d.id,
      summary: en(v.summary), lore: en(v.lore),
      lat: typeof lat === "number" ? lat : null, lng: typeof lng === "number" ? lng : null,
      trending_score: v.trending_score ?? null,
    });
  }
  // Collected first, then deduped, then written. The R-tree row is derived from
  // the insert, so nothing may be inserted until the final set is known.
  const candidates = [];
  const seenWaypointIds = new Set();
  for (const d of wpDocs) {
    // `insert or replace` assigns a NEW rowid on conflict while the R-tree row
    // was written against the old one. Firestore ids are unique so this cannot
    // happen today, but a silent desync returns wrong places with no error.
    if (seenWaypointIds.has(d.id)) { skipped.waypoints++; continue; }
    seenWaypointIds.add(d.id);
    const v = d.data();
    const [lat, lng] = coords(v);
    if (!v.city_id || !v.type || typeof lat !== "number" || typeof lng !== "number") { skipped.waypoints++; continue; }
    // Filtered at export rather than at query time. A retired waypoint is not
    // something Road Tripper ever wants, so dropping it here keeps every runtime
    // query free of a predicate each caller would otherwise have to remember,
    // and keeps the shipped file smaller. The cost is that reactivating one
    // upstream needs a re-export, which is equally true of every other field.
    if (v.is_active === false) { skipped.waypoints++; continue; }
    candidates.push({
      id: d.id, city_id: v.city_id, neighborhood_id: v.neighborhood_id ?? null,
      name: en(v.name) ?? d.id, description: en(v.description), type: v.type,
      lat, lng, trending_score: v.trending_score ?? null,
      google_place_id: v.google_place_id ?? null, business_status: v.business_status ?? null,
    });
  }

  const { kept, dropped } = dedupeWaypoints(candidates);
  duplicatesDropped = dropped;
  for (const w of kept) {
    const info = insWp.run(w);
    // The R-tree rowid MUST equal the waypoints rowid, because that is the only
    // thing joining a spatial hit back to its row. Taking it from the insert
    // rather than a counter keeps them in step even when rows are skipped.
    insRt.run(info.lastInsertRowid, w.lng, w.lng, w.lat, w.lat);
  }
  insMeta.run("exported_at", new Date().toISOString());
  insMeta.run("source_project", UE_PROJECT);
  insMeta.run("source_database", UE_DB);
})();

// Restore the drive graph, dropping any pair whose city no longer exists. A
// drive time to a city that is gone is not useful, and leaving it would let the
// read layer offer somewhere the atlas can no longer describe.
if (carried.rows.length > 0 || carried.meta.length > 0) {
  const cityIds = new Set(db.prepare("select id from cities").all().map((r) => r.id));
  const insDt = db.prepare(
    "insert or replace into city_drive_times (from_city_id, to_city_id, minutes, meters) values (?,?,?,?)"
  );
  let restored = 0, orphaned = 0;
  db.transaction(() => {
    for (const r of carried.rows) {
      if (!cityIds.has(r.from_city_id) || !cityIds.has(r.to_city_id)) { orphaned++; continue; }
      insDt.run(r.from_city_id, r.to_city_id, r.minutes, r.meters);
      restored++;
    }
    for (const m of carried.meta) insMeta.run(m.key, m.value);
  })();
  console.log(`  drive graph carried over: ${restored} rows restored, ${orphaned} orphaned`);
}

console.log(`  skipped: cities ${skipped.cities}, neighborhoods ${skipped.neighborhoods}, waypoints ${skipped.waypoints}`);
console.log(`  duplicates collapsed: ${duplicatesDropped} (same city, same name, within ${DUPLICATE_RADIUS_KM} km)`);
db.pragma("wal_checkpoint(TRUNCATE)");
db.exec("vacuum");
const counts = ["cities", "neighborhoods", "waypoints"].map(
  (t) => `${t} ${db.prepare(`select count(*) c from ${t}`).get().c}`
).join("  ");
// Guard the thing the dedupe above protects. A silent desync is the worst
// outcome here: queries keep working and quietly return the wrong places.
const integrity = db
  .prepare(
    `select (select count(*) from waypoints) as wp,
            (select count(*) from waypoint_rtree) as rt,
            (select count(*) from waypoint_rtree r
               left join waypoints w on w.rowid = r.rowid
              where w.rowid is null) as orphans`
  )
  .get();
if (integrity.wp !== integrity.rt || integrity.orphans !== 0) {
  db.close();
  rmSync(TMP, { force: true });
  throw new Error(
    `spatial index desynced: waypoints=${integrity.wp} rtree=${integrity.rt} orphans=${integrity.orphans}. Refusing to publish.`
  );
}
console.log(`  spatial index verified: ${integrity.rt} rows, 0 orphans`);

db.close();

// The destination's -wal and -shm belong to the OLD database. Renaming the main
// file over the top strands them, and the next process to open the atlas
// read-write tries to replay a WAL from a different database and fails with
// "disk image is malformed" — while `integrity_check` on the file itself says
// ok, which makes it a genuinely confusing failure. Found exactly that way.
// This script is a build step. It runs on a developer machine or in CI before
// a deploy, against a file no server has open. It must NEVER be pointed at the
// atlas a running Next.js process is reading: the rename below swaps the file
// under that process and the sidecar removal here would strand its WAL.
// Deploying the new file is what makes it live, not writing it.
for (const sidecar of [`${OUT}-wal`, `${OUT}-shm`]) rmSync(sidecar, { force: true });

// TMP is always `${OUT}.tmp`, i.e. the same directory and filesystem, so EXDEV
// is unreachable by construction. Handled anyway because a future ATLAS_OUT
// could change that, and the failure would otherwise be a silently lost export.
try {
  renameSync(TMP, OUT);
} catch (err) {
  if (err?.code !== "EXDEV") throw err;
  // Copying straight onto OUT is not atomic: a reader could open a half-written
  // file. Copy to a sibling on the destination filesystem, then rename, which
  // is atomic there. The finally guarantees neither temp file outlives a
  // failure part-way through, which would otherwise leave a stale .tmp.dest
  // that a later run could mistake for progress.
  const DEST_TMP = `${OUT}.tmp.dest`;
  try {
    copyFileSync(TMP, DEST_TMP);
    renameSync(DEST_TMP, OUT);
  } finally {
    rmSync(DEST_TMP, { force: true });
    rmSync(TMP, { force: true });
  }
}
console.log(`wrote ${OUT}: ${counts}`);
console.log(`  size ${(statSync(OUT).size / 1e6).toFixed(1)} MB, took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
