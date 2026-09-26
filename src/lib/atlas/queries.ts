import "server-only";
import { atlasDb } from "./db";
import type { City } from "@/lib/urban-explorer/cityAtlas";
import type { LiteWaypoint } from "@/lib/routing/scoring";
import type { NeighborhoodLite } from "@/lib/urban-explorer/types";
import { WaypointTypeSchema, CityTierSchema } from "@/lib/urban-explorer/cityAtlas";

/**
 * R1 #2: the atlas is produced by our own export, but "our own" is not the same
 * as "guaranteed in step with this code". If the upstream pipeline adds a
 * waypoint type and the atlas is re-exported before this app is redeployed, an
 * unvalidated cast would put an unknown string into code that switches on the
 * enum, and the failure would surface as a scoring oddity rather than an error.
 * These narrow at the boundary and fall back to the value the rest of the app
 * treats as "nothing special".
 */
const FALLBACK_TYPE = "landmark" as const;
const FALLBACK_TIER = "tier3" as const;

// `unknown` rather than `string`: the column is NOT NULL, but the point of this
// helper is to survive the atlas disagreeing with this code, and a null or
// missing value is one way it could. `safeParse` rejects anything that is not
// one of the enum strings, so widening the input costs nothing.
function safeWaypointType(v: unknown) {
  const parsed = WaypointTypeSchema.safeParse(v);
  if (parsed.success) return parsed.data;
  console.warn(`[atlas] unknown waypoint type ${JSON.stringify(v)}, treating as ${FALLBACK_TYPE}`);
  return FALLBACK_TYPE;
}

function safeCityTier(v: unknown) {
  const parsed = CityTierSchema.safeParse(v);
  if (parsed.success) return parsed.data;
  // Same treatment as waypoint types: a tier this code does not know is a sign
  // the upstream pipeline moved before this app was redeployed, and that is
  // worth one line in the logs rather than a silent downgrade to tier3.
  console.warn(`[atlas] unknown city tier ${JSON.stringify(v)}, treating as ${FALLBACK_TIER}`);
  return FALLBACK_TIER;
}

/**
 * R1 #4: every id becomes one bound parameter. SQLite's compiled limit is far
 * above anything this app produces: the only caller caps at
 * `MAX_WAYPOINT_CITIES = 10`, defined in `src/lib/routing/recommend.ts`. The
 * bound is asserted here anyway so the guarantee lives next to the query rather
 * than in a constant in another file that could be raised without anyone
 * looking here.
 *
 * If you raise this: SQLite's own ceiling is SQLITE_MAX_VARIABLE_NUMBER (32,766
 * in the bundled build), so anything under a few thousand is safe; raise
 * MAX_WAYPOINT_CITIES in recommend.ts and this together; and extend the
 * "several cities at once" case in src/lib/atlas/__tests__/queries.test.ts,
 * which is the test that would catch the two drifting apart.
 */
const MAX_BOUND_CITY_IDS = 100;

/**
 * Every query the app needs against the local atlas.
 *
 * Rows come back already shaped like the types the rest of the app used when
 * this data arrived from Firestore, so callers upstream did not have to change
 * shape when the source did.
 */

interface CityRow {
  id: string; name: string; country: string | null; region: string | null;
  tier: string | null; vibe_class: string | null; lat: number; lng: number;
}

/** All cities. 277 rows, so there is no reason to filter in SQL. */
export function allCities(): City[] {
  // Deliberately NOT wrapped in try/catch. Round 3 asked for one so a locked
  // file would degrade to "no candidates"; round 4 pointed out that this masks
  // a broken atlas as an empty result, which is worse. The caller that matters
  // (`findCitiesInRadius`, invoked under `Promise.allSettled` in the plan page)
  // already turns a rejection into a visible "couldn't load candidates" state,
  // so letting this throw reaches the user as an honest failure rather than a
  // silently empty map.
  const rows = atlasDb()
    .prepare<[], CityRow>(
      `select id, name, country, region, tier, vibe_class, lat, lng from cities`
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country ?? "",
    region: r.region ?? "",
    tier: safeCityTier(r.tier),
    lat: r.lat,
    lng: r.lng,
    ...(r.vibe_class ? { vibeClass: r.vibe_class as NonNullable<City["vibeClass"]> } : {}),
  }));
}

