/**
 * Build the survivors file for one corridor (step 22).
 *
 *   bun scripts/roadside-survivors.ts --name=amarillo-austin --scores=../jev-lab/data/roadside_scores.json [--threshold=0.45]
 *
 * Reads the pulled corridor, the bench's scores and the descriptions sidecar,
 * and writes data/roadside/<name>.json: every stop at or above the line with
 * one line to read. Committed: the plan page reads it. No network.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";
import { RoadsideStopSchema } from "../src/lib/roadside/record";
import { DescriptionsFileSchema } from "../src/lib/roadside/describe";
import { buildSurvivors, MAP_THRESHOLD, SurvivorsFileSchema } from "../src/lib/roadside/survivors";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const name = (args.get("name") ?? "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
if (!name) throw new Error("--name=<corridor> is required");
const scoresPath = args.get("scores");
if (!scoresPath) throw new Error("--scores=<file> is required: the bench's scores over this corridor");
const threshold = args.has("threshold") ? Number(args.get("threshold")) : MAP_THRESHOLD;
if (!(threshold >= 0 && threshold <= 1)) throw new Error("--threshold must be between 0 and 1");

const readJson = (path: string): unknown => {
  if (!existsSync(path)) throw new Error(`${path} is missing`);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch (err) { throw new Error(`${path} is not JSON: ${err instanceof Error ? err.message : String(err)}`); }
};
const fail = (path: string, what: string, issues: z.core.$ZodIssue[]) => new Error(`${path} is not ${what}: ${issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);

const corridorParsed = z.object({ stops: z.array(RoadsideStopSchema) }).safeParse(readJson(`data/corridors/${name}.json`));
if (!corridorParsed.success) throw fail(`data/corridors/${name}.json`, "a corridor file", corridorParsed.error.issues);
const scoresParsed = z.object({ model: z.string().min(1), rows: z.array(z.object({ id: z.string().min(1), p_stop: z.number().nullable().optional() })) }).safeParse(readJson(scoresPath));
if (!scoresParsed.success) throw fail(scoresPath, "a scores file", scoresParsed.error.issues);
const descPath = `data/corridors/${name}.descriptions.json`;
const descParsed = existsSync(descPath) ? DescriptionsFileSchema.safeParse(readJson(descPath)) : null;
if (descParsed && !descParsed.success) throw fail(descPath, "a descriptions file", descParsed.error.issues);
if (!descParsed) console.warn(`  ${descPath} is missing; lines will come from the map alone`);

const scores = new Map<string, number>();
for (const r of scoresParsed.data.rows) if (typeof r.p_stop === "number") scores.set(r.id, r.p_stop);
const stops = buildSurvivors(corridorParsed.data.stops, scores, descParsed?.data.byId ?? {}, threshold);
const file = SurvivorsFileSchema.parse({ corridor: name, builtAt: new Date().toISOString(), threshold, model: scoresParsed.data.model, stops });
mkdirSync("data/roadside", { recursive: true });
const out = `data/roadside/${name}.json`;
writeFileSync(out, JSON.stringify(file, null, 1));
const withAbout = stops.filter((s) => s.about).length;
console.log(`${out}: ${stops.length} survivors of ${corridorParsed.data.stops.length} at ${threshold}; ${withAbout} have a line to read`);
