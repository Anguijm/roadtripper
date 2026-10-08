<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/loop-lessons`

## Ship rule (written before the work)

The U41, U42 and U43 critics: a town's lead place (shown first, with its
reason) is laid out differently from the rest. Its description runs flush
left under the glyph, the others are indented under their names, and it
has no kind line. When it is the town's pick, nothing says so, because
U24 left the lead unbadged ("shown first already"). Now that badges are
words on the kind line (U42), saying it costs nothing.

Ships when:

- **One layout.** The lead place uses the same layout as every other
  place: the glyph in its own column, the name, the reason indented under
  it, then the kind line.
- **The pick is named wherever it is.** The kind line carries its badge,
  and that includes "★ The pick" when the lead is the town's pick: U24's
  lead exception goes.
- **One pick still.** Still one pick per town, and none on a detour.

Also required:

- U24's tests updated (the lead exception removed)
- the SSR pins updated
- mutation proofs
- a screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** the lead loses its look as "the one shown first". Its
place at the top and the accent bar still mark it.

## Built

- `RecommendationList.tsx`: a `placeBody(r)` helper (glyph column, name, reason, kind line with badge) is used for the lead and every row. The lead's container is `flex items-start gap-2`.
- `rowBadges` loses the lead exception and its `leadId` parameter. The pick is named wherever it sits.

## Tests

- `RecommendationList.badges.test`: the lead case now expects "pick".
- A new SSR test checks the lead's glyph column, its indented name and reason, and its kind line "Culture · ★ The pick", with exactly one pick.

## Mutation proofs

Both are caught: the lead exception restored, and the lead's old layout.

## Gates

eslint, vitest (809) and next build are clean.

## Critic: APPROVE (round 1)

The lead matches the list, and the pick is visible. Noted, out of scope: "Towns that fit today" repeats the title nearby, and "Also good" says little.
