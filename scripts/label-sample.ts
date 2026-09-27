/**
 * Write the 100 stops to label for one corridor (step 20).
 *
 *   bun scripts/label-sample.ts --name=amarillo-austin
 *
 * Reads data/corridors/<name>.json (the pull; local, not committed) and
 * writes data/labels/<name>.sample.json (committed: the set John labels),
 * each row with what a person needs to judge it from a phone: name, kind,
 * how far along the corridor, a map link, the OpenStreetMap link. The
 * sheet itself is built from this file through the Docs tools, one
 * dropdown per row; the labels come back through a later script.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { labelSample } from "../src/lib/roadside/sample";
import type { LatLng } from "../src/lib/routing/polyline";
import type { RoadsideStop } from "../src/lib/roadside/record";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const name = (args.get("name") ?? "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
if (!name) throw new Error("--name=<corridor> is required");
const corridorPath = `data/corridors/${name}.json`;
if (!existsSync(corridorPath)) throw new Error(`${corridorPath} is missing; run the pull first`);

const corridor = JSON.parse(readFileSync(corridorPath, "utf8")) as { from: LatLng; to: LatLng; routeKm: number; stops: RoadsideStop[]; route?: LatLng[] };
const sample = labelSample(corridor.stops);

// How far along: the pull did not store the route, so this is the straight
// line from the start as a fraction of the straight line start to end, in
// kilometres. Good enough to say "near the start" or "past the middle".
// Haversine; 6371 is the Earth's mean radius in kilometres.
const km = (a: LatLng, b: LatLng) => { const R = 6371, r = (x: number) => (x * Math.PI) / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(Math.min(1, h))); };
const total = km(corridor.from, corridor.to);
const rows = sample
  .map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    alongKm: Math.round(km(corridor.from, s) / Math.max(1, total) * corridor.routeKm),
    lat: s.lat,
    lng: s.lng,
    wikidata: s.wikidata,
    // Five decimals is about a metre: the pin lands on the thing, and the
    // link stays short enough to read in a table cell.
    map: `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(5)},${s.lng.toFixed(5)}`,
    osm: `https://www.openstreetmap.org/${s.id.replace("osm:", "").replace(":", "/")}`,
  }))
  .sort((a, b) => a.alongKm - b.alongKm);

mkdirSync("data/labels", { recursive: true });
const out = `data/labels/${name}.sample.json`;
writeFileSync(out, JSON.stringify({ corridor: name, sampledAt: new Date().toISOString(), size: rows.length, rows }, null, 2));
const byKind = new Map<string, number>();
for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
console.log(`${out}: ${rows.length} rows from ${corridor.stops.length} stops; by kind: ${[...byKind.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`);
