<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/t1-tag-vocabulary`

## Ship rule (written before the work)

Ships when `src/lib/roadside/tags.ts` holds the eighteen tags and the eight
moods John approved on 2026-09-30, the roll-up from tag to mood, the
question each tag is asked (so the vocabulary and the scorer cannot drift
apart), and the ranking rule for one or two chosen moods; with unit tests
including the two-mood case, and no consumer changed. Gate 1 green.

Why additive: the persona module is imported by fourteen files. Replacing
it and the vocabulary in one branch is a change no reviewer can hold in
their head. This branch adds the vocabulary and the math; the screens keep
their five personas until the interface round swaps them.

**Cost:** $0. No model call, no store write, no route. A pure module and
its tests.

**Weakest part:** The eighteen questions are written here but not yet
asked. Their wording is a guess until the dry run on a sample of the store
shows what the model does with them, and the first real run may send me
back to reword a criterion. The glyphs and accent colours are provisional:
the blind critic judges them on the phone in the interface round, not here.

## Gate 1 proofs

Mutation: the three bands in `rankFor` replaced by the plain `return
weakest` the first cut had. `bunx vitest run
src/lib/roadside/__tests__/tags.test.ts` then fails seven tests by name,
among them "orders the tail instead of flattening it to zero" and "ranks
both above one above neither, and drops nothing off the list". Restored
from the copy taken first; `cmp` reports the file identical.

That first cut was not a straw man. It is what I wrote, and it is what I
described to the operator as the rule: rank by the weaker of the two
chosen moods. The test caught what the description hid. Under it every
place that misses either mood scores exactly zero, so the whole tail below
the both-matches comes back in arbitrary order. The bands keep the
promise (what answers both is on top) and order everything underneath.

Gates: `bunx vitest run` all green; `bun run type-check` clean; `bun run
lint` 0 errors.
