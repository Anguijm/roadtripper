/**
 * Waypoint deduplication for the atlas export.
 *
 * In its own module for one reason: the export script is a top-level program
 * that reads Firestore, so nothing in it can be unit-tested, and that is how a
 * temporal-dead-zone crash shipped in a branch that no test and no real data
 * ever executed. Everything here is pure and covered by
 * scripts/lib/__tests__/dedupe.test.mjs.
 */

/**
 * Two waypoints are the same place when they share a city, share a name, and
 * sit within this distance of each other.
 *
 * 2 km is not a guess. Across the 1,056 same-name groups in continental US
 * cities, the maximum separation inside a group is 0.27 km at the median and
 * 1.09 km at p90, and 1,017 of the 1,056 fall entirely within 2 km. Only 4
 * groups spread past 5 km. So the pipeline is emitting one real place several
 * times with jittered coordinates and separately-written descriptions, rather
 * than recording genuine branches of a chain.
 *
 * Deliberately conservative: a pair of same-named places genuinely far apart
 * (two branches, two parks) stays as two rows. The cost of merging those wrongly
 * is worse than the cost of leaving a rare duplicate.
 */
export const DUPLICATE_RADIUS_KM = 2;

export const kmBetween = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));  // clamp: float error can push h past 1 and asin(>1) is NaN, which would silently skip a dedupe
};

/** Conservative on purpose: case and whitespace only. Stripping articles or
 *  punctuation would start merging places that are actually different. */
export const nameKey = (n) => String(n ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Collapse repeated records of the same place, keeping the richest one.
 *
 * "Richest" is trending_score first, then description length, then the id, so
 * the choice is deterministic and a re-export produces the same atlas.
 */
export function dedupeWaypoints(rows) {
  const groups = new Map();
  // Declared here, before the loop that fills it. An earlier version declared
  // it beside `kept`, which sits between the two loops, so the first unnamed
  // waypoint hit a temporal dead zone. Council read it; nothing executed it,
  // because the shipped atlas has no empty names. Now tested directly.
  const unnamed = [];
  for (const r of rows) {
    const key = nameKey(r.name);
    // An empty or whitespace-only name is not a name. Grouping on "" would put
    // every unnamed place in a city into one group and keep only the richest,
    // silently destroying the rest. They pass through untouched instead.
    if (!key) { unnamed.push(r); continue; }
    const k = `${r.city_id}|${key}`;
    const list = groups.get(k);
    if (list) list.push(r); else groups.set(k, [r]);
  }
  const kept = [];
  let dropped = 0;
  for (const list of groups.values()) {
    if (list.length === 1) { kept.push(list[0]); continue; }
    // Single-linkage clustering, so far-apart same-name places survive as
    // separate rows. Merging ALL matching clusters matters: first-match-wins
    // leaves an item in one cluster while it is still within the radius of
    // another, which left exactly one colocated duplicate behind and was only
    // caught because a test counted them.
    const clusters = [];
    for (const r of list) {
      const hits = [];
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].some((x) => kmBetween(x, r) <= DUPLICATE_RADIUS_KM)) hits.push(i);
      }
      if (hits.length === 0) { clusters.push([r]); continue; }
      const merged = [r];
      for (const i of hits) merged.push(...clusters[i]);
      for (const i of hits.slice().reverse()) clusters.splice(i, 1);
      clusters.push(merged);
    }
    for (const c of clusters) {
      c.sort((a, b) =>
        (b.trending_score ?? 0) - (a.trending_score ?? 0) ||
        (b.description?.length ?? 0) - (a.description?.length ?? 0) ||
        String(a.id).localeCompare(String(b.id))
      );
      kept.push(c[0]);
      dropped += c.length - 1;
    }
  }
  return { kept: [...kept, ...unnamed], dropped };
}
