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
  const take = (kind: string, limit: number) => {
    const g = groups.get(kind)!;
    const n = taken.get(kind)!;
    if (n >= g.length || n >= limit) return false;
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
  for (const kind of groups.keys()) if (picked.length < size) take(kind, cap);
  const order = [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
  const fill = (limit: number) => {
    let progress = true;
    while (picked.length < size && progress) {
      progress = false;
      for (const kind of order) {
        if (picked.length >= size) break;
        if (take(kind, limit)) progress = true;
      }
    }
  };
  fill(cap);
  // If the caps leave the sheet short while stops remain (a corridor with
  // two kinds, say), the cap has done its job of keeping every kind in
  // proportion up to this point; the rest of the sheet is filled the same
  // round-robin way without it, since an empty row teaches nothing.
  if (picked.length < size) fill(Infinity);
  return picked;
}

/**
 * The second sheet (2026-09-28): not a hundred unknowns, but the model's yes
 * list with twenty of its no calls, for John to tap through with a
 * description and a map link. He said a name and a kind are not enough to
 * judge a place by, and that most of the judging is automatable; both are
 * true, so the model judges first and he checks what it proposes, which is
 * also how the app will be used.
 */
export type SheetGroup = "yes" | "near_no" | "random_no";
export interface SheetRow {
  stop: RoadsideStop;
  p: number;
  group: SheetGroup;
}
export interface SheetOptions {
  /** p at or above this is a yes. 0.5: yes and no are equally actionable on a sheet. */
  threshold?: number;
  /** The yes list is cut here by probability; more than this is not a ten-minute read. */
  maxYes?: number;
  /** The no calls just under the line: where the model was unsure. Reported, never scored. */
  near?: number;
  /** No calls drawn at random from the rest: the thin net for a buried gem. Scored. */
  random?: number;
  seed?: number;
}
/**
 * The line between yes and no on the sheet. 0.5 because on a sheet a yes
 * and a no cost the same (one tap each), which is the vendor's own rule for
 * where to put a Noul threshold; the app may later use a higher line for
 * what it shows unasked. The bench (jev-lab, J9) reports precision at this
 * same line, so change both together or the sheet and the bench disagree.
 */
export const SHEET_THRESHOLD = 0.5;
/**
 * The yes list is cut here by probability. 150 rows at five seconds each
 * is about twelve minutes, the length of the check John agreed to; the
 * first corridor gave 143, so the cap did not bind. Raise it for a longer
 * corridor only with his time in mind; the rows cut are the least likely.
 */
export const SHEET_MAX_YES = 150;
/**
 * The no calls just under the line: the model's most uncertain rejections.
 * Ten is enough to see what it hesitates over and few enough not to tilt
 * the sheet. They are reported by the bench, never scored, since a miss
 * at 0.49 says the line is close, not that the model is wrong.
 */
export const SHEET_NEAR = 10;
/**
 * No calls drawn at random from the rest below the line, with the fixed
 * seed: the thin net for a gem the model buried. Ten is the smallest draw
 * whose "at most one worth it" bar means anything; twenty would double
 * John's time on rows that are almost all schools and creeks. Scored.
 */
export const SHEET_RANDOM = 10;

/**
 * Build the sheet from scores. Stops without a score are left out. Yes rows
 * come first by probability, then the ten just under the line, then the ten
 * at random (seeded), each group by probability. No stop appears twice.
 */
export function sheetFromScores(stops: readonly RoadsideStop[], scores: ReadonlyMap<string, number>, opts: SheetOptions = {}): SheetRow[] {
  const threshold = opts.threshold ?? SHEET_THRESHOLD;
  const maxYes = opts.maxYes ?? SHEET_MAX_YES;
  const near = opts.near ?? SHEET_NEAR;
  const random = opts.random ?? SHEET_RANDOM;
  // Ties broken by name so the order is stable across runs; a name is
  // required by the record schema, but a hand-edited corridor file could
  // lack one, and an empty string sorts rather than throws.
  // A fixed locale, so the same scores give the same sheet on any machine;
  // the default locale differs between a laptop and CI.
  const byP = (a: { p: number; stop: RoadsideStop }, b: { p: number; stop: RoadsideStop }) => b.p - a.p || (a.stop.name ?? "").localeCompare(b.stop.name ?? "", "en");
  const seen = new Set<string>();
  const scored: Array<{ stop: RoadsideStop; p: number }> = [];
  for (const stop of stops) {
    const p = scores.get(stop.id);
    if (p === undefined || !Number.isFinite(p) || seen.has(stop.id)) continue;
    seen.add(stop.id);
    scored.push({ stop, p });
  }
  const yes = scored.filter((r) => r.p >= threshold).sort(byP).slice(0, maxYes);
  const below = scored.filter((r) => r.p < threshold).sort(byP);
  const nearRows = below.slice(0, near);
  // The random draw is from what is left below the line, so a stop cannot
  // be both "just under" and "at random".
  const pool = shuffled(below.slice(near), rng(opts.seed ?? DEFAULT_SEED));
  const randomRows = pool.slice(0, random).sort(byP);
  return [
    ...yes.map((r) => ({ ...r, group: "yes" as const })),
    ...nearRows.map((r) => ({ ...r, group: "near_no" as const })),
    ...randomRows.map((r) => ({ ...r, group: "random_no" as const })),
  ];
}
