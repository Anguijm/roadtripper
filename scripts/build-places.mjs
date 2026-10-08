/**
 * Build the list of US towns that can name where a cut day ends
 * (Gauntlet U19), from GeoNames' `cities1000` dump:
 *
 *   curl -sSLO https://download.geonames.org/export/dump/cities1000.zip && unzip cities1000.zip
 *   node scripts/build-places.mjs cities1000.txt
 *
 * GeoNames is CC BY 4.0; the plan page credits it. Kept: US populated
 * places of MIN_POP people or more (default 1,000: the operator chose it on 2026-10-08, U36; it was 5,000 in U19). Dropped: sections of a place (PPLX, a
 * neighbourhood is not where a day ends), and abandoned or historical
 * places (PPLQ, PPLH). Written as [name, state, lat, lng] rows, four
 * decimals (about 10 m), sorted, so a rebuild from the same dump is the
 * same file.
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-places.mjs <cities1000.txt> [min population, default 1000]");
  process.exit(1);
}
const DROP = new Set(["PPLX", "PPLQ", "PPLH"]);
const MIN_POP = Number(process.argv[3] ?? 1000);
const rows = [];
for (const line of readFileSync(src, "utf8").split("\n")) {
  const f = line.split("\t");
  if (f.length < 15 || f[8] !== "US" || DROP.has(f[7])) continue;
  if (Number(f[14]) < MIN_POP) continue;
  rows.push([f[1], f[10], Number(Number(f[4]).toFixed(4)), Number(Number(f[5]).toFixed(4))]);
}
rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]) || a[2] - b[2]);
const out = "src/lib/plan/places-us.json";
writeFileSync(out, "[\n" + rows.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n");
console.log(`wrote ${rows.length} towns to ${out}`);
