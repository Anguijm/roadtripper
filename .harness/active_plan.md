<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u22-controls-clear-names`

## Ship rule (written before the work)

Four critics (U19, U20 ×2, atlas) flagged the zoom buttons covering the
start's name on a phone: Kansas City → Denver shows "Ka". Since U20 that
hidden name also withholds the names of the towns beside it (Lawrence,
Topeka). Rule 6: the map's controls never hide the trip.

The fit leaves 40 px on the right on a phone (60 on a desktop). The
zoom control takes 54 px of the right edge at the top (44 px buttons, rule
7, and Google's 10 px margin), and a name centred above its dot reaches
about 40 px beyond the dot.

Ships when the first fit's right padding clears the control and half a
long name:

- 10 + 44 + 40 = **94 px**, on a phone and on a desktop
- derived from the control size and margin constants, not typed in
- Kansas City → Denver at 390 px shows "Kansas City" whole and clear of
  the buttons
- the other sides are unchanged
- tests pin the derivation, mutation proofs run before the push, and the
  critic approves

**Cost:** $0.

**Weakest part:** padding the whole right edge shrinks the road's frame
by 54 px of a 390 px phone, though the buttons only cover the top 100 px
of it. A road that runs east–west fills a little less of the width. A
corner-only clearance would need a camera move after the fit, which
round 4 found strict mode removes.

## Built

`RouteMap.tsx` gets three constants:

- `MAP_CONTROL_MARGIN_PX = 10`
- `HALF_NAME_PX = 40`
- `CONTROL_CLEARANCE_PX = 10 + 44 + 40 = 94`

Both `FIT_MARGIN_PX.right` and `STRIP_MARGIN_PX.right` now use it. The fit test pins the derivation, and checks that `HALF_NAME_PX` covers "Kansas City" at 6.6 px per character. Its pinned inner width is now 256, not 310; that is the intended cost, and the zoom and height checks are unchanged.

## Mutation proofs, before push

All 4 are caught:

- phone right back to 40
- desktop right back to 60
- no control margin
- half a name too small

## Live

Kansas City → Denver at 390 px: "Kansas City" reads whole, left of the buttons. Lawrence and Topeka stay unnamed at state zoom, because U20 withholds a name that would touch the start's.

## Gates

tsc and vitest (777) are clean.

## Critic: APPROVE (round 1)

"Kansas City" is whole and the buttons cover no trip name. The narrower frame costs little. Out of scope: the base map's "United States" label is louder than the trip, and state names get crowded. That is the next unit.
