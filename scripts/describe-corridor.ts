/**
 * A line about each stop of a pulled corridor, from Wikidata and Wikipedia.
 *
 *   bun scripts/describe-corridor.ts --name=amarillo-austin
 *
 * Reads data/corridors/<name>.json and writes the sidecar
 * data/corridors/<name>.descriptions.json, keyed by stop id: Wikidata's
 * short description, the English Wikipedia title, URL and opening sentences
 * (clipped). Stops with neither a Wikidata id nor an English page are not in
 * the file, and the summary line says how many that is. Free APIs, about
 * 45 requests for an 800 km corridor, paced.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describeStops } from "../src/lib/roadside/describe";
import type { RoadsideStop } from "../src/lib/roadside/record";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const name = (args.get("name") ?? "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
if (!name) throw new Error("--name=<corridor> is required");
const corridorPath = `data/corridors/${name}.json`;
if (!existsSync(corridorPath)) throw new Error(`${corridorPath} is missing; run corridor:pull first`);
const stops = (JSON.parse(readFileSync(corridorPath, "utf8")) as { stops: RoadsideStop[] }).stops;

const described = await describeStops(
  stops,
  { fetch: (...a) => fetch(...a), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
  (done, total) => process.stdout.write(`\r  request ${done} of about ${total}   `)
);
process.stdout.write("\n");

const byId: Record<string, unknown> = {};
let withShort = 0, withExtract = 0;
for (const [id, d] of described) {
  byId[id] = d;
  if (d.short) withShort++;
  if (d.extract) withExtract++;
}
const outPath = `data/corridors/${name}.descriptions.json`;
writeFileSync(outPath, JSON.stringify({ name, describedAt: new Date().toISOString(), stops: stops.length, described: described.size, byId }, null, 1));
console.log(`${outPath}: ${stops.length} stops; ${described.size} reach an encyclopedia; ${withShort} have a short description, ${withExtract} an opening; ${stops.length - described.size} have neither`);