interface WaypointRow {
  id: string; city_id: string; neighborhood_id: string | null;
  name: string; description: string | null; type: string;
  lat: number; lng: number; trending_score: number | null;
}

const toLite = (r: WaypointRow): LiteWaypoint & { description: string | null; lat: number; lng: number } => ({
  id: r.id,
  cityId: r.city_id,
  name: r.name,
  type: safeWaypointType(r.type),
  trendingScore: r.trending_score ?? 0,
  neighborhoodId: r.neighborhood_id,
  // Untrusted. Generated upstream by Gemini in city-atlas-service, not written
  // by anyone here. It must only ever be rendered as text: no
  // dangerouslySetInnerHTML, no markdown-to-HTML, no template interpolation
  // into markup. CLAUDE.md and the council's security persona both enforce
  // this at review time; this comment is so the next reader knows why.
  description: r.description,
  lat: r.lat,
  lng: r.lng,
});

/**
 * Waypoints for a set of cities. Replaces the Firestore `where city_id in [...]`
 * query, which was capped at 10 cities by Firestore's `in` limit; SQLite has no
 * such cap, so the caller's own limit is the only one left.
 */
export function waypointsForCities(cityIds: readonly string[]) {
  if (cityIds.length === 0) return [];
  if (cityIds.length > MAX_BOUND_CITY_IDS) {
    throw new Error(
      `waypointsForCities called with ${cityIds.length} ids, above the ${MAX_BOUND_CITY_IDS} bound-parameter ceiling`
    );
  }
  const holes = cityIds.map(() => "?").join(",");
  return atlasDb()
    .prepare<string[], WaypointRow>(
      `select id, city_id, neighborhood_id, name, description, type, lat, lng, trending_score
         from waypoints where city_id in (${holes})`
    )
    .all(...cityIds)
    .map(toLite);
}

/**
 * Waypoints inside a bounding box, via the R-tree. This is the query Firestore
 * could not answer and the reason the atlas moved here: stage 4 walks a route
 * polyline and asks this for each segment.
 */
export function waypointsInBox(minLng: number, maxLng: number, minLat: number, maxLat: number) {
  return atlasDb()
    .prepare<[number, number, number, number], WaypointRow>(
      `select w.id, w.city_id, w.neighborhood_id, w.name, w.description, w.type,
              w.lat, w.lng, w.trending_score
         from waypoint_rtree r
         join waypoints w on w.rowid = r.rowid
        where r.minLng >= ? and r.maxLng <= ? and r.minLat >= ? and r.maxLat <= ?`
    )
    .all(minLng, maxLng, minLat, maxLat)
    .map(toLite);
}

interface NeighborhoodRow {
  id: string; name: string; summary: string | null; trending_score: number | null;
}

