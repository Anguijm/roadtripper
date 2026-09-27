/**
 * The 100 to label (step 20).
 *
 * A hundred hand labels are the only ground truth this project will have
 * for "worth stopping for", so they must be spent well: not a hundred
 * registered houses, not a hundred murals, but a spread across the kinds
 * the corridor holds, so the bench in step 21 can tell where the Noul
 * agrees with John and where it does not. Deterministic, so the same
 * corridor and seed give the same sheet.
 */

import type { RoadsideStop } from "./record";

export interface SampleOptions {
  /** Rows on the sheet. */
  size?: number;
  /** No kind may exceed this share of the sheet, as a fraction. */
  maxShare?: number;
  /** Seed for the shuffle; fixed so the sample can be regenerated. */
  seed?: number;
}

/**
 * The labelling budget: the plan's step 20 is "hand-label 100 of them, an
 * hour of John's time", and a hundred is what fits in an hour at ten
 * seconds a row on a phone. More rows would be a better bench and a worse
 * hour; the number is his, not the model's.
 */
export const DEFAULT_SAMPLE_SIZE = 100;
/**
 * No kind may be more than a quarter of the sheet. Step 19's first pull
 * was 71% one kind (historic); a quarter caps any such flood at 25 rows,
 * leaves 75 for everything else, and still gives the flood enough rows
 * for the bench to learn what "no" looks like in it.
 */
export const DEFAULT_MAX_SHARE = 0.25;
/**
 * Fixed so the same corridor gives the same 100. Changing it, or the
 * sampler's order, changes which stops are picked: a sheet already
 * labelled would no longer match a regenerated sample, and the labels
 * could not be merged back by id. Keep it; the value itself means nothing.
 */
export const DEFAULT_SEED = 1337;

/** A small deterministic generator (mulberry32). Good enough to shuffle. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick `size` stops: every kind present gets at least one, no kind gets
 * more than `maxShare` of the sheet, and the rest is filled from the kinds
 * with the most stops. Fewer stops than `size` returns all of them.
 */
export function labelSample(stops: readonly RoadsideStop[], opts: SampleOptions = {}): RoadsideStop[] {
  const size = opts.size ?? DEFAULT_SAMPLE_SIZE;
  const maxShare = opts.maxShare ?? DEFAULT_MAX_SHARE;
  const random = rng(opts.seed ?? DEFAULT_SEED);
  if (!(size > 0) || !(maxShare > 0 && maxShare <= 1)) throw new Error("size must be positive and maxShare in (0, 1]");

  // Dedupe by id, then group by kind, each group in a seeded order.
  const byId = new Map<string, RoadsideStop>();
  for (const s of stops) byId.set(s.id, s);
  const unique = shuffled([...byId.values()], random);
  if (unique.length <= size) return unique;

  const groups = new Map<string, RoadsideStop[]>();
  for (const s of unique) {
    const g = groups.get(s.kind);
    if (g) g.push(s);
    else groups.set(s.kind, [s]);
  }
  const cap = Math.max(1, Math.floor(size * maxShare));
  const taken = new Map<string, number>([...groups.keys()].map((k) => [k, 0]));
  const picked: RoadsideStop[] = [];
  const take = (kind: string) => {
    const g = groups.get(kind)!;
    const n = taken.get(kind)!;
    if (n >= g.length || n >= cap) return false;
    picked.push(g[n]);
    taken.set(kind, n + 1);
    return true;
  };

  // Two passes. First, one of each kind, so a kind with a single stop (the
  // one zoo) is on the sheet at all; a size-proportional draw would never
  // reach it. Second, round-robin across the kinds, largest first within a
  // round, taking one more from each until the sheet is full or every kind
  // is at its cap or out of stops: the big kinds end up within one row of
  // each other, and the flood cannot crowd the rest.
  for (const kind of groups.keys()) if (picked.length < size) take(kind);
  const order = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
  let progress = true;
  while (picked.length < size && progress) {
    progress = false;
    for (const kind of order) {
      if (picked.length >= size) break;
      if (take(kind)) progress = true;
    }
  }
  return picked;
}
