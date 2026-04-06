/**
 * Decode a Google encoded polyline into an array of lat/lng points.
 * Uses the same algorithm as Google's polyline encoding spec.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
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
 * Sample the decoded polyline at approximately the requested interval (km).
 * Always includes the first and last points.
 */
export function samplePolyline(points: LatLng[], intervalKm: number): LatLng[] {
  if (points.length <= 1) return points;

  const sampled: LatLng[] = [points[0]];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const segment = haversineKm(points[i - 1], points[i]);
    accumulated += segment;
    if (accumulated >= intervalKm) {
      sampled.push(points[i]);
      accumulated = 0;
    }
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
