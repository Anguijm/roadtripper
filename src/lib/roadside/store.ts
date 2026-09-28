import "server-only";

/**
 * The nationwide roadside store (the step after 22): one SQLite file beside
 * the atlas, built offline from an OpenStreetMap extract, described from
 * the encyclopedias and scored once by the model. At plan time the app only
 * looks things up: the stops inside the route's tiles, above the line, then
 * within the buffer of the road itself. No network, no model, no key.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { decodePolyline, type LatLng } from "@/lib/routing/polyline";
import { corridorTiles, DEFAULT_BUFFER_KM } from "./corridor";
import { roadsideAlong, type RoadsideMarker } from "./along";
import { MAP_THRESHOLD, RoadsideSurvivorSchema, type RoadsideSurvivor } from "./survivors";

/**
 * Where the store is, in order: ROADSIDE_STORE_PATH (a volume on the
 * deployed app), beside the atlas in the working directory, or under
 * Next's standalone output when the build traced it in. The same three
 * places the atlas looks (src/lib/atlas/db.ts), for the same reason: the
 * file is data, not code, and the deploy decides where data lives.
 */
export function resolveStorePath(): string | null {
  const explicit = process.env.ROADSIDE_STORE_PATH;
  const candidates = [
    ...(explicit ? [explicit] : []),
    join(process.cwd(), "data", "roadside.sqlite"),
    join(process.cwd(), ".next", "standalone", "data", "roadside.sqlite"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
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
  return roadsideAlong([...byId.values()], route, bufferKm);
}

let warnedMissing = false;

/** The survivors along a planned route, or none if the store is missing or the route cannot be read. */
export function roadsideForRoute(encodedPolyline: string): RoadsideMarker[] {
  try {
    const db = roadsideStore();
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
