/**
 * The survivors (step 22): the stops the model says are worth pulling over
 * for, per pulled corridor, as a committed file the app reads at plan time.
 *
 * No model call in the app. The scores come from the jev-lab bench (J9), the
 * corridor from the Overpass pull, the lines about each stop from the
 * encyclopedias and from the map itself. This file joins them at a line and
 * keeps what the plan page needs: where it is, what it is, why it is here,
 * and one line to read.
 */

import { z } from "zod/v4";
import { RoadsideKindSchema, type RoadsideStop } from "./record";
import { MAX_REASON_LENGTH } from "@/lib/routing/scoring";
import { readableDetail } from "./text";

/**
 * The line for the map. The sheet drew it at 0.5; the bench's three near
 * misses at 0.49 (Amarillo Zoo, a Cadillac Ranch car, a university museum)
 * were all approved by John, so the map takes one notch more. On the first
 * corridor: 214 stops at 0.45 against 143 at 0.5. Move it with the bench,
 * not by eye: the jev-lab spec J9 records the reason for the current value.
 *
 * To change it: edit here, then rebuild every committed survivors file with
 * `bun run roadside:survivors -- --name=<corridor> --scores=<the bench's
 * scores file>` and commit the result, since the files carry the stops at
 * the line they were built with (their `threshold` field says which). The
 * test "keeps every scored stop at or above the line" in
 * __tests__/survivors.test.ts asserts the value and must move with it.
 */
export const MAP_THRESHOLD = 0.45;

/**
 * Whether a place's name is a name (Gauntlet U15): it has a letter and at
 * least two characters.
 *
 * The map's own `name` tag is sometimes not one. 54 places on the map, all
 * in Midland, Texas, are named `*`; others are a bare number ("4", "18")
 * or a single letter ("S", "M"). Each scored well enough to be shown, and
 * each would have been a row and a card titled `*` with nothing written
 * about it. Real short names have letters and are kept: Owl, Ram, Zia, B52.
 *
 * A heuristic, and it says so: a real place called "X" is dropped, and a
 * two-letter piece of junk is kept. It reads the name only; the places stay
 * in the store.
 */
export function hasRealName(name: string): boolean {
  const n = name.trim();
  return n.length >= 2 && /\p{L}/u.test(n);
}

export const RoadsideSurvivorSchema = z.object({
  id: z.string().min(1),
  // Refused here, at the boundary, so `survivorsAlongRoute` skips the row
  // as it skips any other the schema will not take (U15).
  name: z.string().min(1).refine(hasRealName, "not a name"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: RoadsideKindSchema,
  /** The model's probability that a road-tripper would stop, at the time of the build. */
  p: z.number().min(0).max(1),
  /** One line to read: the encyclopedia's, else the map's own, else null. Untrusted text; render as text. */
  about: z.string().max(MAX_REASON_LENGTH).nullable(),
  /** The Wikipedia page when there is one. */
  url: z.string().url().nullable(),
});
export type RoadsideSurvivor = z.infer<typeof RoadsideSurvivorSchema>;

export const SurvivorsFileSchema = z.object({
  corridor: z.string().min(1),
  builtAt: z.string().min(1),
  threshold: z.number().min(0).max(1),
  /** The model and the scores file the probabilities came from, for the record. */
  model: z.string().min(1),
  stops: z.array(RoadsideSurvivorSchema),
});
export type SurvivorsFile = z.infer<typeof SurvivorsFileSchema>;

export interface AboutSource {
  short?: string | null;
  extract?: string | null;
  url?: string | null;
}

/**
 * The one line about a stop. The encyclopedia's opening first (it is a
 * sentence), else Wikidata's short description, else what the mapper wrote
 * (the record's `detail`), else nothing. Clipped by the schema's bound.
 */
export function aboutFor(stop: RoadsideStop, desc: AboutSource | undefined): string | null {
  // The same order and the same reading of the mapper's text as the store's
  // read in store.ts: a one-word tag is never the whole line (U16).
  const text = desc?.extract?.trim() || desc?.short?.trim() || readableDetail(stop.detail) || "";
  if (!text) return null;
  return text.length <= MAX_REASON_LENGTH ? text : text.slice(0, MAX_REASON_LENGTH - 1).replace(/\s+\S*$/, "") + "…";
}

/**
 * Every stop at or above the line, with its line to read, in the corridor's
 * own order. A stop with no score is not a survivor: it was never judged.
 */
export function buildSurvivors(
  stops: readonly RoadsideStop[],
  scores: ReadonlyMap<string, number>,
  descriptions: Readonly<Record<string, AboutSource>>,
  threshold = MAP_THRESHOLD
): RoadsideSurvivor[] {
  const out: RoadsideSurvivor[] = [];
  for (const s of stops) {
    const p = scores.get(s.id);
    if (p === undefined || !Number.isFinite(p) || p < threshold) continue;
    const desc = descriptions[s.id];
    out.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, kind: s.kind, p, about: aboutFor(s, desc), url: desc?.url ?? null });
  }
  return out;
}
