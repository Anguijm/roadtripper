/**
 * Pull one corridor's roadside stops, raw, for step 19: look at it by eye.
 *
 *   bun scripts/pull-corridor.ts --from=35.2073,-101.8338 --to=30.2672,-97.7431 --name=amarillo-austin
 *
 * The route polyline comes from OpenRouteService directions (free, well
 * inside the 200 a day), the corridor is cut into tiles, each tile is pulled
 * from Overpass with the pauses the client enforces, and the result is
 * written twice: data/corridors/<name>.json (the records) and
 * data/corridors/<name>.txt (one line per stop, to read). No filtering
 * beyond "has a name and a kind we pull" and "is within the buffer of the
 * road". That is the point: step 19 is about seeing what the sources say.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { RoadsideStop } from "../src/lib/roadside/record";
import { loadEnv } from "./lib/env.mjs";
import { corridorTiles, withinCorridor, DEFAULT_BUFFER_KM, DEFAULT_TILE_KM } from "../src/lib/roadside/corridor";
import { fetchCorridorFromOverpass, QUERY_VERSION } from "../src/lib/roadside/overpass";
import type { LatLng } from "../src/lib/routing/polyline";

const args = new Map(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const point = (raw: string | undefined, flag: string): LatLng => {
  const [lat, lng] = (raw ?? "").split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`--${flag}=lat,lng is required`);
  return { lat, lng };
};
const from = point(args.get("from"), "from");
const to = point(args.get("to"), "to");
const name = (args.get("name") ?? "corridor").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
const bufferKm = Number(args.get("buffer") ?? DEFAULT_BUFFER_KM);

const env = loadEnv() as Record<string, string | undefined>;
const key = env.ORS_API_KEY;
if (!key) throw new Error("ORS_API_KEY is not set");

console.log(`route ${from.lat},${from.lng} -> ${to.lat},${to.lng} via ORS directions`);
const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${encodeURIComponent(key)}&start=${from.lng},${from.lat}&end=${to.lng},${to.lat}`;
const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`ORS ${res.status}: ${(await res.text()).slice(0, 200)}`);
const geo = (await res.json()) as { features?: Array<{ geometry: { coordinates: [number, number][] }; properties: { summary: { distance: number; duration: number } } }> };
const feature = geo.features?.[0];
if (!feature || !Array.isArray(feature.geometry?.coordinates) || feature.geometry.coordinates.length < 2) {
  throw new Error("ORS returned no route for these points; check they are drivable and on the same landmass");
}
const route: LatLng[] = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
console.log(`  ${route.length} points, ${Math.round(feature.properties.summary.distance / 1000)} km, ${Math.round(feature.properties.summary.duration / 60)} min`);

const tiles = corridorTiles(route, { tileKm: DEFAULT_TILE_KM, bufferKm });
mkdirSync("data/corridors", { recursive: true });

// Progress, per tile, written the moment a tile answers. The public Overpass
// instance refuses under load, so a corridor may take several runs; each
// run starts at the first tile the file does not hold. The key carries a
// hash of the route itself, the tile count and the buffer, so the same
// name with a different route (ORS re-routed, a different start) starts
// over rather than reusing tiles cut along another line. It also carries
// PROGRESS_VERSION: bump it when RoadsideStopSchema in
// src/lib/roadside/record.ts changes shape, so saved tiles in the old
// shape are not merged with new ones.
// 2 since 2026-09-28: the record gained `detail`, so tiles saved under 1
// lack a field every later reader expects.
const PROGRESS_VERSION = 2;
const progressPath = `data/corridors/${name}.tiles.json`;
type Progress = { key: string; tiles: Record<string, RoadsideStop[]> };
const routeHash = createHash("sha256")
  .update(route.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(";"))
  .digest("hex")
  .slice(0, 16);
const progressKey = `v${PROGRESS_VERSION}|q${QUERY_VERSION}|${name}|${routeHash}|${tiles.length}|${bufferKm}`;
let progress: Progress = { key: progressKey, tiles: {} };
if (existsSync(progressPath)) {
  // A run killed mid-write can leave a truncated file; that is a clean
  // start with a warning, not a crash, since the tiles are cheap to refetch
  // and the alternative is a hand-edit of JSON.
  try {
    const saved = JSON.parse(readFileSync(progressPath, "utf8")) as Progress;
    if (saved && typeof saved === "object" && saved.key === progressKey && saved.tiles && typeof saved.tiles === "object") progress = saved;
    else console.log(`  progress file is for a different route, buffer or version; starting over`);
  } catch (err) {
    console.warn(`  progress file is unreadable (${err instanceof Error ? err.message : String(err)}); starting over`);
  }
}
const already = new Map<number, RoadsideStop[]>(Object.entries(progress.tiles).map(([i, s]) => [Number(i), s]));
console.log(`  ${tiles.length} tiles of up to ${DEFAULT_TILE_KM} km, buffer ${bufferKm} km; ${already.size} already held, pulling the rest from Overpass`);

const overpassUrl = env.OVERPASS_URL;
let raw: RoadsideStop[];
try {
  raw = await fetchCorridorFromOverpass(
  tiles.map((t) => t.box),
  { fetch: (...a) => fetch(...a), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), url: overpassUrl },
  (i, n, stops) => {
    progress.tiles[String(i - 1)] = stops;
    writeFileSync(progressPath, JSON.stringify(progress));
    console.log(`  tile ${i}/${n}: ${stops.length} named stops in the box`);
  },
  already
  );
} catch (err) {
  // One line, not a stack: the progress file holds every tile that
  // answered, so the fix for a busy instance is to run this again later.
  console.error(`pull stopped: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  console.error(`${Object.keys(progress.tiles).length} of ${tiles.length} tiles are saved in ${progressPath}; rerun the same command to resume`);
  process.exit(1);
}
const inCorridor = raw.filter((s) => withinCorridor(s, route, bufferKm));
console.log(`  ${raw.length} in the boxes, ${inCorridor.length} within ${bufferKm} km of the road`);

const jsonPath = `data/corridors/${name}.json`;
const txtPath = `data/corridors/${name}.txt`;
writeFileSync(jsonPath, JSON.stringify({ name, from, to, bufferKm, pulledAt: new Date().toISOString(), routeKm: Math.round(feature.properties.summary.distance / 1000), stops: inCorridor }, null, 2));
const byKind = new Map<string, number>();
for (const s of inCorridor) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);
const lines = [
  `${name}: ${inCorridor.length} roadside stops within ${bufferKm} km of the road, by kind: ${[...byKind.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`,
  "",
  ...inCorridor
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map((s) => `${s.kind.padEnd(10)} ${s.name}${s.wikidata ? `  [${s.wikidata}]` : ""}`),
];
writeFileSync(txtPath, lines.join("\n") + "\n");
console.log(`wrote ${jsonPath} and ${txtPath}`);
