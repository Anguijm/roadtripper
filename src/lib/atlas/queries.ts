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

function safeWaypointType(v: string) {
  const parsed = WaypointTypeSchema.safeParse(v);
  if (parsed.success) return parsed.data;
  console.warn(`[atlas] unknown waypoint type ${JSON.stringify(v)}, treating as ${FALLBACK_TYPE}`);
  return FALLBACK_TYPE;
}

function safeCityTier(v: string | null) {
  const parsed = CityTierSchema.safeParse(v);
  return parsed.success ? parsed.data : FALLBACK_TIER;
}

/**
 * R1 #4: every id becomes one bound parameter. SQLite's compiled limit is far
 * above anything this app produces (callers cap at MAX_WAYPOINT_CITIES = 10),
 * but the bound is asserted here so the guarantee lives next to the query
 * rather than in a constant two files away.
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
  // R1 #5: a locked or truncated file throws here. Cities drive the whole plan
  // page, so an empty list renders "no candidates" rather than an error page,
  // which is the same graceful degradation the Firestore path had.
  let rows: CityRow[];
  try {
    rows = atlasDb()
      .prepare<[], CityRow>(
        `select id, name, country, region, tier, vibe_class, lat, lng from cities`
      )
      .all();
  } catch (err) {
    console.error("[atlas] city read failed:", err);
    return [];
  }
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
