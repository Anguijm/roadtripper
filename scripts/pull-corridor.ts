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

import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv } from "./lib/env.mjs";
import { corridorTiles, withinCorridor, DEFAULT_BUFFER_KM, DEFAULT_TILE_KM } from "../src/lib/roadside/corridor";
import { fetchCorridorFromOverpass } from "../src/lib/roadside/overpass";
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
const geo = (await res.json()) as { features: Array<{ geometry: { coordinates: [number, number][] }; properties: { summary: { distance: number; duration: number } } }> };
const feature = geo.features[0];
const route: LatLng[] = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
console.log(`  ${route.length} points, ${Math.round(feature.properties.summary.distance / 1000)} km, ${Math.round(feature.properties.summary.duration / 60)} min`);

const tiles = corridorTiles(route, { tileKm: DEFAULT_TILE_KM, bufferKm });
console.log(`  ${tiles.length} tiles of up to ${DEFAULT_TILE_KM} km, buffer ${bufferKm} km; pulling from Overpass`);

const raw = await fetchCorridorFromOverpass(tiles.map((t) => t.box), undefined, (i, n, found) => {
  console.log(`  tile ${i}/${n}: ${found} named stops in the box`);
});
const inCorridor = raw.filter((s) => withinCorridor(s, route, bufferKm));
console.log(`  ${raw.length} in the boxes, ${inCorridor.length} within ${bufferKm} km of the road`);

mkdirSync("data/corridors", { recursive: true });
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
