/**
 * One text helper both the record and the encyclopedia fetch need. Kept
 * apart from either so neither imports the other for it.
 */

import { MAX_REASON_LENGTH } from "@/lib/routing/scoring";

/**
 * At most `max` characters, whitespace collapsed. A long text is cut at the
 * last sentence end that leaves at least a quarter of `max`, else at a word
 * boundary with an ellipsis, so a description never ends mid-word.
 *
 * The default budget is MAX_REASON_LENGTH from src/lib/routing/scoring.ts:
 * the bound every rendered description already has (a waypoint's reason,
 * a stop's detail, an encyclopedia line), so nothing clipped here can run
 * longer on screen than the slot the plan and today screens give it. Change
 * that constant and every clip follows; do not copy the number.
 *
 * The budget is in UTF-16 units, the same count `z.string().max()` uses,
 * so a clipped text always passes the schema that bounds it; a cut is
 * never placed inside a surrogate pair, so no emoji is ever split.
 */
export function clip(text: string, max = MAX_REASON_LENGTH): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = wholeChars(t, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  // A sentence end is the best place to cut, but only if what it leaves
  // says something: an opening like "KIXZ is a radio station." followed by
  // a long second sentence would otherwise clip to just the first few
  // words. A quarter of the budget (60 characters at 240) is about one
  // full clause, so below that the cut falls back to the word boundary and
  // keeps more of the text with an ellipsis.
  if (sentenceEnd >= max / 4) return head.slice(0, sentenceEnd + 1);
  const space = head.lastIndexOf(" ");
  return (space > 0 ? head.slice(0, space) : wholeChars(head, max - 1)).replace(/[\s,;:.]+$/, "") + "…";
}

/** The first `n` UTF-16 units of `s`, minus a trailing high surrogate, so the cut never splits a pair. */
function wholeChars(s: string, n: number): string {
  const h = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(h) ? h.slice(0, -1) : h;
}

/**
 * The map's own one-word tags that name a thing a person would recognise,
 * as the noun to say it with (Gauntlet U16).
 *
 * A place with no encyclopedia line falls back to what the mapper typed,
 * and for 8,838 of the 27,976 places on the map that is not a sentence but
 * a single tag value: "sculpture", "statue", "observation", "history",
 * "local". The card showed it as the whole line about the place — the
 * critic of U15 named it on a card that read only "tourism". A tag word is
 * not plain words (quality bar, rule 1).
 *
 * The ones that are plain nouns become the noun in the card's own sentence
 * — "On the map as a statue; nothing written about it yet." — which says
 * more than the kind ("artwork") would. A few become the phrase they mean:
 * "observation" is an observation tower's tag. Everything not listed —
 * "history", "local", "commercial", "military", "animal", "art" — is
 * tag-speak, and the card says the place's kind instead.
 *
 * Kept short and plain on purpose: a word belongs here only if "a ___" is
 * something a person in a car would say. Adding one is a judgement, and
 * this list is where it is made.
 */
export const TAG_WORD_NOUNS: Readonly<Record<string, string>> = {
  sculpture: "sculpture", statue: "statue", arch: "arch", mural: "mural", rock: "rock",
  installation: "art installation", carousel: "carousel", house: "house", lighthouse: "lighthouse",
  peak: "peak", stone: "standing stone", tree: "tree", cliff: "cliff", memorial: "memorial",
  obelisk: "obelisk", beach: "beach", bridge: "bridge", museum: "museum", maze: "maze",
  tower: "tower", ruins: "ruin", bust: "bust", hangar: "hangar", ship: "ship", valley: "valley",
  spring: "spring", cross: "cross", barn: "barn", watermill: "watermill", pier: "pier",
  painting: "painting", gorge: "gorge", fountain: "fountain", church: "church", caboose: "caboose",
  theatre: "theatre", restaurant: "restaurant", mosaic: "mosaic", fort: "fort", cannon: "cannon",
  bell: "bell", waterfall: "waterfall", windmill: "windmill", sinkhole: "sinkhole", ridge: "ridge",
  cabin: "cabin", clock: "clock", garden: "garden", train: "train", column: "column", park: "park",
  observation: "observation tower",
};

/** "On the map as a statue; nothing written about it yet." The card's one sentence for a place with no line of its own. */
export function onTheMapLine(noun: string): string {
  return `On the map as ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}; nothing written about it yet.`;
}

/**
 * The line the mapper's own text gives a place, or null when it gives none
 * worth showing (U16).
 *
 * Text of more than one word is what the mapper wrote, and is shown as it
 * is. A single word is a tag value: a plain noun in `TAG_WORD_NOUNS` becomes
 * the card's sentence, and anything else is no line at all, so the card
 * falls back to the place's kind. The store's text is never changed; this
 * is only how it is read.
 */
export function readableDetail(detail: string | null | undefined): string | null {
  const d = detail?.trim();
  if (!d) return null;
  if (/\s/.test(d)) return d;
  const noun = TAG_WORD_NOUNS[d.toLowerCase()];
  return noun ? onTheMapLine(noun) : null;
}
