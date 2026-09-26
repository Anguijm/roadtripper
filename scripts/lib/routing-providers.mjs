/**
 * Routing providers for the drive-time graph build.
 *
 * Two exist because they answer to different constraints. OpenRouteService is
 * free and its daily allowance comfortably covers a full rebuild, so it is the
 * default. Google is accurate, costs half a cent per pair, and is the reference
 * the calibration is measured against.
 *
 * Both expose the same shape: given origins and destinations, return a matrix
 * of minutes. Neither knows anything about cities or the atlas.
 */

/**
 * Pacing between requests, per provider. These are courtesy and per-minute
 * limits, NOT the daily quota.
 *
 * ORS: 1500 ms is 40 requests a minute, the documented per-minute ceiling for
 * the matrix endpoint. The daily matrix quota is a separate, much smaller
 * number that is not published; a full build hit it after 13 cities on
 * 2026-09-26. Pacing cannot help with that, only resuming across days can.
 * (An earlier version of this comment cited "2,500 requests/day"; that is the
 * general figure and does not apply to matrix.)
 *
 * Google: 120 ms keeps calibration under Google's default 600 elements per
 * minute with room to spare, and Google bills per element regardless of pace,
 * so there is nothing to gain by going faster.
 */
const ORS_PAUSE_MS = 1500;
const GOOGLE_PAUSE_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenRouteService matrix. One request covers up to 3,500 origin-destination
 * pairs, so a city and its neighbours fit comfortably in one call.
 *
 * `sources` and `destinations` index into a single `locations` array, which is
 * why the origin is prepended and referenced as index 0.
 */
export function openRouteService(apiKey) {
  if (!apiKey) throw new Error("ORS_API_KEY is not set");
  return {
    name: "openrouteservice",
    pauseMs: ORS_PAUSE_MS,
    /** @returns {Promise<Array<{minutes:number, meters:number|null}|null>>} */
    async durationsFromOne(origin, destinations) {
      const locations = [[origin.lng, origin.lat], ...destinations.map((d) => [d.lng, d.lat])];
      const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations,
          sources: [0],
          destinations: destinations.map((_, i) => i + 1),
          metrics: ["duration", "distance"],
          units: "m",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`ORS ${res.status}: ${body.slice(0, 300)}`);
      }
      const json = await res.json();
      const durations = json.durations?.[0] ?? [];
      const distances = json.distances?.[0] ?? [];
      return destinations.map((_, i) => {
        const secs = durations[i];
        // ORS returns null for a pair it cannot route (an island, a bad snap).
        if (typeof secs !== "number") return null;
        return { minutes: secs / 60, meters: typeof distances[i] === "number" ? distances[i] : null };
      });
    },
  };
}

/**
 * Google Route Matrix. Billed per element, so this is used for calibration and
 * spot checks rather than the full build.
 */
export function googleRoutes(apiKey) {
  if (!apiKey) throw new Error("GOOGLE_MAPS_KEY is not set");
  return {
    name: "google",
    pauseMs: GOOGLE_PAUSE_MS,
    async durationsFromOne(origin, destinations) {
      const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
        },
        body: JSON.stringify({
          origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
          destinations: destinations.map((d) => ({
            waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
          })),
          travelMode: "DRIVE",
        }),
      });
      if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const rows = await res.json();
      const out = destinations.map(() => null);
      for (const el of Array.isArray(rows) ? rows : []) {
        if (el.condition !== "ROUTE_EXISTS" || typeof el.destinationIndex !== "number") continue;
        const secs = parseFloat(String(el.duration).replace("s", ""));
        if (!Number.isFinite(secs)) continue;
        out[el.destinationIndex] = {
          minutes: secs / 60,
          meters: typeof el.distanceMeters === "number" ? el.distanceMeters : null,
        };
      }
      return out;
    },
  };
}

export { sleep };
