/**
 * Read the labels back off the sheet into the file the bench reads (step 20).
 *
 *   bun scripts/label-import.ts --name=amarillo-austin
 *
 * Reads data/labels/<name>.sample.json (the hundred, committed) and
 * data/labels/<name>.labels.tsv (id, tab, label word; one row a line,
 * transcribed from the sheet), checks the one against the other, and
 * writes data/labels/<name>.labels.json. Stops, writing nothing, on any
 * unknown word, unknown id or conflicting label, and says which. A sample
 * row with no label is counted and left out, not refused: a half-labelled
 * sheet is still a bench.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mergeLabels, parseLabelSheet, LabelsFileSchema, type LabelsFile, type SampleRow } from "../src/lib/roadside/labels";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const name = (args.get("name") ?? "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
if (!name) throw new Error("--name=<corridor> is required");
const samplePath = `data/labels/${name}.sample.json`;
const sheetPath = args.get("from") ?? `data/labels/${name}.labels.tsv`;
const outPath = `data/labels/${name}.labels.json`;
if (!existsSync(samplePath)) throw new Error(`${samplePath} is missing; run label:sample first`);
if (!existsSync(sheetPath)) throw new Error(`${sheetPath} is missing; transcribe the sheet to it (id, tab, label)`);

const sample = JSON.parse(readFileSync(samplePath, "utf8")) as { corridor: string; sampledAt: string; rows: SampleRow[] };
const { rows, errors } = parseLabelSheet(readFileSync(sheetPath, "utf8"));
const merged = mergeLabels(sample.rows, rows);
const problems = [
  ...errors,
  ...merged.unknown.map((id) => `not in the sample: ${id}`),
  ...merged.conflicts.map((id) => `labelled two ways: ${id}`),
];
if (problems.length > 0) {
  for (const p of problems) console.error(p);
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"}; nothing written`);
  process.exit(1);
}

const file: LabelsFile = LabelsFileSchema.parse({ corridor: sample.corridor, sampledAt: sample.sampledAt, importedAt: new Date().toISOString(), labels: merged.labels });
writeFileSync(outPath, JSON.stringify(file, null, 2));
const count = (label: string) => file.labels.filter((l) => l.label === label).length;
console.log(`${outPath}: ${file.labels.length} of ${sample.rows.length} labelled; worth it ${count("worth_it")}, no ${count("no")}, unsure ${count("unsure")}, not yet ${merged.unlabelled.length}`);
