<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 3: the critic's one failure (rule 4, the three
Amarillo diamonds on one point at the state-wide zoom, so a tap opens
whichever is on top and two of the three cannot be reached from the map)
fixed first, then the lower items the same critic saw: the basemap's town
labels doubled and cut by the app's, the card's distance with no town and in
a unit the rest of the sheet does not use, and ten rows unverified.

## What the data says

Measured before the rule (`scratchpad/stacks.mjs` in the session's scratch
space, over the store along an Amarillo to Austin corridor, 214 survivors).

At the state-wide zoom (7 and under, p at or above 0.7) ten diamonds show in
three groups: six on Austin's point, three on Amarillo's, one alone. Closer
than 18 px, two diamonds sit on one point (the diamond is 18 px wide on a
44 px canvas). Zoomed to a region (8 and 9) the largest stack is 28; at a
town (10) downtown Austin puts 53 on one point, and even at 13 the Capitol
grounds put 8 on one. So a spread has to be shaped for three and six at the
default zoom and bounded for fifty at a town zoom.

## Ship rule (written before the code)

1. **Every diamond on the map answers a tap with its own card, at every
   zoom.** Pure, in `src/lib/roadside/spread.ts`: the diamonds that the
   zoom rule shows are placed in Web Mercator pixels at the map's zoom (the
   map's own projection, computed without the map so a test can prove it).
   A diamond within 18 px of a stack's strongest member joins that stack
   (strongest first, no chaining, so a corridor of stops 30 km apart never
   becomes one blob). A stack of two to eight becomes a ring around the
   strongest member's point with 44 px between neighbours, the width of the
   touch canvas, so no canvas overlaps another's and each diamond's whole
   target is its own: radius 22 px for two, 25 for three, 44 for six, 57 for
   eight. A stack of more than eight shows its eight strongest in the ring
   and the rest wait for a closer zoom, the same rule the corridor already
   follows state-wide; the tapped one always takes the first slot, so the
   card's diamond is on the map at every zoom. Two sit left and right; three
   and more start at the bottom so the gap is at the top, where the town's
   name goes (rule 2). The spread is applied by re-anchoring each marker's
   icon, no new markers, on every zoom change and on every selection, and
   only the markers whose placement changed are touched. A diamond that
   stacks with nothing does not move.
2. **The map's town labels are the app's, once.** The basemap's town labels
   (`administrative.locality`) are off, so "Lubbock" is no longer drawn
   twice and "Amarillo" is no longer cut by the diamonds; the towns that fit
   keep the app's labels, and the start and the end get the app's labels
   too (the names PlanWorkspace already has), 30 px above their dot, drawn
   above the diamonds and not clickable, so a name is never behind a diamond
   and never steals a diamond's tap.
3. **The card says where, in the sheet's own unit.** "6 mi in, at
   Amarillo" when the stop is within 10 km of a town on the road, "132 mi
   in, past Lubbock" otherwise (the last town on the road before it; the
   start counts, so there is always one), "Less than a mile in" under a
   mile. Miles because the sheet's own summary says "497 mi"; one sheet, one
   unit. The towns on the road are the start, the end and the towns that fit
   within 15 km of the route, placed by the nearest point of the route
   sampled every kilometre (pure, `src/lib/roadside/anchor.ts`; a few
   thousand haversines once per route, on the client, nothing fetched). The
   rows say the kind and the distance ("well-known place · 6 mi in") and
   stay two lines, so ten of them fit (rule 4); the card adds the town.
4. **Ten rows and the control in one capture.** On a 390 by 844 phone the
   sheet at the full snap shows 84 dvh, about 665 px under the handle and
   650 inside the padding. Rows are two lines of 22 px with 4 px above and
   below (52 px, above the 44 px target) and no gap between rows; the
   heading is 28 px, the control 44, the section's gaps 16: 608 px from the
   heading's top, 40 px to spare. At the half snap (45 percent) the sheet
   holds about 350 px of list, six rows, and no layout at 16 px with 44 px
   targets changes that; the capture with ten rows is the sheet fully open
   with the roadside heading scrolled to the top.
5. Everything from rounds 1 and 2 stands: the card's five parts, the second
   tap or close control clearing it, each row opening it, the list open with
   the ten strongest first and "Show all N", the arc gone, the zoom rule,
   names wrapping, the sentences in the header, the glossary, the dev
   server's button off, nothing new fetched or scored.

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores. The spread and the town anchor are arithmetic on what the page
already has; the map draws the same markers with a different anchor.

**Weakest part:** The ten-row capture still depends on the runner opening
the sheet fully and scrolling the roadside heading to the top; at the half
snap six rows is the phone's limit. Second: at a town zoom a stack of more
than eight (downtown Austin at zoom 10) shows its eight strongest and hides
the rest until a closer zoom, which is the corridor's own rule but is still a
diamond not on the map at that zoom. Third: the town's name 30 px above its
dot clears a ring of two, three or six but can touch the top corner of a
ring member for four, five, seven or eight; it is drawn above, so it reads,
and the diamond's body stays clear. Fourth: the basemap's town labels are off
everywhere, so a town the app does not label (off the corridor) has no name
on the map at any zoom.

## Routed by name

- Re-point the /health uptime check's content matcher from "Budget left"
  to "of driving left" and delete the canary in `src/app/health/page.tsx`:
  the operator (a Google Cloud change, not a code change).
- Every other visible string on the plan screen, the town name ellipsis,
  the pending line's words, and the chips' short words: U2.
- The candidate towns' own labels on the map (11 px, centred on the dot):
  U3, with the map's day view.
- "Add as a stop" from the card: U6, per the spec's constraints.

## Gate 1 proofs

Baseline at the start of the round (round 2's commit): 47 files, 471 tests,
all green; type-check clean; lint 0 errors, 11 warnings.
After: 47 files, 476 tests, all green; `bun run type-check` clean;
`bun run lint` 0 errors, 11 warnings, the same rules on the same lines as
before (the one in RouteMap is an older effect's unused directive, which
moved down the file and is otherwise untouched).

**Mutation, the ring.** In `src/lib/roadside/spread.ts` the stacking test
`Math.hypot(st.x - p.x, st.y - p.y) < STACK_PX` was inverted to `>`, so a
diamond joins a stack only when it is far from it and the three on
Amarillo's point never stack. Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "spreads diamonds that sit on one point"
× spreads diamonds that sit on one point into a ring, so every one answers its own tap
AssertionError: expected +0 to be close to 25.403411844343534, received
  difference is 25.403411844343534, but expected 0.5
Tests  1 failed | 17 skipped (18)
```

Restored from the backup copy; `cmp` reported the files identical; the same
test then passed (1 passed, 17 skipped). A first mutation, `ringRadius`
returning 0, failed the same test too (the members landed 0.54 px from the
anchor instead of on the ring), but the test imports `ringRadius` itself,
so the inverted stacking test is the proof recorded.

Rounds 1 and 2's proofs (strongest first; the arc prop gone; the glossary's
sentence; the dev server's button) stand: their tests are unchanged and
green.
