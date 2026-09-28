<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 7: the operator's decision after six rounds.
Keep what rounds one and two built (the card on tap, the list open with
the ten strongest and "Show all N", the arc gone, the sheet's numbers as
sentences) and remove the diamond spreading entirely: every diamond is
drawn at its place's true latitude and longitude, always, and never moves
when one is tapped. Overlap at a state-wide zoom is expected and is what
the zoom rule and a pinch are for; no clustering, no offsets. In the same
round: "Show all N" whole on the first screen at 390 by 844 with no
scroll of the sheet, and the card's close is a second tap of the diamond,
a tap on the card's own heading or a swipe, with no separate "Close"
button (the spec).

## What the store and the arithmetic say (measured before the rule)

1. What rounds 3 to 6 built to keep diamonds a touch canvas apart (rings,
   then slots checked against every diamond, then a box at the sheet's
   edge) moved a diamond up to 88 px from its place: at zoom 5 over three
   degrees, so the map said "around Amarillo", not where. The round-6
   critic's failure (a tap on one diamond opening another's card) came
   from that machinery, not from the places. With every diamond on its
   own point, a tap lands on the topmost of an overlapping pair; a pinch
   separates them, and at a town zoom (10 and up) every survivor is
   hundreds of pixels from the next.
2. The sheet at rest is 582 px on a 390 by 844 phone: the handle 45 and a
   537 px scroll box with 8 px of padding above its first section. Round
   6's section was 524 from its top through "Show all" (8 above the
   heading, the heading 24, 4, ten rows of 44, 4, the control 44): 532 of
   the 537, and the control's bottom edge 5 px from the fold, which any
   rounding of a dvh could take. Without the 8 above the heading (the
   box's own padding is the room under the handle) and the 4 under it,
   the section is 512 and the box holds 520 of 537: 17 px to spare.
3. The fit into the strip (round 5) is not spread machinery: it frames
   the road in the map above the sheet at rest, and without it the
   round-4 capture had the whole road under the sheet and Kansas in the
   strip. It stays, a plain `fitBounds` of the route's bounds with the
   sheet's share of the map in the padding, applied once. The box that
   round 6 cut at the sheet's edge for moved diamonds is gone with them.

## Ship rule (written before the code)

1. **Every diamond is drawn on its place's own point and never moves.**
   `roadsideMarkerIcon(active)` anchors the 44 px canvas at its centre on
   the marker's position, with nothing to offset it by; `src/lib/roadside/
   spread.ts` is deleted with its tests, RouteMap imports nothing of it,
   and no diamond is re-anchored, clustered or hidden for another's sake.
   Effect 4 builds the markers wholesale and applies the zoom rule on
   mount and on `zoom_changed` (round 2's shape); Effect 4b draws the
   tapped one larger on the same point and puts the previous one back.
   Held by a test that pins the anchor, the absence of the file and of
   any import of it, and the `zoom_changed` listener.
2. **The map's one fit stays.** `fitBounds` of the route's bounds, padded
   on a phone by the sheet's share of the map (`fitPaddingPx`), so the
   road is framed in the strip above the sheet at rest; the desktop's
   margins elsewhere. `diamondBox` and the strip read on `idle` for moved
   diamonds are gone.
3. **"Show all N" is whole on the first screen.** The roadside section is
   first in the sheet's scroll box, with nothing above its heading and
   nothing between the heading and the first row: `ROADSIDE_LIST_PX` is
   512, and with the box's 8 px padding at most `sheetScrollBoxPx(844, 1)`
   less 16, held by a test that also pins the classes. The ten rows stay
   at 44 px, two lines of 22 with no padding.
4. **The card has no separate close.** Its heading is a 44 px button
   carrying the name, marked open (`aria-expanded`) with the same "▲" the
   itinerary's toggle uses, and a tap on it closes the card; a second tap
   of the same diamond or row closes it (the toggle in
   `handleRoadsideSelect`); a sideways swipe across the card closes it,
   `roadsideSwipeCloses(dx, dy)`: at least 60 px and more sideways than up
   or down, so a scroll of the sheet over the card and a tap do not. No
   "Close" button, no glyph in a box. Held by the card's five-parts test
   and a test of the swipe's line.
5. **The 44 px tap canvas on each diamond stays**, the visible diamond 32
   of it (38 tapped), amber, a diamond and not a circle or a square.
6. Everything else from rounds 1 to 6 that is not the spreading stands:
   the card's five parts and each row opening it; the list open, strongest
   first, ten then "Show all N"; the arc gone; the zoom rule; the app's
   town names on the map and the basemap's off; the rows' town ("at
   Amarillo", "past Lubbock"); the map line for a stop with no write-up;
   the map's 44 px buttons; the sheet's scroll box; the glossary; names
   wrapping; nothing new fetched or scored.

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores; less arithmetic on the client than round 6, none of it per
camera settle.

**Weakest part:** At a state-wide zoom the diamonds of one town sit on
each other (Amarillo's three at zoom 5, Austin's five), and a tap there
opens the topmost one's card; the person pinches to reach the others,
which the operator accepted and the screenshot will show plainly. Second:
the card's heading as its close has no word saying so; the "▲" is the
itinerary's convention in the same sheet, and the second tap on the
diamond or the row is the spec's own close. Third: a name that wraps to
two lines adds 22 px to its row, and two such names among the ten push
"Show all N" below the first screen's 17 px of slack; the ten strongest
on the Amarillo to Austin road fit on one line each at 390 px. Fourth:
the swipe is a touch handler an SSR test cannot exercise; its decision
is pure and tested, the wiring is read by eye.

## Routed by name

- Re-point the /health uptime check's content matcher from "Budget left"
  to "of driving left" and delete the canary in `src/app/health/page.tsx`:
  the operator (a Google Cloud change, not a code change).
- Every other visible string on the plan screen: the town header's mono
  capitals ("LANDMARK", "OKLAHOMA CITY"), its "+405m", the town name's
  ellipsis, the pending line's words, and the chips' short words: U2 (the
  chips' words also U5).
- The candidate towns' own labels on the map (11 px, centred on the dot),
  and the map at one day's zoom: U3, with the map's day view.
- "Add as a stop" from the card: U6, per the spec's constraints.

## Gate 1 proofs

Baseline at the start of the round (round 6's commit): 47 files, 481 tests,
all green; type-check clean; lint 0 errors, 9 warnings.
After: 47 files, 480 tests, all green (the spread's three tests deleted;
two added: every diamond on its own point, and the swipe's line; the
scroll-box test and the card's five-parts test updated to the new
arithmetic and the heading as the close); `bun run type-check` clean;
`bun run lint` 0 errors, the same 9 warnings on the same lines, none in
this round's changes.

**Mutation, the diamond on its point.** In `src/components/RouteMap.tsx`
the icon's anchor in `roadsideMarkerIcon` was made
`new google.maps.Point(22 - 44, 22)`: the diamond drawn 44 px right of
its place, round 6's first slot. Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "never moves one"
× draws every diamond on its place's own latitude and longitude, and
  never moves one
AssertionError: expected '"use client";\n\nimport { useEffect, …' to match
  /function roadsideMarkerIcon\(active = false\): google\.maps\.Icon \{\s*return
  \{\s*url: [^\n]*\n\s*anchor: new google\.maps\.Point\(22, 22\),/
Tests  1 failed | 21 skipped (22)
```

Restored from the backup copy; `cmp` reported the files identical; the
same test then passed, and the whole suite 480.

Rounds 1 to 6's other proofs stand: their tests are unchanged and green,
but for the spread's three, deleted, and the two updated above.
