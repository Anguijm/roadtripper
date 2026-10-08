<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u24-one-pick`

## Ship rule (written before the work)

Two critics (the atlas round, and U21) noticed "★ The pick" on several
places in one town. It is set on every place whose kind is among the
mood's primary kinds, so Lubbock showed three picks. "The pick" is
singular. U21's critic also saw it on the places of a town out of the way,
where it reads as recommending the detour over towns on the way.

Ships when:

- **One pick per town.** Each town's list shows at most one "★ The pick":
  its highest-scoring primary-kind place, which is the list's first such
  row since rows are ordered by score.
- **The rest.** Other primary-kind places say "Also good", as
  secondary-kind places do, and the rest say nothing, as before.
- **Detours.** A town out of the way shows no "★ The pick" at all; its best
  says "Also good".

Also required:

- a pure function for the badge, with tests
- mutation proofs
- an SSR check on a town with several primary places
- the critic's approval

**Cost:** $0.

**Weakest part:** "Also good" now covers two tiers, primary-but-not-first
and secondary, so the badge says less about how strong a match is.

## Built

- `rowBadges(rows, leadId, outOfTheWay)` in `RecommendationList.tsx` is pure. It gives:
  - "pick" to the first primary place, or no badge when that place is the lead
  - "good" to the other primary places and the secondary ones
  - nothing to the rest
  - no pick at all when the town is out of the way
- The render reads the badge from this map, and it carries a `data-badge` attribute.
- The glossary test's "★ The pick" check became "Also good". On that fixture, Lubbock's pick is its lead, so it shows no badge. "★ The pick" itself is now pinned by the new SSR test.

## Mutation proofs, before push

All 5 are caught:

- every primary is a pick
- detour towns get picks
- the lead gets a badge
- other primaries get no badge
- the render ignores the detour flag

## Gates

tsc, eslint, vitest (782) and next build are all clean.

## Critic: APPROVE (round 1)

The duplicate pick is gone and "Also good" reads well. Out of scope, noted:

- the badge column wastes width beside long descriptions
- "Towns that fit today" repeats the title
- the lead has no kind line