/** Neighborhoods for one city, richest first. */
export function neighborhoodsForCity(cityId: string, limit: number): NeighborhoodLite[] {
  return atlasDb()
    .prepare<[string, number], NeighborhoodRow>(
      `select id, name, summary, trending_score from neighborhoods
        where city_id = ? order by trending_score desc limit ?`
    )
    .all(cityId, limit)
    .map((r) => ({
      id: r.id,
      name: { en: r.name },
      ...(r.summary ? { summary: { en: r.summary } } : {}),
      trending_score: r.trending_score ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// Drive-time graph
//
// Built by scripts/build-drive-graph.mjs. Replaces a live route-matrix call
// that cost $0.25 per cache-cold plan load and made the app useless without a
// signal, which on a road trip is exactly when it is needed.
// ---------------------------------------------------------------------------

/**
 * How far an arbitrary point may be from an atlas city and still be treated as
 * that city for graph purposes.
 *
 * 40 km is roughly a metro's outer edge. The error this introduces is the drive
 * from where you really are to that city centre, which at a day's-drive scale
 * is small; but it IS an error, so `snapToCity` returns the distance and lets
 * the caller decide rather than hiding it.
 */
export const SNAP_RADIUS_KM = 40;

const EARTH_KM = 6371;
const rad = (x: number) => (x * Math.PI) / 180;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  // h is mathematically in [0, 1] but floating point can nudge it just past 1
  // for antipodal-ish points, and asin(>1) is NaN. A NaN distance would make
  // every comparison in snapToCity false and silently return null.
  return 2 * EARTH_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** The atlas city nearest a point, if one is close enough to stand in for it. */
export function snapToCity(
  point: { lat: number; lng: number },
  maxKm: number = SNAP_RADIUS_KM
): { city: City; distanceKm: number } | null {
  let best: { city: City; distanceKm: number } | null = null;
  for (const c of allCities()) {
    const d = haversineKm(point, c);
    if (d <= maxKm && (best === null || d < best.distanceKm)) best = { city: c, distanceKm: d };
  }
  return best;
}

export interface DriveTimeRow {
  cityId: string;
  minutes: number;
  meters: number | null;
}

/**
 * Cities reachable from `fromCityId` within `maxMinutes`, nearest first.
 *
 * Returns an empty array both when the city has no graph rows and when nothing
 * is in range. Those mean different things, so `hasDriveGraphFor` exists to
 * tell them apart: the first is missing data and should fall back to the API,
 * the second is a real answer.
 */
export function driveTimesFrom(fromCityId: string, maxMinutes: number): DriveTimeRow[] {
  // Throws on a broken or locked atlas. It used to catch and return [], which
  // the caller could not tell apart from "nothing within range", so a database
  // error became a confident empty map with no API fallback. The caller's job
  // is to turn a throw into a miss; this function's job is not to hide it.
  return atlasDb()
    .prepare<[string, number], { to_city_id: string; minutes: number; meters: number | null }>(
      `select to_city_id, minutes, meters from city_drive_times
        where from_city_id = ? and minutes <= ? order by minutes asc`
    )
    .all(fromCityId, maxMinutes)
    .map((r) => ({ cityId: r.to_city_id, minutes: r.minutes, meters: r.meters }));
}

/** Whether the graph knows anything at all about this city. */
export function hasDriveGraphFor(cityId: string): boolean {
  try {
    const row = atlasDb()
      .prepare<[string], { c: number }>(
        `select count(*) c from city_drive_times where from_city_id = ? limit 1`
      )
      .get(cityId);
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Provenance, so a caller (or a human) can see what built the graph and how
 *  well the calibration held up on data it did not learn from. */
export function driveGraphInfo(): {
  provider: string | null;
  factor: number | null;
  heldOutMeanPct: number | null;
  builtAt: string | null;
  rows: number;
} {
  try {
    const db = atlasDb();
    const meta = (k: string) =>
      db.prepare<[string], { value: string }>("select value from meta where key = ?").get(k)?.value ?? null;
    const rows = db.prepare<[], { c: number }>("select count(*) c from city_drive_times").get()?.c ?? 0;
    const f = meta("drive_graph_factor");
    const h = meta("drive_graph_heldout_mean_pct");
    return {
      provider: meta("drive_graph_provider"),
      factor: f === null ? null : Number(f),
      heldOutMeanPct: h === null ? null : Number(h),
      builtAt: meta("drive_graph_built_at"),
      rows,
    };
  } catch {
    return { provider: null, factor: null, heldOutMeanPct: null, builtAt: null, rows: 0 };
  }
}
