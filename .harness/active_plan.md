<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 5: the critic's one failure (rule 4: at rest
no diamond is on the map to tap; the strip above the sheet, CSS y 45 to
263, framed Kansas and Oklahoma with no road, no start pin and no diamond,
and the card only opened after a zoom) fixed first, then the lower items
the same critic saw: after the runner's zoom Amarillo sat on the far left
edge with its name clipped to "marillo"; the card's close is a small glyph
whose 44 px hit area a screenshot cannot show; the map's + and - buttons
are Google's 40 px, under the 44 px target.

## What the captures say (measured before the rule)

Round 4's rest probe (`u1/probe-rest-r4.log` in the session's scratch
space) and its tap log, both at 390 by 844:

1. The map is at y 45, 799 px tall; the sheet's handle at y 263, so the
   strip is 218 px. Amarillo's dot was at y 281 and Austin's at 549, a
   268 px span with its middle at 415: exactly the first fit at zoom 6
   with the old padding (60 above, 120 below) on a map the sheet covers
   from 263 down. Every diamond's centre hit the sheet, not the map.
2. Round 4's pan (a one-shot `idle` listener attached in Effect 1a after
   the fit) never ran. The runner shoots a dev server, where React's
   strict mode mounts an effect, cleans it up and mounts it again; the
   cleanup removed the listener and the second run saw `hasFitOnceRef`
   already true, so it neither fitted nor panned. The fit itself was
   applied on the first run and stayed, which is why the capture shows the
   unpanned fit and not the defaults.
3. Ten diamonds show at the state-wide zoom rule (p at or above 0.7):
   three at Amarillo, one at Plainview, one at Lampasas, five in Austin.
   At zoom 5 the corridor is 134 px tall by 94 wide (Mercator, from the
   endpoints); at zoom 6, 268 by 187.

## Ship rule (written before the code)

1. **The first fit frames the road in the strip above the sheet.** No pan,
   no `idle` listener: on a phone the fit's own padding carries the sheet's
   share of the map, `fitPaddingPx` in RouteMap, pure and tested. The
   bottom padding is the map's height less the strip (the sheet's top in
   dvh times the viewport, less the map's top) plus a margin for a ring's
   lower members (32); the top and the sides leave room for the start's
   name and a ring (40). On a 390 by 844 phone the inner area is 310 by
   145 px, which holds Amarillo to Austin at zoom 5 with 11 px to spare,
   so the whole road, both pins and every state-wide diamond sit between
   y 90 and y 225, above the sheet's edge at 263, and Amarillo is centred
   in the strip's width. A strip under 140 px (a phone on its side) falls
   back to the desktop's margins. Desktop is unchanged. A fit applied once
   survives a strict-mode remount, which the pan did not.
2. **The pan is gone with its test**: `roadStartPanPx`,
   `ROAD_START_TOP_PX`, `ROAD_START_BOTTOM_PX`, the `settle` listener and
   "pans the start of the road…" are deleted, not disabled.
3. **The card's close is a visible 44 px box**: a bordered 44 by 44 square
   holding the glyph, so a screenshot shows the target; the accessible
   name stays "Close <name>".
4. **The map's own buttons are 44 px**: `controlSize` 44 on the map, a
   constructor-time option Google sizes its zoom buttons by, exported as
   `MAP_CONTROL_SIZE_PX` and pinned. They stay at the top right, in the
   map's own area, above the sheet at every snap.
5. Everything from rounds 1 to 4 stands: the sheet at rest holds the
   heading, ten rows and "Show all N"; the roadside section directly under
   the header; the rows' town; the card's five parts and each row opening
   it; the arc gone; the zoom rule; the ring spread; the app's town labels;
   the glossary; names wrapping; nothing new fetched or scored.

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores. The padding is arithmetic on the map's box at the moment of the
one fit the map already made.

**Weakest part:** The whole road in a 218 px strip is zoom 5, where
Austin's five diamonds are a ring of 37 px radius around a dot 38 px above
the sheet's edge: the ring's lowest member sits just under the edge and
opens from its row, not from the map; the other nine are on the map to
tap. Second: the fit is an integer zoom on a raster map, so a road 12 px
taller than this one (a taller header, or Amarillo to Houston) drops to
zoom 4 and a 67 px road; the person pinches, or pulls the sheet to its
peek. Third: the rest snap keeps round 4's 25 percent, so the strip cannot
grow without losing the ten rows the acceptance asks for in the sheet.

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

Baseline at the start of the round (round 4's commit): 47 files, 479 tests,
all green; type-check clean; lint 0 errors, 9 warnings.
After: 47 files, 480 tests, all green (two new: the fit into the strip,
the map's buttons at 44; one gone with the pan); `bun run type-check`
clean; `bun run lint` 0 errors, the same 9 warnings on the same lines,
none in this round's files but the older unused directive in RouteMap,
untouched.

**Mutation, the fit's padding.** In `src/components/RouteMap.tsx` the
phone branch of `fitPaddingPx` was set to return the strip's margins
alone, without the sheet's share of the map in the bottom:
`return { ...STRIP_MARGIN_PX };`. Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "fits the road into the strip"
× fits the road into the strip of map above the sheet at rest, on a phone
AssertionError: expected 6 to be 5 // Object.is equality
Tests  1 failed | 21 skipped (22)
```

6 is the zoom the corridor fits at when the padding leaves the whole map
to it, the round-4 frame with the road under the sheet; 5 is the zoom the
strip holds it at. Restored from the backup copy; `cmp` reported the files
identical; the same test then passed (1 passed, 21 skipped), and the
whole suite 480. A first run of the same mutation failed on the padding's
own pin (`expected { Object (top, right, ...) } to deeply equal …`), which
proves less, so the zoom and in-strip assertions were moved above the pins
and the mutation run again; the output above is the second run.

Rounds 1 to 4's proofs (strongest first; the arc prop gone; the glossary's
sentence; the dev server's button; the ring; the rest snap's budget)
stand: their tests are unchanged and green.
