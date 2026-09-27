/**
 * Plans the matrix requests for a drive-graph build.
 *
 * Why this exists: OpenRouteService counts REQUESTS against its daily quota,
 * not pairs, and allows 3,500 origin-destination pairs in one request. The
 * first build sent one request per city (about 27 pairs each) and emptied the
 * day's quota after 13 cities, 3.7% of the graph. Asking for many origins per
 * request covers the same 5,132 US pairs in about a dozen requests.
 *
 * The plan is pure: it never talks to a provider, so it can be tested against
 * the real atlas without spending anything.
 */

export const haversineKm = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));  // clamp: float error can push h past 1 and asin(>1) is NaN
};

/** Every other city within the straight-line radius of `c`. */
export const neighboursWithin = (c, cities, radiusKm) =>
  cities.filter((o) => o.id !== c.id && haversineKm(c, o) <= radiusKm);

const pairKey = (from, to) => `${from.id}|${to.id}`;

/**
 * Groups the pairs a build still needs into as few requests as the provider
 * allows.
 *
 * @param plan  [{ city, neighbours }] where `neighbours` are the destinations
 *              that city still needs. Entries with no neighbours are skipped.
 * @param maxRoutes  the provider's cap on sources x destinations per request.
 * @returns [{ sources, destinations, pairs }] where `pairs` is the Set of
 *          "from|to" keys this request is expected to answer. A request may
 *          compute extra pairs (a destination one source needs and another
 *          does not); the caller keeps only the ones in `pairs`, so the graph
 *          stays exactly the neighbour set and coverage arithmetic holds.
 *
 * Origins are walked in longitude bands, south to north within a band, so the
 * origins in one request sit close together and their neighbour sets overlap.
 * A request grows by one origin at a time while the union of destinations
 * still fits under the cap. An origin whose own neighbours exceed the cap is
 * split into chunks by itself, which only happens with a cap far below ORS's.
 */
export function planRequests(plan, maxRoutes) {
  if (!Number.isInteger(maxRoutes) || maxRoutes < 1) {
    throw new Error(`maxRoutes must be a positive integer, got ${maxRoutes}`);
  }
  const wanted = plan.filter((p) => p.neighbours.length > 0);
  const band = (c) => Math.floor((c.lng + 180) / 5);
  const sorted = [...wanted].sort(
    (a, b) => band(a.city) - band(b.city) || a.city.lat - b.city.lat || a.city.id.localeCompare(b.city.id)
  );
  const needs = new Map(sorted.map((p) => [p.city.id, p.neighbours]));

  const make = (sources, destinations) => {
    const allowed = new Set(destinations.map((d) => d.id));
    const pairs = new Set();
    for (const s of sources) {
      for (const n of needs.get(s.id)) if (allowed.has(n.id)) pairs.add(pairKey(s, n));
    }
    return { sources, destinations, pairs };
  };

  const requests = [];
  let i = 0;
  while (i < sorted.length) {
    const first = sorted[i];
    if (first.neighbours.length > maxRoutes) {
      for (let j = 0; j < first.neighbours.length; j += maxRoutes) {
        requests.push(make([first.city], first.neighbours.slice(j, j + maxRoutes)));
      }
      i++;
      continue;
    }
    const sources = [first.city];
    let dest = new Map(first.neighbours.map((n) => [n.id, n]));
    let j = i + 1;
    while (j < sorted.length) {
      const next = sorted[j];
      const union = new Map(dest);
      for (const n of next.neighbours) union.set(n.id, n);
      if ((sources.length + 1) * union.size > maxRoutes) break;
      sources.push(next.city);
      dest = union;
      j++;
    }
    requests.push(make(sources, [...dest.values()]));
    i = j;
  }
  return requests;
}
