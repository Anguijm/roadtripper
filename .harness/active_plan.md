<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u37-band-over-text`

## Ship rule (written before the work)

Found during U36's live run. U32's 8 px band (a box-shadow above each town
header) paints above *every* header, pinned or not. Where a header sits
right under other text, the band covers that text's bottom: "Towns that
fit today" is clipped above Lawrence's card on Kansas City → Denver.

Ships when:

- **Unpinned.** Each town header gets a top margin equal to the band
  (STICKY_BAND_PX). An unpinned header's band then paints into its own
  empty margin, and over nothing.
- **Pinned.** A pinned header still covers the scroll box's strip, as in
  U32.

Also required:

- measured in the browser: the "Towns that fit today" heading's bottom is
  at or above the band's top, and the pinned case still has no gap
- an SSR test pins the margin to STICKY_BAND_PX
- a mutation proof
- the critic's approval

**Cost:** $0.

**Weakest part:** each card moves 8 px further from the text above it.

## Built

`RecommendationList.tsx`: the town header gets `marginTop: STICKY_BAND_PX` beside its band. The SSR test pins both, and the mutation that removes the margin is caught.

## Measured in the browser (Kansas City → Denver, the "Towns that fit today" heading against Lawrence's band)

| build | heading bottom | band top | clear |
|---|---|---|---|
| production (before) | 587.6 | 579.6 | **false** (8 px covered) |
| this branch | 587.6 | 587.6 | **true** |

The pinned case (Amarillo → Austin, Abilene) is unchanged: the header is 8 px below the scroll edge and the band covers it.

## Gates

tsc, eslint, vitest (800) and next build are clean.

## Critic: APPROVE (round 1)

The label is whole, and the pinned case still holds.
