/**
 * Decode a Google encoded polyline into an array of lat/lng points.
 * Uses the same algorithm as Google's polyline encoding spec.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const MAX_DECODED_VERTICES = 10_000;

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    if (points.length >= MAX_DECODED_VERTICES) {
      throw new Error(
        `Polyline exceeds maximum decoded vertices (${MAX_DECODED_VERTICES})`
      );
    }

    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }

  return points;
}

/**
 * Sample the polyline at approximately the requested interval (km).
 * Interpolates new points along long segments rather than snapping to
 * the next vertex — this is critical for highway runs where vertices
 * are sparse and a 200km segment would otherwise produce only 2 samples.
 */
export function samplePolyline(points: LatLng[], intervalKm: number): LatLng[] {
  if (points.length <= 1) return points.slice();

  const sampled: LatLng[] = [points[0]];
  let distanceSinceLastSample = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segmentLength = haversineKm(a, b);

    if (segmentLength === 0) continue;

    let remaining = segmentLength;
    let cursorFraction = 0; // 0..1 along the segment

    while (distanceSinceLastSample + remaining >= intervalKm) {
      const needed = intervalKm - distanceSinceLastSample;
      const stepFraction = needed / segmentLength;
      cursorFraction += stepFraction;

      // Linear interpolation in lat/lng — close enough at sub-50km scale
      sampled.push({
        lat: a.lat + (b.lat - a.lat) * cursorFraction,
        lng: a.lng + (b.lng - a.lng) * cursorFraction,
      });

      remaining -= needed;
      distanceSinceLastSample = 0;
    }

    distanceSinceLastSample += remaining;
  }

  // Always include the final point
  const last = points[points.length - 1];
  const lastSampled = sampled[sampled.length - 1];
  if (last.lat !== lastSampled.lat || last.lng !== lastSampled.lng) {
    sampled.push(last);
  }

  return sampled;
}

/**
 * Haversine distance in kilometers between two lat/lng points.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aVal =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

/**
 * Project a target point onto a polyline. Returns the closest point on
 * any segment of the line and the distance to it. Used after the
 * geometric pre-filter to refine `nearestRoutePoint` so it lands on
 * the actual route, not just the nearest sample.
 *
 * Uses planar projection in lat/lng space — accurate enough at the
 * sub-100km scale we operate at, much cheaper than great-circle math.
 */
export function projectOntoPolyline(
  target: LatLng,
  polyline: LatLng[]
): { point: LatLng; distanceKm: number } {
  if (polyline.length === 0) {
    throw new Error("Cannot project onto empty polyline");
  }
  if (polyline.length === 1) {
    return { point: polyline[0], distanceKm: haversineKm(polyline[0], target) };
  }

  let bestPoint = polyline[0];
  let bestDistance = Infinity;

  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1];
    const b = polyline[i];

    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;

    let t: number;
    if (lenSq === 0) {
      t = 0;
    } else {
      t = ((target.lng - a.lng) * dx + (target.lat - a.lat) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projected: LatLng = {
      lat: a.lat + dy * t,
      lng: a.lng + dx * t,
    };
    const d = haversineKm(target, projected);
    if (d < bestDistance) {
      bestDistance = d;
      bestPoint = projected;
    }
  }

  return { point: bestPoint, distanceKm: bestDistance };
}
