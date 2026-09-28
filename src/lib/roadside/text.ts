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
