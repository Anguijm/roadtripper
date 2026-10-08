/**
 * Towns that can name where a cut day ends (Gauntlet U19). The atlas names
 * a cut only when one of its towns is within NEAR_CUT_KM, and on 9,064
 * measured day ends that was 13 %: the atlas is curated cities, a few
 * hundred across the country. A plain list of US places (GeoNames, CC BY
 * 4.0; `scripts/build-places.mjs`) names far more: 72 % at 5,000 people or
 * more (U19), 89 % at 1,000 or more (U36, the operator's choice, measured
 * on the same 9,414 day ends). The list only names; the towns that fit,
 * with their places, stay the atlas.
 *
 * Pure: the route and the list in, the towns on the road out. The plan
 * page calls `placesForRoute` once per render, on the server, so the
 * client gets the few dozen towns near its road and never the list.
 */
import "server-only";
import { projectOntoPolyline, decodePolyline, type LatLng } from "@/lib/routing/polyline";
import { corridorTiles } from "@/lib/roadside/corridor";
import { ON_ROAD_KM, type NamedPoint } from "@/lib/roadside/anchor";
import PLACES from "./places-us.json";

/** One row of the list: name, state, latitude, longitude. */
export type PlaceRow = readonly [string, string, number, number];

/**
 * The towns within `bufferKm` of the route, each once. The tiles' padded
 * boxes find the few candidates near each stretch, so a town is projected
 * onto a 25 km stretch and not onto the whole route: 7,000 towns against
 * an 800 km road is a few thousand projections, not millions.
 */
export function placesNearRoute(route: readonly LatLng[], places: readonly PlaceRow[], bufferKm = ON_ROAD_KM): NamedPoint[] {
  if (route.length < 2) return [];
  const tiles = corridorTiles(route as LatLng[], { bufferKm });
  const out = new Map<number, NamedPoint>();
  for (const tile of tiles) {
    const { minLat, maxLat, minLng, maxLng } = tile.box;
    for (let i = 0; i < places.length; i++) {
      if (out.has(i)) continue;
      const [name, , lat, lng] = places[i];
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
      if (projectOntoPolyline({ lat, lng }, tile.points).distanceKm <= bufferKm) out.set(i, { name, lat, lng });
    }
  }
  return [...out.values()];
}

/** The towns on an encoded route's road, from the bundled list; none for a route that will not decode. */
export function placesForRoute(encodedPolyline: string): NamedPoint[] {
  try {
    return placesNearRoute(decodePolyline(encodedPolyline), PLACES as unknown as PlaceRow[]);
  } catch {
    return [];
  }
}
