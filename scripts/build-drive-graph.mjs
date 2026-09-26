/**
 * Build the city-to-city drive-time graph into the atlas.
 *
 * Why this exists: every plan load used to call Google's route matrix with up
 * to 50 destinations, costing $0.25 and a network round trip, to recompute
 * numbers that barely change year to year. Worse, it meant the app could not
 * suggest anywhere without a signal, which is the one thing a road trip app
 * must survive.
 *
 * Calibration, not blind trust. OSM-derived times measured 18.3% slower than
 * Google across 20 spread pairs, consistently in one direction. A consistent
 * one-way gap is a bias, and bias is correctable. This samples pairs against
 * Google, derives the factor, checks it on a HELD-OUT sample it did not learn
 * from, and stores the factor with the data. Re-derived every rebuild, never
 * hardcoded, because the number belongs to a dataset and not to a person's
 * memory of one afternoon.
 *
 *   bun run atlas:drive-graph                 # full build via ORS
 *   bun run atlas:drive-graph -- --provider=google
 *   bun run atlas:drive-graph -- --limit=10   # first 10 cities, for a dry run
 *   bun run atlas:drive-graph -- --calibrate-only
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { openRouteService, googleRoutes, sleep } from "./lib/routing-providers.mjs";

// ---------------------------------------------------------------------------
// Knobs
// ---------------------------------------------------------------------------

/** Straight-line radius that defines "within a day's drive". 650 km is about
 *  7.2 hours at highway speed, comfortably past the 8h maximum daily budget the
 *  UI offers once road circuity is accounted for. */
const NEIGHBOUR_RADIUS_KM = 650;

/** Destinations per matrix request. ORS allows 3,500 pairs; this stays well
 *  under so one city is always a single request. */
const BATCH = 60;

/** Pairs sampled against Google to derive the factor, and again to test it. */
const CALIBRATION_PAIRS = 24;
const HELDOUT_PAIRS = 12;

/** The bar the held-out check must clear, from the ship rule. */
const HELDOUT_TOLERANCE_PCT = 10;

const ATLAS = process.env.ATLAS_PATH ?? "data/atlas.sqlite";

// ---------------------------------------------------------------------------

const args = new Map(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

function env() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}
const E = { ...env(), ...process.env };

const haversineKm = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const median = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Deterministic shuffle so a rerun samples the same pairs and the calibration
 *  is reproducible. Math.random would make two runs incomparable. */
