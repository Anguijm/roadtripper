/**
 * Routing providers for the drive-time graph build.
 *
 * Two exist because they answer to different constraints. OpenRouteService is
 * free and counts REQUESTS against its daily allowance, not pairs, so the
 * build's job is to put as many pairs into each request as it allows. Google
 * is accurate, bills per pair after a monthly free allowance, and is the
 * reference the calibration is measured against.
 *
 * Both expose the same shape: given sources and destinations, return a grid
 * `grid[s][d]` of minutes and metres, or null where no route exists. Neither
 * knows anything about cities or the atlas.
 */

/**
 * Limits, per provider. These are per-request caps and per-minute pacing, NOT
 * the daily quota.
 *
 * ORS: 3,500 origin-destination pairs per request (its restrictions page says
 * "3.500 (e.g. 50 x 50)"), 40 requests a minute, and a daily request quota it
 * does not publish: about 50 requests emptied it on 2026-09-26, and it refills
 * on a rolling 24-hour window from the first call. 1,500 ms between requests
 * stays under the per-minute ceiling. Pacing cannot help with the daily quota;
 * fewer, larger requests can, which is what `maxRoutesPerRequest` is for.
 *
 * Google: 625 elements (origins x destinations) per computeRouteMatrix request
 * and 3,000 elements a minute for this project (Service Usage, 2026-09-27),
 * no daily cap. The pause is sized to the request just sent: 20 ms per element
 * is exactly 3,000 a minute, so a full 625-element request waits 12.5 s and a
 * one-pair calibration call waits the 120 ms floor. Past the per-minute cap
 * Google answers 429, which the build counts as a failed request, not a retry.
 * Google bills per element regardless of pace, so there is nothing to gain by
 * going faster.
 */
const ORS_MAX_ROUTES = 3500;
const ORS_PAUSE_MS = 1500;
const GOOGLE_MAX_ELEMENTS = 625;
const GOOGLE_MS_PER_ELEMENT = 20;
const GOOGLE_MIN_PAUSE_MS = 120;

/** A 3,500-pair ORS request answers in seconds; two minutes is far past that
 *  and stops a hung connection from holding an unattended run forever. */
const REQUEST_TIMEOUT_MS = 120_000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * An HTTP failure that keeps its status, so the build can tell the daily
 * quota (403, stop and resume tomorrow) from a request it should split and
 * retry (any other 4xx) from a provider outage (5xx, count and move on).
 */
export class ProviderError extends Error {
  constructor(provider, status, body) {
    super(`${provider} ${status}: ${String(body).slice(0, 300)}`);
    this.name = "ProviderError";
    this.status = status;
  }
}

const inRange = (i, n) => Number.isInteger(i) && i >= 0 && i < n;

/**
 * OpenRouteService matrix. `sources` and `destinations` index into a single
 * `locations` array, so sources are placed first and destinations after them.
 */
export function openRouteService(apiKey) {
  if (!apiKey) throw new Error("ORS_API_KEY is not set");
  const provider = {
    name: "openrouteservice",
    maxRoutesPerRequest: ORS_MAX_ROUTES,
    pauseAfter: () => ORS_PAUSE_MS,
    /** @returns {Promise<Array<Array<{minutes:number, meters:number|null}|null>>>} grid[source][destination] */
    async durationsMatrix(sources, destinations) {
      const locations = [...sources, ...destinations].map((c) => [c.lng, c.lat]);
      const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          locations,
          sources: sources.map((_, i) => i),
          destinations: destinations.map((_, i) => sources.length + i),
          metrics: ["duration", "distance"],
          units: "m",
        }),
      });
      if (!res.ok) throw new ProviderError("ORS", res.status, await res.text());
      const json = await res.json();
      // A 200 without a durations grid is a malformed answer, not "nothing is
      // routable"; treating it as all-null would silently write nothing and
      // count every pair as unroutable.
      if (!Array.isArray(json?.durations)) {
        throw new ProviderError("ORS", res.status, `malformed body, no durations grid: ${JSON.stringify(json)}`);
      }
      return sources.map((_, s) =>
        destinations.map((_, d) => {
          const secs = json.durations?.[s]?.[d];
          // ORS returns null for a pair it cannot route (an island, a bad snap).
          if (typeof secs !== "number") return null;
          const m = json.distances?.[s]?.[d];
          return { minutes: secs / 60, meters: typeof m === "number" ? m : null };
        })
      );
    },
    /** One origin, kept for calibration, which samples single pairs. */
    async durationsFromOne(origin, destinations) {
      const [row] = await provider.durationsMatrix([origin], destinations);
      return row;
    },
  };
  return provider;
}

/**
 * Google Route Matrix. Billed per element under the Essentials SKU (no
 * routingPreference is sent, which keeps it off the pricier Pro SKU) with
 * 10,000 free elements a month, then $5 per 1,000. The 5,132-pair US build
 * fits inside the free allowance.
 */
export function googleRoutes(apiKey) {
  if (!apiKey) throw new Error("GOOGLE_MAPS_KEY is not set");
  const waypoint = (c) => ({ waypoint: { location: { latLng: { latitude: c.lat, longitude: c.lng } } } });
  const provider = {
    name: "google",
    maxRoutesPerRequest: GOOGLE_MAX_ELEMENTS,
    pauseAfter: (elements) => Math.max(GOOGLE_MIN_PAUSE_MS, elements * GOOGLE_MS_PER_ELEMENT),
    /** @returns {Promise<Array<Array<{minutes:number, meters:number|null}|null>>>} grid[source][destination] */
    async durationsMatrix(sources, destinations) {
      const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          origins: sources.map(waypoint),
          destinations: destinations.map(waypoint),
          travelMode: "DRIVE",
        }),
      });
      if (!res.ok) throw new ProviderError("Google", res.status, await res.text());
      const rows = await res.json();
      // Same rule as ORS: a 200 that is not the element array is malformed and
      // must fail the request rather than write an all-null grid.
      if (!Array.isArray(rows)) {
        throw new ProviderError("Google", res.status, `malformed body, not an element array: ${JSON.stringify(rows)}`);
      }
      const out = sources.map(() => destinations.map(() => null));
      for (const el of rows) {
        // A null element must not crash the whole batch, and both indexes are
        // trusted only inside the arrays we sent: a malformed or reordered
        // response must not be able to write past them.
        if (
          !el ||
          el.condition !== "ROUTE_EXISTS" ||
          !inRange(el.originIndex, sources.length) ||
          !inRange(el.destinationIndex, destinations.length)
        ) continue;
        const secs = parseFloat(String(el.duration).replace("s", ""));
        if (!Number.isFinite(secs)) continue;
        out[el.originIndex][el.destinationIndex] = {
          minutes: secs / 60,
          meters: typeof el.distanceMeters === "number" ? el.distanceMeters : null,
        };
      }
      return out;
    },
    /** One origin, kept for calibration, which samples single pairs. */
    async durationsFromOne(origin, destinations) {
      const [row] = await provider.durationsMatrix([origin], destinations);
      return row;
    },
  };
  return provider;
}
