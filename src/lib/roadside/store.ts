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

export const STORE_PATH = join(process.cwd(), "data", "roadside.sqlite");

let handle: Database.Database | null | undefined;

/** The store, opened read-only once per process; null when the file is not there. */
export function roadsideStore(path = STORE_PATH): Database.Database | null {
  if (path !== STORE_PATH) return existsSync(path) ? new Database(path, { readonly: true, fileMustExist: true }) : null;
  if (handle !== undefined) return handle;
  handle = existsSync(path) ? new Database(path, { readonly: true, fileMustExist: true }) : null;
  return handle;
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
      const about = r.extract?.trim() || r.short?.trim() || r.detail?.trim() || null;
      const parsed = RoadsideSurvivorSchema.safeParse({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, kind: r.kind, p: r.p, about, url: r.url });
      if (parsed.success) byId.set(r.id, parsed.data);
    }
  }
  return roadsideAlong([...byId.values()], route, bufferKm);
}

/** The survivors along a planned route, or none if the store is missing or the route cannot be read. */
export function roadsideForRoute(encodedPolyline: string): RoadsideMarker[] {
  try {
    const db = roadsideStore();
    if (!db) return [];
    return survivorsAlongRoute(db, decodePolyline(encodedPolyline));
  } catch (err) {
    console.warn(`[roadside] no stops for this route: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
