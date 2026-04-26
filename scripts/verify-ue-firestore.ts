/**
 * One-off verification that Roadtripper can read city-atlas-service
 * data from the Urban Explorer named Firestore database.
 *
 * Run: npx tsx scripts/verify-ue-firestore.ts
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  CitySchema,
  NeighborhoodSchema,
  WaypointSchema,
} from "../src/lib/urban-explorer/cityAtlas";

const PROJECT_ID = "urban-explorer-483600";
const DB_ID = "urbanexplorer";
const TARGET_CITY = "las-vegas";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore(app, DB_ID);

async function main() {
  const report: Record<string, unknown> = {};

  // 1. List 5 cities
  console.log("=== STEP 1: list 5 cities ===");
  const citiesSnap = await db.collection("cities").limit(5).get();
  const cities = citiesSnap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, name: x.name, country: x.country };
  });
  console.log(JSON.stringify(cities, null, 2));
  report.connection_ok = citiesSnap.size > 0;
  report.cities_sample = cities;

  // 2. Las Vegas neighborhoods + waypoints under one
  console.log(`\n=== STEP 2: ${TARGET_CITY} neighborhoods ===`);
  const cityRef = db.collection("cities").doc(TARGET_CITY);
  const cityDoc = await cityRef.get();
  console.log(
    `city doc exists: ${cityDoc.exists}; data keys:`,
    cityDoc.exists ? Object.keys(cityDoc.data() ?? {}) : "n/a"
  );

  const nhSnap = await cityRef.collection("neighborhoods").get();
  console.log(`neighborhoods count: ${nhSnap.size}`);
  const nhSummaries = nhSnap.docs.slice(0, 5).map((d) => {
    const x = d.data();
    return {
      id: d.id,
      keys: Object.keys(x),
      name: x.name,
      city_id: x.city_id,
      lat: x.lat,
      lng: x.lng,
      trending_score: x.trending_score,
    };
  });
  console.log("first 5 neighborhood summaries:");
  console.log(JSON.stringify(nhSummaries, null, 2));

  if (nhSnap.empty) {
    console.log("no neighborhoods found — bailing on waypoint step");
    report.shape_ok = false;
    report.waypoint_count_las_vegas = 0;
    console.log("\n=== REPORT ===");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // pick the neighborhood with the most waypoints; fall back to first
  const firstNh = nhSnap.docs[0];
  const wpSnap = await cityRef
    .collection("neighborhoods")
    .doc(firstNh.id)
    .collection("waypoints")
    .get();

  console.log(
    `\nwaypoints under ${firstNh.id}: ${wpSnap.size}`
  );

  const wpSummaries = wpSnap.docs.slice(0, 3).map((d) => {
    const x = d.data();
    return {
      id: d.id,
      keys: Object.keys(x),
      city_id: x.city_id,
      neighborhood_id: x.neighborhood_id,
      type: x.type,
      lat: x.lat,
      lng: x.lng,
      source: x.source,
      enriched_at: x.enriched_at,
      name_en: x.name?.en,
    };
  });
  console.log("first 3 waypoint summaries:");
  console.log(JSON.stringify(wpSummaries, null, 2));

  // 3. Read one waypoint, confirm source: enrichment-*
  let sampleWp: FirebaseFirestore.DocumentData | undefined;
  if (wpSnap.size > 0) {
    sampleWp = wpSnap.docs[0].data();
  }
  const sourceVal = sampleWp?.source;
  const enrichmentOk =
    typeof sourceVal === "string" && sourceVal.startsWith("enrichment-");
  console.log(
    `\nsample waypoint source: ${JSON.stringify(sourceVal)} — enrichment-* match: ${enrichmentOk}`
  );

  // 4. Total waypoints across all neighborhoods for las-vegas
  console.log("\n=== STEP 4: total waypoints for las-vegas ===");
  let totalWaypoints = 0;
  const nhCounts: Array<{ nh: string; count: number }> = [];
  for (const d of nhSnap.docs) {
    const sub = await cityRef
      .collection("neighborhoods")
      .doc(d.id)
      .collection("waypoints")
      .count()
      .get();
    const c = sub.data().count;
    totalWaypoints += c;
    nhCounts.push({ nh: d.id, count: c });
  }
  console.log("per-neighborhood waypoint counts:");
  console.log(JSON.stringify(nhCounts, null, 2));

  // also try flat denorm: vibe_waypoints filtered by city
  const flatVw = await db
    .collection("vibe_waypoints")
    .where("city_id", "==", TARGET_CITY)
    .count()
    .get();
  console.log(
    `vibe_waypoints (flat) where city_id=${TARGET_CITY}: ${flatVw.data().count}`
  );

  report.shape_ok =
    nhSummaries.length > 0 &&
    wpSummaries.length > 0 &&
    typeof wpSummaries[0].lat === "number" &&
    typeof wpSummaries[0].lng === "number" &&
    typeof wpSummaries[0].name_en === "string";
  report.waypoint_source_enrichment_ok = enrichmentOk;
  report.waypoint_count_las_vegas_nested = totalWaypoints;
  report.waypoint_count_las_vegas_flat = flatVw.data().count;

  // 5. Canonical schema parse coverage — full city, every neighborhood,
  //    every waypoint. Confirms the local cityAtlas.ts copy is in sync
  //    with what the pipeline actually writes.
  console.log("\n=== STEP 5: canonical schema parse coverage ===");
  let cityParseOk = false;
  if (cityDoc.exists) {
    const r = CitySchema.safeParse({ id: cityDoc.id, ...cityDoc.data() });
    cityParseOk = r.success;
    if (!r.success) {
      console.log("city parse error:", JSON.stringify(r.error.issues, null, 2));
    }
  }

  let nhOk = 0,
    nhFail = 0;
  for (const d of nhSnap.docs) {
    const r = NeighborhoodSchema.safeParse({ id: d.id, ...d.data() });
    if (r.success) nhOk += 1;
    else {
      nhFail += 1;
      console.log(`nh ${d.id} parse error:`, JSON.stringify(r.error.issues));
    }
  }

  let wpOk = 0,
    wpFail = 0;
  for (const d of nhSnap.docs) {
    const sub = await cityRef
      .collection("neighborhoods")
      .doc(d.id)
      .collection("waypoints")
      .get();
    for (const w of sub.docs) {
      const r = WaypointSchema.safeParse({ id: w.id, ...w.data() });
      if (r.success) wpOk += 1;
      else {
        wpFail += 1;
        console.log(
          `wp ${w.id} (nh ${d.id}) parse error:`,
          JSON.stringify(r.error.issues)
        );
      }
    }
  }
  console.log(
    `parse: city=${cityParseOk} | neighborhoods ok=${nhOk} fail=${nhFail} | waypoints ok=${wpOk} fail=${wpFail}`
  );
  report.parse_city = cityParseOk;
  report.parse_neighborhoods = { ok: nhOk, fail: nhFail };
  report.parse_waypoints = { ok: wpOk, fail: wpFail };

  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
