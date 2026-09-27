/**
 * The corridor query (step 17): the thing Urban Explorer structurally
 * cannot do. Take the route's polyline, cut it into tiles, pad each tile's
 * bounding box by the buffer, and ask a source for everything in each box.
 * Then keep only what is truly within the buffer of the line, since a box
 * around a diagonal stretch of road holds a lot of land that is not near
 * the road.
 *
 * Pure geometry. No source is called here.
 */

import { haversineKm, projectOntoPolyline, type LatLng } from "@/lib/routing/polyline";

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface CorridorTile {
  /** The stretch of route this tile covers, in km from the start. */
  fromKm: number;
  toKm: number;
  /** The route points inside the tile. */
  points: LatLng[];
  /** Their bounding box, padded by the buffer. */
  box: BoundingBox;
}

/** Route per tile. Smaller tiles mean more, smaller Overpass queries. */
export const DEFAULT_TILE_KM = 25;
/** How far from the road a stop can be and still count. */
export const DEFAULT_BUFFER_KM = 10;

const KM_PER_DEG_LAT = 111.32;

/** A box around `points`, grown by `padKm` on every side. */
export function paddedBox(points: LatLng[], padKm: number): BoundingBox {
  if (points.length === 0) throw new Error("paddedBox needs at least one point");
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const midLat = (minLat + maxLat) / 2;
  const dLat = padKm / KM_PER_DEG_LAT;
  // Longitude degrees shrink with latitude; pad by the widest the box needs.
  const dLng = padKm / (KM_PER_DEG_LAT * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return {
    minLat: Math.max(-90, minLat - dLat),
    maxLat: Math.min(90, maxLat + dLat),
    minLng: Math.max(-180, minLng - dLng),
    maxLng: Math.min(180, maxLng + dLng),
  };
}

/**
 * Cut the route into tiles of at most `tileKm` of route each. Consecutive
 * tiles share their boundary point, so nothing between two points falls in
 * a gap. Every point within `bufferKm` of the route is inside at least one
 * tile's box (the box is the padded hull of the tile's points, and the
 * route between two points is inside their hull).
 */
export function corridorTiles(
  route: LatLng[],
  opts: { tileKm?: number; bufferKm?: number } = {}
): CorridorTile[] {
  const tileKm = opts.tileKm ?? DEFAULT_TILE_KM;
  const bufferKm = opts.bufferKm ?? DEFAULT_BUFFER_KM;
  if (!(tileKm > 0) || !(bufferKm >= 0)) throw new Error("tileKm must be positive and bufferKm non-negative");
  if (route.length === 0) return [];
  if (route.length === 1) return [{ fromKm: 0, toKm: 0, points: [route[0]], box: paddedBox(route, bufferKm) }];

  const tiles: CorridorTile[] = [];
  let tilePoints: LatLng[] = [route[0]];
  let tileStartKm = 0;
  let km = 0;
  for (let i = 1; i < route.length; i++) {
    km += haversineKm(route[i - 1], route[i]);
    tilePoints.push(route[i]);
    if (km - tileStartKm >= tileKm && i < route.length - 1) {
      tiles.push({ fromKm: tileStartKm, toKm: km, points: tilePoints, box: paddedBox(tilePoints, bufferKm) });
      tilePoints = [route[i]];  // shared boundary point
      tileStartKm = km;
    }
  }
  tiles.push({ fromKm: tileStartKm, toKm: km, points: tilePoints, box: paddedBox(tilePoints, bufferKm) });
  return tiles;
}

/** True when the point is within `bufferKm` of the route itself, not just of a box. */
export function withinCorridor(point: LatLng, route: LatLng[], bufferKm: number = DEFAULT_BUFFER_KM): boolean {
  if (route.length === 0) return false;
  return projectOntoPolyline(point, route).distanceKm <= bufferKm;
}