function seededPick(items, n, seed = 1337) {
  let s = seed;
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ---------------------------------------------------------------------------

const db = new Database(ATLAS);
db.pragma("journal_mode = WAL");

// Self-sufficient: an atlas exported before this table existed is still a valid
// target. The definition is duplicated from export-atlas.mjs on purpose, so this
// script never depends on the order the two were last run in.
db.exec(`
  create table if not exists city_drive_times (
    from_city_id text not null,
    to_city_id   text not null,
    minutes      real not null,
    meters       real,
    primary key (from_city_id, to_city_id)
  );
  create index if not exists cdt_from on city_drive_times(from_city_id, minutes);
  create table if not exists meta (key text primary key, value text not null);
`);

const cities = db.prepare(
  `select id, name, lat, lng from cities
    where lat between 24 and 50 and lng between -125 and -66`
).all();
console.log(`continental US cities in atlas: ${cities.length}`);

// ---------------------------------------------------------------------------
// Resume by default.
//
// The free ORS tier ran out of matrix quota 13 cities into the first full build
// (172 of 5,132 pairs), so a build has to survive being run across several
// days, or being finished by a different provider. Two rules follow:
//
//   1. Never fetch a pair the table already holds. Quota and money are spent
//      once per pair, full stop.
//   2. Never recalibrate on resume. Each stored minute was divided by ONE
//      factor; a second calibration yields a slightly different one and the
//      graph would then be internally inconsistent. The stored factor is
//      reused. `--fresh` wipes rows and meta and starts over.
// ---------------------------------------------------------------------------
const fresh = args.has("fresh");
if (fresh) {
  db.exec("delete from city_drive_times; delete from meta where key like 'drive_graph%'");
  console.log("  --fresh: cleared existing graph and calibration");
}
const existingPairs = new Set(
  db.prepare("select from_city_id || '|' || to_city_id k from city_drive_times").all().map((r) => r.k)
);
const storedFactor = db.prepare("select value from meta where key = 'drive_graph_factor'").get()?.value;
const storedHeldOut = db.prepare("select value from meta where key = 'drive_graph_heldout_mean_pct'").get()?.value;
const resuming = existingPairs.size > 0 && storedFactor !== undefined;
if (resuming) {
  console.log(`  resuming: ${existingPairs.size} pairs already present, factor ${Number(storedFactor).toFixed(4)} reused`);
}

const limit = args.has("limit") ? parseInt(args.get("limit"), 10) : cities.length;
const working = cities.slice(0, limit);

/** Every directed pair inside the radius. */
const neighboursOf = (c) =>
  cities.filter((o) => o.id !== c.id && haversineKm(c, o) <= NEIGHBOUR_RADIUS_KM);

const plan = working
  .map((c) => ({
    city: c,
    neighbours: neighboursOf(c).filter((n) => !existingPairs.has(`${c.id}|${n.id}`)),
  }))
  .filter((p) => p.neighbours.length > 0);
const totalPairs = plan.reduce((s, p) => s + p.neighbours.length, 0);
const requests = plan.reduce((s, p) => s + Math.ceil(p.neighbours.length / BATCH), 0);
console.log(`  ${totalPairs} directed pairs within ${NEIGHBOUR_RADIUS_KM} km, ${requests} matrix requests`);

const providerName = args.get("provider") ?? "ors";
const provider = providerName === "google"
  ? googleRoutes(E.GOOGLE_MAPS_KEY)
  : openRouteService(E.ORS_API_KEY);
const reference = googleRoutes(E.GOOGLE_MAPS_KEY);
console.log(`  provider: ${provider.name}`);

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/** Ask both providers about the same pairs and return their ratio per pair. */
async function ratiosFor(pairs) {
  const out = [];
  for (const [from, to] of pairs) {
    try {
      const [mine] = await provider.durationsFromOne(from, [to]);
      await sleep(provider.pauseMs);
      const [ref] = await reference.durationsFromOne(from, [to]);
      await sleep(reference.pauseMs);
      if (mine && ref && ref.minutes > 0) {
        out.push({ from: from.name, to: to.name, mine: mine.minutes, ref: ref.minutes, ratio: mine.minutes / ref.minutes });
      }
    } catch (err) {
      console.warn(`  calibration pair ${from.name} -> ${to.name} failed: ${String(err.message).slice(0, 120)}`);
    }
  }
  return out;
}

async function calibrate() {
  // The reference provider needs no correction, ever. Checked first so a resume
  // that finishes an ORS-started graph through Google does not divide Google's
  // own times by ORS's factor. Every row must end up Google-equivalent; that is
  // what makes rows from two providers safe to sit in one table.
  if (provider.name === reference.name) {
    console.log("\ncalibration skipped: provider is the reference");
    return { factor: 1, heldOutMeanPct: 0, sampled: 0 };
  }
  if (resuming) {
    const storedProvider = db.prepare("select value from meta where key = 'drive_graph_provider'").get()?.value;
    if (storedProvider !== provider.name) {
      throw new Error(
        `stored factor ${Number(storedFactor).toFixed(4)} was derived for ${storedProvider}, not ${provider.name}. ` +
        `Refusing to apply one provider's correction to another's times. Use --fresh or the original provider.`
      );
    }
    console.log(`\ncalibration reused from the existing graph: factor ${Number(storedFactor).toFixed(4)}, held-out ${storedHeldOut}%`);
    return { factor: Number(storedFactor), heldOutMeanPct: Number(storedHeldOut ?? 0), sampled: 0 };
  }
  const allPairs = plan.flatMap((p) => p.neighbours.map((n) => [p.city, n]));
  const picked = seededPick(allPairs, CALIBRATION_PAIRS + HELDOUT_PAIRS);
  const fit = picked.slice(0, CALIBRATION_PAIRS);
  const heldOut = picked.slice(CALIBRATION_PAIRS);

  console.log(`\ncalibrating on ${fit.length} pairs, holding out ${heldOut.length}`);
  const fitRatios = await ratiosFor(fit);
  if (fitRatios.length === 0) throw new Error("calibration produced no usable pairs");
  // Median, not mean: one unroutable outlier should not move the factor.
  const factor = median(fitRatios.map((r) => r.ratio));
  console.log(`  factor ${factor.toFixed(4)} (provider is ${((factor - 1) * 100).toFixed(1)}% slower than reference)`);

  const heldRatios = await ratiosFor(heldOut);
  const errs = heldRatios.map((r) => Math.abs(r.mine / factor - r.ref) / r.ref * 100);
  const meanPct = errs.reduce((s, x) => s + x, 0) / (errs.length || 1);
  console.log(`  held-out check on ${errs.length} pairs it did not learn from:`);
  console.log(`    mean ${meanPct.toFixed(1)}%  median ${median(errs).toFixed(1)}%  worst ${Math.max(...errs).toFixed(1)}%`);
  console.log(`    within ${HELDOUT_TOLERANCE_PCT}%: ${errs.filter((e) => e <= HELDOUT_TOLERANCE_PCT).length}/${errs.length}`);
  if (meanPct > HELDOUT_TOLERANCE_PCT) {
    throw new Error(
      `held-out mean error ${meanPct.toFixed(1)}% exceeds the ${HELDOUT_TOLERANCE_PCT}% bar. ` +
      `A single global factor is the wrong model for this data. Refusing to publish a graph that is quietly wrong.`
    );
  }
  return { factor, heldOutMeanPct: meanPct, sampled: fitRatios.length };
}

// ---------------------------------------------------------------------------

const { factor, heldOutMeanPct, sampled } = await calibrate();
if (args.has("calibrate-only")) { db.close(); process.exit(0); }

const ins = db.prepare(
  `insert or replace into city_drive_times (from_city_id, to_city_id, minutes, meters) values (?,?,?,?)`
);
const writeBatch = db.transaction((rows) => { for (const r of rows) ins.run(...r); });

let done = 0, written = 0, unroutable = 0, failedRequests = 0;
const t0 = Date.now();

for (const { city, neighbours } of plan) {
  for (let i = 0; i < neighbours.length; i += BATCH) {
    const chunk = neighbours.slice(i, i + BATCH);
    try {
      const res = await provider.durationsFromOne(city, chunk);
      const rows = [];
      res.forEach((r, j) => {
        if (!r) { unroutable++; return; }
        rows.push([city.id, chunk[j].id, r.minutes / factor, r.meters]);
      });
      writeBatch(rows);
      written += rows.length;
    } catch (err) {
      failedRequests++;
      console.warn(`  ${city.name} batch failed: ${String(err.message).slice(0, 140)}`);
    }
    await sleep(provider.pauseMs);
  }
  done++;
  if (done % 10 === 0 || done === plan.length) {
    const pct = ((done / plan.length) * 100).toFixed(0);
    console.log(`  ${done}/${plan.length} cities (${pct}%), ${written} pairs written, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}

if (!resuming) {
db.prepare(`insert or replace into meta values (?,?)`).run("drive_graph_provider", provider.name);
db.prepare(`insert or replace into meta values (?,?)`).run("drive_graph_factor", String(factor));
db.prepare(`insert or replace into meta values (?,?)`).run("drive_graph_heldout_mean_pct", heldOutMeanPct.toFixed(2));
db.prepare(`insert or replace into meta values (?,?)`).run("drive_graph_built_at", new Date().toISOString());
}
db.prepare(`insert or replace into meta values (?,?)`).run("drive_graph_last_run_at", new Date().toISOString());

// Coverage, reported rather than assumed. A missing pair is a city that simply
// never gets offered, which is silent unless someone counts.
const have = db.prepare(`select count(*) c from city_drive_times`).get().c;
// Coverage is against the FULL graph, not this run's slice, so a resumed build
// reports where the whole thing stands rather than how the last hour went.
const fullPairs = cities.reduce((n, c) => n + neighboursOf(c).length, 0);
const coverage = fullPairs === 0 ? 0 : (have / fullPairs) * 100;
console.log(`\ndrive graph: ${have} rows in the atlas`);
console.log(`  coverage ${have}/${fullPairs} pairs (${coverage.toFixed(1)}%), ${written} written this run`);
console.log(`  unroutable ${unroutable}, failed requests ${failedRequests}`);
console.log(`  calibration factor ${factor.toFixed(4)} from ${sampled} pairs, held-out mean error ${heldOutMeanPct.toFixed(1)}%`);
db.pragma("wal_checkpoint(TRUNCATE)");
db.close();
process.exit(failedRequests > 0 ? 1 : 0);
