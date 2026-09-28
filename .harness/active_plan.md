<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 4: the critic's one failure (rule 4: no capture
shows the roadside list as the acceptance asks; the list capture had six rows
cut off and no "show all" control, and at rest the section sat about 1750 px
below the fold under two town sections) fixed first, then the lower items the
same critic saw: the sticky town header over a half-clipped row at the top of
the list capture; three of the first five rows reading "494 mi in" with no
town; "Less than a mile in" with a capital mid-line; "LANDMARK" and "405m" on
the town row (routed, see below).

## What the captures say (measured before the rule)

Round 3's three captures in the session's scratch space (`u1/r3-*.png`) and
the runner's scripts beside them (`shot.mjs` at rest, `shot-scrolled.mjs`
scrolling `[data-roadside]` to the top, `shot-tap.mjs` tapping a diamond),
all at 390 by 844.

1. The sheet is 92 dvh tall (776 px), fixed at the bottom and translated
   down by the snap. Its scroll box is `flex-1`: the whole 731 px under the
   handle at every snap. At the half snap (45 percent) only the top 382 px
   of that box is on screen, so the bottom 350 px of the sheet's content
   can never be scrolled into view. That is why the runner's scrolled
   capture had the tail of Oklahoma City's section at the top (the box hit
   its end with the section still 90 px down) and six rows: a rule 7 bug on
   its own, and the reason no capture could show ten rows.
2. Ten rows at the 44 px target, the heading (24) and the control (44) with
   two 4 px gaps and 8 px above take 524 px. The half snap's 382 cannot
   hold that in any layout with 44 px targets and 16 px type, so the rest
   snap has to be taller, and the map has to keep the start of the road in
   the strip above it.

## Ship rule (written before the code)

1. **The sheet's scroll box is the visible part.** On a phone the box is
   `calc(100% - var(--sheet-y) - 45px)` tall (the sheet's height minus the
   hidden part minus the handle and the border), so the last row and the
   Save button are reachable at every snap and a section scrolled to the
   top sits at the top. Desktop keeps `flex-1`.
2. **At rest the sheet holds the list.** The rest snap is 25 percent hidden
   (194 px of 776): the sheet's top at 262 px, 582 px on screen, 537 px of
   scroll box. The roadside section is 524 px from its top through the
   control (8 above, heading 24, gap 4, ten rows of 44, gap 4, control 44),
   so the scrolled capture shows the heading, ten rows and "Show all N"
   with 13 px to spare; at rest under the header the cut lands between the
   seventh and eighth rows, not through one. Peek (80) and full (8) stay.
   The constants are exported and a test holds the arithmetic.
3. **The roadside section sits directly under the header** (and the
   itinerary line when the trip has stops), above the neighbourhood panel,
   the alerts and the town list, so a person opening the sheet sees the
   gold heading and seven rows without scrolling, and a town section's
   sticky header can never overlay it (a sticky header stays inside its own
   section, which is now below). The panel and the alerts keep their place
   just above the towns, where the taps that raise them are.
4. **Rows are 44 px and say where.** Two lines of 22 px, no vertical
   padding: the name, wrapping; then the kind, the distance and the town,
   "well-known place · 6 mi in, at Amarillo", the card's own sentence from
   the same towns on the road, so three stops at the end read "at Austin"
   and not three copies of the route's length. "less than a mile in" in
   lower case, since it is always mid-line after the kind.
5. **The map strip shows the start of the road.** On a phone, once the
   first fit has settled, the map pans so the origin's dot sits 70 px under
   the map's top edge when the road heads south from it (the town's name
   at 40, a ring of three from 45; the strip then holds the first 150 px of
   the route at the fitted zoom, Amarillo to past Lubbock with the diamonds
   there), or 60 px above the sheet's edge when the road heads north. Pure
   Mercator arithmetic on the fitted zoom and centre (`mercatorPx` from
   `spread.ts`), in `roadStartPanPx`, tested without a map. Desktop is
   never panned; the fit is unchanged.
6. Everything from rounds 1 to 3 stands: the card's five parts and its
   close, each row opening it, the ten strongest first and "Show all N",
   the arc gone, the zoom rule, the ring spread, the app's town labels,
   the glossary, names wrapping, nothing new fetched or scored.

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores. The rows' town is one haversine per town per row from what the
page already has; the pan is arithmetic on the fitted viewport.

**Weakest part:** The map strip at rest is 218 px, about a quarter of the
screen, and shows the first stretch of the road only; the whole route needs
the sheet pulled down to its peek. Second: 13 px of spare in the scrolled
capture, so one row whose name or second line wraps to a third line (66 px)
puts the control's lower third under the sheet's edge. Third: the town
rows below keep "LANDMARK", "405m" and the town-name ellipsis (U2's, now
below the fold at rest). Fourth: the pan waits for the map's first `idle`;
if the fit changes nothing (a route already framed), no idle fires and the
strip shows whatever the fit framed.

## Routed by name

- Re-point the /health uptime check's content matcher from "Budget left"
  to "of driving left" and delete the canary in `src/app/health/page.tsx`:
  the operator (a Google Cloud change, not a code change).
- Every other visible string on the plan screen: the town header's mono
  capitals ("LANDMARK", "OKLAHOMA CITY"), its "+405m", the town name's
  ellipsis, the pending line's words, and the chips' short words: U2 (the
  chips' words also U5).
- The candidate towns' own labels on the map (11 px, centred on the dot):
  U3, with the map's day view.
- "Add as a stop" from the card: U6, per the spec's constraints.

## Gate 1 proofs

Baseline at the start of the round (round 3's commit): 47 files, 476 tests,
all green; type-check clean; lint 0 errors, 12 warnings.
After: 47 files, 479 tests, all green; `bun run type-check` clean;
`bun run lint` 0 errors, 9 warnings. Three warnings gone, none new: the
snap table moved from the component body to module scope (`SHEET_SNAPS`),
so the three exhaustive-deps warnings about the touch handlers reading a
local constant no longer apply; the six that remain are on the same lines
as before, none in this round's files but the older unused directive in
RouteMap, untouched.

**Mutation, the rest snap.** In `src/components/PlanWorkspace.tsx` the
snap table `SHEET_SNAPS = [80, 25, 8]` was set back to round 3's
`[80, 45, 8]`, the half snap under which the list could not fit. Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "holds the heading, ten rows and the control"
× holds the heading, ten rows and the control in the sheet's scroll box at
  rest on a 390 by 844 phone
AssertionError: expected 382 to be greater than or equal to 524
Tests  1 failed | 20 skipped (21)
```

382 is the scroll box at the old snap on an 844 px phone, 524 the section
through its control. Restored from the backup copy; `cmp` reported the
files identical; the same test then passed (1 passed, 20 skipped), and the
whole suite 479. A first run of the same mutation failed on the table's
own pin (`expected [80, 45, 8] to deeply equal [80, 25, 8]`), which proves
less, so the budget assertion was moved above the pins and the mutation
run again; the output above is the second run.

Rounds 1 to 3's proofs (strongest first; the arc prop gone; the glossary's
sentence; the dev server's button; the ring) stand: their tests are
unchanged and green.
