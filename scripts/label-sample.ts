/**
 * Write the stops to label for one corridor (step 20).
 *
 *   bun scripts/label-sample.ts --name=amarillo-austin
 *   bun scripts/label-sample.ts --name=amarillo-austin --scores=path/to/roadside_scores.json
 *
 * Without --scores: the stratified hundred (the first sheet). With --scores
 * (the second sheet, 2026-09-28): the model's yes list and twenty of its no
 * calls, each row carrying the description from the corridor's sidecar so
 * a person can judge it, and the model's probability so the bench can join
 * the labels back.
 *
 * Reads data/corridors/<name>.json (the pull; local, not committed) and
 * writes data/labels/<name>.sample.json (committed: the set John labels),
 * each row with what a person needs to judge it from a phone: name, kind,
 * how far along the corridor, a map link, the OpenStreetMap link. The
 * sheet itself is built from this file through the Docs tools, one
 * dropdown per row; the labels come back through a later script.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { labelSample, sheetFromScores, SHEET_THRESHOLD } from "../src/lib/roadside/sample";
import type { StopDescription } from "../src/lib/roadside/describe";
import type { LatLng } from "../src/lib/routing/polyline";
import type { RoadsideStop } from "../src/lib/roadside/record";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const name = (args.get("name") ?? "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
if (!name) throw new Error("--name=<corridor> is required");
const corridorPath = `data/corridors/${name}.json`;
if (!existsSync(corridorPath)) throw new Error(`${corridorPath} is missing; run the pull first`);

const corridor = JSON.parse(readFileSync(corridorPath, "utf8")) as { from: LatLng; to: LatLng; routeKm: number; stops: RoadsideStop[]; route?: LatLng[] };

// Either sheet. The scores file is the bench's output in jev-lab
// (data/roadside_scores.json): rows of id and p_stop.
const scoresPath = args.get("scores");
type Extra = { group?: string; p_stop?: number } & Partial<Pick<StopDescription, "short" | "extract" | "url">>;
let picked: Array<{ stop: RoadsideStop; extra: Extra }>;
if (scoresPath) {
  if (!existsSync(scoresPath)) throw new Error(`${scoresPath} is missing`);
  const raw = JSON.parse(readFileSync(scoresPath, "utf8")) as { rows?: Array<{ id: string; p_stop: number | null }> };
  if (!Array.isArray(raw.rows)) throw new Error(`${scoresPath} has no rows array`);
  const scores = new Map<string, number>();
  for (const r of raw.rows) if (typeof r.p_stop === "number") scores.set(r.id, r.p_stop);
  const descPath = `data/corridors/${name}.descriptions.json`;
  const descriptions = existsSync(descPath) ? (JSON.parse(readFileSync(descPath, "utf8")) as { byId: Record<string, StopDescription> }).byId : {};
  if (!existsSync(descPath)) console.warn(`  ${descPath} is missing; rows will carry no description`);
  picked = sheetFromScores(corridor.stops, scores).map((r) => {
    const d = descriptions[r.stop.id];
    return { stop: r.stop, extra: { group: r.group, p_stop: Math.round(r.p * 100) / 100, short: d?.short ?? null, extract: d?.extract ?? null, url: d?.url ?? null } };
  });
  console.log(`  ${scores.size} scored of ${corridor.stops.length}; yes at ${SHEET_THRESHOLD}: ${picked.filter((r) => r.extra.group === "yes").length}`);
} else {
  picked = labelSample(corridor.stops).map((stop) => ({ stop, extra: {} }));
}

// How far along: the pull did not store the route, so this is the straight
// line from the start as a fraction of the straight line start to end, in
// kilometres. Good enough to say "near the start" or "past the middle".
// Haversine; 6371 is the Earth's mean radius in kilometres.
const km = (a: LatLng, b: LatLng) => { const R = 6371, r = (x: number) => (x * Math.PI) / 180; const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(Math.min(1, h))); };
const total = km(corridor.from, corridor.to);
const rows = picked
  .map(({ stop: s, extra }) => ({
    ...extra,
    id: s.id,
    name: s.name,
    kind: s.kind,
    // A stop off to the side of the start can sit "farther than the end" on
    // the straight line; clamp to the route's length so the column reads.
    alongKm: Math.min(corridor.routeKm, Math.round(km(corridor.from, s) / Math.max(1, total) * corridor.routeKm)),
    lat: s.lat,
    lng: s.lng,
    wikidata: s.wikidata,
    // Five decimals is about a metre: the pin lands on the thing, and the
    // link stays short enough to read in a table cell.
    map: `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(5)},${s.lng.toFixed(5)}`,
    // Ids are "osm:<node|way|relation>:<number>" by construction (record.ts);
    // anything else gets no link rather than a broken one.
    osm: /^osm:(node|way|relation):\d+$/.test(s.id) ? `https://www.openstreetmap.org/${s.id.slice(4).replace(":", "/")}` : null,
  }));
// The first sheet reads in road order; the second keeps the sampler's order
// (yes by probability, then the two groups of no calls).
if (!scoresPath) rows.sort((a, b) => a.alongKm - b.alongKm);

mkdirSync("data/labels", { recursive: true });
const out = `data/labels/${name}.sample.json`;
writeFileSync(out, JSON.stringify({ corridor: name, sampledAt: new Date().toISOString(), mode: scoresPath ? "scores" : "stratified", threshold: scoresPath ? SHEET_THRESHOLD : undefined, size: rows.length, rows }, null, 2));
const byKind = new Map<string, number>();
for (const r of rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
console.log(`${out}: ${rows.length} rows from ${corridor.stops.length} stops; by kind: ${[...byKind.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`);
