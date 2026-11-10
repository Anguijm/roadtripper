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
 * The richest of several records of one place: trending_score first, then
 * description length, then the id, so the choice is deterministic and a
 * re-export produces the same atlas.
 */
const richestFirst = (a, b) =>
  (b.trending_score ?? 0) - (a.trending_score ?? 0) ||
  (b.description?.length ?? 0) - (a.description?.length ?? 0) ||
  String(a.id).localeCompare(String(b.id));

/**
 * Group rows by city and `keyOf(name)`, cluster each group by distance, and
 * keep the richest row of each cluster. Rows whose key is empty pass through.
 * Returns the kept rows, the count dropped, and each merge (kept plus dropped)
 * so a caller can list what it did.
 */
function collapse(rows, keyOf, radiusKm) {
  const groups = new Map();
  // Declared here, before the loop that fills it. An earlier version declared
  // it beside `kept`, which sits between the two loops, so the first unnamed
  // waypoint hit a temporal dead zone. Council read it; nothing executed it,
  // because the shipped atlas has no empty names. Now tested directly.
  const unnamed = [];
  for (const r of rows) {
    const key = keyOf(r.name);
    // An empty or whitespace-only name is not a name. Grouping on "" would put
    // every unnamed place in a city into one group and keep only the richest,
    // silently destroying the rest. They pass through untouched instead.
    if (!key) { unnamed.push(r); continue; }
    const k = `${r.city_id}|${key}`;
    const list = groups.get(k);
    if (list) list.push(r); else groups.set(k, [r]);
  }
  const kept = [];
  const merges = [];
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
        if (clusters[i].some((x) => kmBetween(x, r) <= radiusKm)) hits.push(i);
      }
      if (hits.length === 0) { clusters.push([r]); continue; }
      const merged = [r];
      for (const i of hits) merged.push(...clusters[i]);
      for (const i of hits.slice().reverse()) clusters.splice(i, 1);
      clusters.push(merged);
    }
    for (const c of clusters) {
      c.sort(richestFirst);
      kept.push(c[0]);
      dropped += c.length - 1;
      if (c.length > 1) merges.push({ kept: c[0], dropped: c.slice(1) });
    }
  }
  return { kept: [...kept, ...unnamed], dropped, merges };
}

/**
 * Collapse repeated records of the same place, keeping the richest one.
 * Same city, same name (case and whitespace only), within 2 km.
 */
export function dedupeWaypoints(rows) {
  const { kept, dropped } = collapse(rows, nameKey, DUPLICATE_RADIUS_KM);
  return { kept, dropped };
}

/**
 * The second, narrower pass (2026-11-10, John's ruling): the same place
 * written once with a bracketed aside and once without. Grand Rapids listed
 * the Calder as "La Grande Vitesse (The Calder)" and as "La Grande Vitesse",
 * two of the five places the car app shows; Boston has "Old North Church"
 * beside "Old North Church (Christ Church)". On the atlas that day this
 * pass found 80 merges, 29 of them in the US; John read the list before it
 * shipped and kept one apart (KEEP_APART), so 79 merges went out.
 *
 * Tighter than the first pass on purpose, because the names agree less: the
 * bracketed part is dropped, nothing else (no articles, no punctuation, so
 * "The Fish Market" and "Fish Market" stay apart), and the places must sit
 * within 300 m, a city block or two. Across those merges the separation was
 * 101 m at the median and 240 m at p90.
 *
 * Changing it: a wider radius merges more pairs whose brackets name
 * different places (Little Rock's two streets were 274 m apart). Before
 * raising it, list what the new value would merge, as was done for 300 m
 * (run dedupeBracketed over the exported atlas and read every pair), add any
 * pair that is two places to KEEP_APART, and update the counts above and the
 * tests in scripts/lib/__tests__/dedupe.test.mjs. Never widen it to make a
 * single duplicate go away.
 */
export const BRACKETED_RADIUS_KM = 0.3;

/** nameKey with every bracketed aside removed: "Old North Church (Christ Church)"
 *  and "Old North Church" share "old north church". A name that is only a
 *  bracket gives "", which passes through untouched. */
export const bracketKey = (n) => nameKey(String(n ?? "").replace(/\([^)]*\)/g, " "));

/**
 * Groups the bracketed pass leaves alone, as "<city_id>|<bracketKey>": their
 * asides name different places, not one place twice. John's ruling on the
 * list, 2026-11-10. Add to it only from a reviewed list, never to make a
 * count come out.
 */
export const KEEP_APART = new Set([
  // Two streets of the historic district, 274 m apart: two walks, not one.
  "little-rock|quapaw quarter historic homes",
]);

export function dedupeBracketed(rows) {
  const apart = [];
  const rest = [];
  for (const r of rows) (KEEP_APART.has(`${r.city_id}|${bracketKey(r.name)}`) ? apart : rest).push(r);
  const out = collapse(rest, bracketKey, BRACKETED_RADIUS_KM);
  return { ...out, kept: [...out.kept, ...apart] };
}
