<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 6 of six: the critic's one failure (rule 4: a
diamond on the map does not reliably answer a tap with its own card; two of
the ten were drawn half under the sheet's edge, and The Big Texan's diamond,
put at the bottom of Amarillo's ring, sat on the Museum of the Llano
Estacado's point, so its tap opened the wrong card) fixed first, then the
lower items the same critic saw: the diamonds 18 px wide and the card's
close glyph the same; the rest screenshot showing seven rows and no "Show
all" without a scroll; the card's line reading "No write-up for this one."

## What the store and the arithmetic say (measured before the rule)

1. The ten at the state-wide rule (p at or above 0.7 within 10 km of the
   road), from `data/roadside.sqlite`: The Big Texan (0.83), Helium
   Monument (0.72) and Amarillo Mural (0.71) at Amarillo; Museum of the
   Llano Estacado (0.72) at Plainview, whose point is 28 px below Amarillo's
   at zoom 5; World's Largest Spur (0.76) at Lampasas, 24 px from Austin's
   point; five in Austin. The ring put Amarillo's strongest 25 px below
   its point, 3 px from Plainview's diamond, and Austin's ring of five
   reached 37 px below a dot 38 px above the sheet's edge: the two rule-4
   failures are the same defect, a ring that is checked against its own
   members only and against nothing else on the map.
2. The sheet at rest is 581 px on a 390 by 844 phone: the handle 45 and a
   537 px scroll box. The roadside section is 524 px from its top through
   "Show all"; the header above it (mood chips on two rows, two sentences)
   is about 170. Round 5's test held the section against the box alone
   and never added the header, which is why the capture showed seven rows.
   Section first, the box's 8 px padding and the section's 524 are 532 of
   the 537.
3. Nine of the fourteen strong stops near this road have no line in the
   store at all: `about` is already the encyclopedia's opening, else
   Wikidata's short description, else what the mapper typed, and for those
   nine the map has only a kind. The store's line is a hard stop
   (quality bar), so the card's line for them has to be made from the kind.
4. The new placement, run on the ten at zoom 5 in round 5's frame (the map
   390 by 799, the strip 218, the fit's padding as it is): every diamond
   shown, the least distance between any two 44.0, none under the sheet's
   edge and none off the top. The Big Texan on its own point, the museum
   44 to its right, the monument 44 to its left, the mural 38 below;
   Museum of the Weird on its own point 38 px above the sheet's edge, the
   other four of Austin beside and above it, the spur to the left. At zoom
   4 the same holds.

## Ship rule (written before the code)

1. **Every diamond on the map is checked against every other.**
   `roadsideSpread` (src/lib/roadside/spread.ts) no longer rings a stack; it
   places the stops one at a time, the tapped one first and then the
   strongest first, each on its own point when no placed diamond is within
   SPREAD_PX (44, the touch canvas) of it, else on the first free slot of a
   fixed list around its point: at 44 px, sideways before up before down
   (right, left, the two upper diagonals, ...), then at 88 px the same way.
   A free slot is at least 44 from every diamond placed so far, whatever
   stack it came from. A stop with no free slot waits for a closer zoom;
   the tapped one is placed first, so it is always on its own point. Pure
   and tested: three on one point are the centre, right and left; the
   critic's pair (Amarillo's three and Plainview's one at zoom 5) end at
   least 44 apart; twenty-two on one point show seventeen.
2. **A displaced diamond stays in the strip of map above the sheet.** The
   spread takes an optional box in the map's own pixels; a slot outside it
   is not free. RouteMap builds the box from `map.getBounds()` at the
   current zoom (`diamondBox`, pure) inset by half the diamond, with its
   bottom at the sheet's top edge at rest on a phone (the strip
   `fitPaddingPx` already uses) and the map's own bottom edge elsewhere. A
   stop on its own point is drawn where it is, under the sheet or not: only
   a moved diamond is held to the strip. The pass runs on mount and on the
   map's `idle`, so it holds after a pan or a zoom, not only at the fit.
   The fit's padding is unchanged, so this road stays at zoom 5.
