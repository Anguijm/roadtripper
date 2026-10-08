<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u32-sticky-header-edge`

## Ship rule (written before the work)

The U25 and U31 critics: while a town's places scroll under its pinned
header, a line of the card above peeks out over the header's top edge
("possible" above "Lubbock · 1 h 40 min away"). The sheet's scroll box
has 8 px of padding (`p-2`), and the header pins 8 px below the box's top
edge, so text scrolls visibly through that strip.

Ships when:

- **No gap.** The pinned header carries an 8 px band of its own colour
  above it (a box-shadow, so layout does not move), in both its resting
  and its highlighted colour.
- **Nothing shows between the sheet's top edge and the pinned header.**
- **Pinned in a test.** An SSR test pins the band, tied to the scroll
  box's padding.

Also required:

- a mutation proof
- a screenshot at the same scroll as U31's
- the critic's approval

**Cost:** $0.

**Weakest part:** the band is tied to `p-2` by hand. If the scroll box's
padding changes, the gap comes back. The test pins both together.

## Built

`RecommendationList.tsx`: `STICKY_BAND_PX = 8`. The pinned header's inline `boxShadow` is `0 -8px 0 0 <its bg>`.

## What went wrong, kept

The first cut used a Tailwind arbitrary shadow class, `shadow-[0_-8px_0_0_#161b22]`. The screenshot still showed "possible". Measured in the browser, the computed box-shadow was "none": the class was never generated. It is now an inline style, and an SSR test pins that style. A class can't be tested this way, because a test only sees that the class name is there, not whether it does anything.

## Tests and proofs

- An SSR test pins the band at `STICKY_BAND_PX`, and the scroll box's `p-2`.
- Mutation proof: removing the band is caught.

## Gates

eslint, vitest (799) and next build are clean.

## Live (measured)

| | value |
|---|---|
| scroll box top | 306.6 |
| header top | 314.6 |
| band | covers 8 px, rgb(22, 27, 34) |

The screenshot shows no text above the pinned header.

## Critic: APPROVE (round 1)

The leak is gone, and the band reads as top padding. Out of scope, noted: nothing says why one Stop here is filled. Two critics have now asked for this, so it is the next unit.
