<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u41-town-name-is-the-title`

## Ship rule (written before the work)

U40's critic: on a town card, "Lawrence" is the same grey and weight as
"· 39 min from Kansas City", so the card has no title. There is also a
visible double gap before the "·": an 8 px margin and a space.

Ships when:

- **The name is the title.** The town's name is in the body white
  (#f0f6fc) at medium weight. The drive and the "out of the way" mark
  stay grey.
- **One gap.** The gap before each "·" is 4 px plus the space, not 8.

Also required:

- the SSR tests that pin the header's markup updated, with the name's
  style pinned
- a mutation proof
- a screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** a highlighted card (hovered from the map) was already
white. Its name now reads the same as an unhighlighted one; the
background still marks it.

## Built

`RecommendationList.tsx`: the town name gets `<span data-town-name class="font-medium text-[#f0f6fc]">`. The drive and the "out of the way" spans use `ml-1` (was `ml-2`). The RecommendationList SSR pins are updated.

## Mutation proofs

Both are caught: name left plain, and gap back to `ml-2`.

## Gates

tsc, eslint, vitest (808) and next build are clean.

## Critic: APPROVE (round 1)

The name leads the card, and the gap is even. Next, flagged by several critics: "Also good" is boxed like a button and narrows the description.
