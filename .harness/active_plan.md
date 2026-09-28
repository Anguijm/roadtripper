<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 1: roadside stops become first-class on the
plan page and the machinery comes off the map.

## Ship rule (written before the code)

1. A tap on a roadside diamond opens a card in the sheet with five parts:
   the name, the line about it (the store's `about`, or the kind in plain
   words when there is none), the kind in plain words, how far along the
   road ("212 km in"), and one link-button "Open in Maps". A second tap on
   the same diamond, or the card's close control, clears it. Each list row
   opens the same card. The card sits above the list and the sheet scrolls
   to it, rising from the peek snap if it was peeked.
2. The list is open by default (no `<details>`), headed
   "N places worth pulling over for", the ten strongest by `p` first, then
   a "Show all N" control that reveals the rest. Names wrap; nothing is
   cut with an ellipsis. Text in this section is a normal face at 16 px.
3. The search arc is deleted: RouteMap Effect 5, `SearchArc`,
   `buildSemicirclePoints`, the `searchArc` prop and its computation in
   PlanWorkspace (`computeBearing`), and `METERS_PER_DRIVE_MINUTE`, whose
   only use was the arc's radius. No disabled path is left behind.
4. The map controls never sit under the sheet: the zoom control moves to
   the top right of the map, the rotate (compass) and camera controls are
   off, and the map pane is its own stacking context so nothing Google
   draws can paint over the sheet.
5. The zoom rule stays as it is. The tapped diamond is drawn larger and
   kept visible at every zoom so a row tap shows where the place is.
6. Nothing new is fetched or scored. The card uses only what the store
   already gives (`RoadsideMarker`).
7. Tests in `PlanWorkspace.roadside.ssr.test.tsx` cover: the list open
   with ten rows and the control; strongest first; the card's five parts
   from state; the kind line when `about` is null; the HTML-escaping test
   still passing through the card; and the arc prop gone (a
   `@ts-expect-error` that type-check enforces).

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores. The sort of at most a few hundred stops runs once per plan render.

**Weakest part:** The at-rest screenshot will still show glossary words
this component does not own: "Budget left" in the sheet header, the
"N candidates · max N min" line above the town list, and the words on the
town cards. U2 ("Plain words and readable type") owns every visible string
on the plan screen and is named here as where they go. The second weakest:
the card says "212 km in" while the header says miles; the spec's own
example is in km, so km it is, and U2 can settle the unit for the whole
screen.

## Routed by name

- Glossary words outside the roadside section (header stats, the frontier
  line, the town cards): U2.
- "Add as a stop" from the card: U6, per the spec's constraints.

## Gate 1 proofs

Baseline before any change: 47 files, 463 tests, all green.
After: 47 files, 468 tests, all green; `bun run type-check` clean;
`bun run lint` 0 errors, 11 warnings, every one of them present on HEAD
before this branch (checked by linting the HEAD versions of both files).

**Mutation, the strongest-first list.** In `src/components/PlanWorkspace.tsx`
the sort `(a, b) => b.p - a.p || …` was changed to `a.p - b.p || …`
(weakest first). Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "shows the ten strongest first"
× shows the ten strongest first, then a control that says how many there are in all
AssertionError: expected 'osm:node:100' to be 'osm:node:113'
Tests  1 failed | 9 skipped (10)
```

Restored from the backup copy; `cmp` reported the files identical; the same
test then passed (1 passed, 9 skipped).

**Mutation, the arc is gone.** In `src/components/RouteMap.tsx` a
`searchArc?: unknown;` line was put back on `RouteMapProps`. Then:

```
bun run type-check
src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx(173,9):
  error TS2578: Unused '@ts-expect-error' directive.
```

Restored from the backup copy; `cmp` reported the files identical;
type-check then reported 0 errors.
