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
import { mkdirSync, statSync, renameSync, rmSync, copyFileSync } from "node:fs";
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
  // R1 #1: `insert or replace` assigns a NEW rowid on conflict, while the
  // R-tree row was already written against the old one. Firestore document ids
  // are unique so a conflict cannot happen today, but if one ever did the index
  // would desync silently and corridor queries would return wrong rows with no
  // error. Dedupe first so the pattern cannot bite.
  const seenWaypointIds = new Set();
  for (const d of wpDocs) {
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
    const info = insWp.run({
      id: d.id, city_id: v.city_id, neighborhood_id: v.neighborhood_id ?? null,
      name: en(v.name) ?? d.id, description: en(v.description), type: v.type,
      lat, lng, trending_score: v.trending_score ?? null,
      google_place_id: v.google_place_id ?? null, business_status: v.business_status ?? null,
    });
    // The R-tree rowid MUST equal the waypoints rowid, because that is the only
    // thing joining a spatial hit back to its row. Taking it from the insert
    // rather than a counter keeps them in step even when rows are skipped.
    insRt.run(info.lastInsertRowid, lng, lng, lat, lat);
  }
  insMeta.run("exported_at", new Date().toISOString());
  insMeta.run("source_project", UE_PROJECT);
  insMeta.run("source_database", UE_DB);
})();

console.log(`  skipped: cities ${skipped.cities}, neighborhoods ${skipped.neighborhoods}, waypoints ${skipped.waypoints}`);
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
// R1 #3: TMP is always `${OUT}.tmp`, i.e. the same directory and therefore the
// same filesystem, so EXDEV is not reachable by construction. Handled anyway
// because a future caller could set ATLAS_OUT somewhere that changes that, and
// the failure mode would otherwise be a lost export.
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
