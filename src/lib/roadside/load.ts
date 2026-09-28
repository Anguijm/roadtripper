import "server-only";

/**
 * The survivors files on disk, read once per process, and the stops along a
 * planned route. Server only: it reads the data directory. Any failure
 * (no directory, a bad file, a polyline that does not decode) is an empty
 * list, because roadside stops are an extra on the plan page and must never
 * take the route down with them; the failure is logged once.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePolyline } from "@/lib/routing/polyline";
import { SurvivorsFileSchema, type RoadsideSurvivor } from "./survivors";
import { roadsideAlong, type RoadsideMarker } from "./along";

export const ROADSIDE_DIR = join(process.cwd(), "data", "roadside");

let cache: RoadsideSurvivor[] | null = null;

/** Every survivor from every corridor file, de-duplicated by id. */
export function loadSurvivors(dir = ROADSIDE_DIR): RoadsideSurvivor[] {
  if (cache && dir === ROADSIDE_DIR) return cache;
  const byId = new Map<string, RoadsideSurvivor>();
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    try {
      const parsed = SurvivorsFileSchema.safeParse(JSON.parse(readFileSync(join(dir, name), "utf8")));
      if (!parsed.success) {
        console.warn(`[roadside] ${name} is not a survivors file: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        continue;
      }
      for (const s of parsed.data.stops) byId.set(s.id, s);
    } catch (err) {
      console.warn(`[roadside] could not read ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const all = [...byId.values()];
  if (dir === ROADSIDE_DIR) cache = all;
  return all;
}

/** The survivors along a planned route, or none if anything about it cannot be read. */
export function roadsideForRoute(encodedPolyline: string): RoadsideMarker[] {
  try {
    const route = decodePolyline(encodedPolyline);
    return roadsideAlong(loadSurvivors(), route);
  } catch (err) {
    console.warn(`[roadside] no stops for this route: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