3. **The diamond shows its target.** The visible diamond is 32 of the 44 px
   canvas (it was 18), the tapped one 38 with the light stroke; the
   tap canvas is still 44 and diamonds are never closer than 44.
4. **The roadside section is first in the sheet.** Above the mood chips and
   the numbers, directly under the handle, so at rest the heading, ten rows
   and "Show all N" are on screen with no scroll: the box's padding and
   ROADSIDE_LIST_PX are at most `sheetScrollBoxPx(844, 1)`, held by a test.
   The card, when open, is at the top of the sheet.
5. **The card's close is the word.** A bordered 44 px "Close" button
   beside the name, with the accessible name "Close <name>"; no glyph.
6. **A stop with no line says what the map has.** "On the map as a historic
   place; nothing written about it yet." from `roadsideMapLine(kind)`,
   replacing the placeholder; a stop with a line shows the line as before.
7. Everything from rounds 1 to 5 stands: the fit into the strip; the map's
   44 px buttons; the rows' town; the card's five parts and each row opening
   it; the arc gone; the zoom rule; the app's town labels; the glossary;
   names wrapping; nothing new fetched or scored.

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores. The spread is arithmetic on the map's current bounds, once per
settle of the camera.

**Weakest part:** A diamond that has been moved sideways at a state-wide
zoom is drawn up to 88 px from where the place is: at zoom 5 that is over
three degrees, so the map says "around Amarillo", not where. Second: the
placement runs against the map's bounds on `idle`, so after a pan a moved
diamond can change slot; a diamond on its own point never moves. Third: at
a town zoom with dozens on one point (downtown Austin, 53 at zoom 10) up to
seventeen show in two rings and the rest wait, where the old ring showed
eight; the first real trip says whether seventeen is too many. Fourth: the
sheet now opens on the roadside list, and the trip's numbers and the mood
chips sit under ten rows; that is the spec's "first-class", and the
operator sees it in the screenshots after this round.

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

Baseline at the start of the round (round 5's commit): 47 files, 480 tests,
all green; type-check clean; lint 0 errors, 9 warnings.
After: 47 files, 481 tests, all green (the ring's two tests replaced by
three: the placement against every diamond, the box at the strip's bottom,
a point's capacity; the section's order, the close word, the map's line
and the strip function folded into the tests that already held those
parts); `bun run type-check` clean; `bun run lint` 0 errors, the same 9
warnings on the same lines, none in this round's changes (RouteMap's older
unused directive is untouched).

**Mutation, the box.** In `src/lib/roadside/spread.ts` the `inside` check
was made to count every slot as inside the box (`true || (...)`). Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "keeps a moved diamond inside the strip"
× keeps a moved diamond inside the strip above the sheet and leaves a
  diamond on its own point where it is
AssertionError: expected 3396.063556818454 to be less than or equal to 3394.789577481475
Tests  1 failed | 22 skipped (23)
```

The numbers are a moved diamond's y in the map's pixels at zoom 5 against
the box's bottom: 1.3 px past the sheet's edge inset, the round-5
capture's defect in miniature. Restored from the backup copy; `cmp`
reported the files identical; the same test then passed (1 passed, 22
skipped), and the whole suite 481.

**Mutation, the check against every diamond.** The same file's `free` was
made to check a slot against the last diamond placed only
(`placed.slice(-1).every(...)`), the round-3 ring's defect in one line.
Then "places each diamond on its own point or the first free slot beside
it, checked against every diamond on the map" failed with
`AssertionError: expected 3.6032012871485075 to be greater than or equal to 44`:
two of Amarillo's four 3.6 px apart, the critic's tap on the wrong card.
Restored, `cmp` identical, the test green again.

Rounds 1 to 5's proofs stand: their tests are unchanged and green, but for
the ring's two, replaced above.
