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
