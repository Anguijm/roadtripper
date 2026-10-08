<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u29-day-ends-on-the-map`

## Ship rule (written before the work)

The U19 and U28 critics: day headings name where a night falls ("near
Sweetwater", "45 min past Elizabethtown"), but the map draws nothing
there. A reader looks for the named place and doesn't find it (rules 5
and 6: the map shows the trip). A stop's night already has its numbered
square; a cut's night has nothing.

Ships when:

- **A mark at each cut.** Every day that ends at a cut ("near", "past" or
  "hours") gets a marker on the road at the exact point the day ends: a
  small moon-coloured ring, distinct from a town's purple dot, a stop's
  square and a diamond.
- **A name for it.** Above the ring is the night's name as the heading
  says it ("near Sweetwater", "45 min past Elizabethtown"), or "Night 1"
  for one said in hours.
- **Fits with U20.** The night's name is placed with the start's, the
  end's and the stops' names (fixed), so towns give way to it.
- **Draw order.** It draws above the diamonds and towns, under the
  endpoints and the stops.
- **Untouched.** A stop's night, and the trip's last day, get no extra
  mark.
- **Code.** A pure function computes the marks from the days, tested. The
  map effect is a new effect (the effect-split rule), guarded by source.

Also required:

- mutation proofs
- a live screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** the point is placed on the direct route's line by
distance, the same frame the days use. After a stop changes the route,
the mark sits on the first route's line, not the new one, until the page
reloads, just as the days' cut points do today.

## Built

- `days.ts`: `NightMark` and `nightMarks(days, road)`, a pure function. It marks only cut days (near, past, hours), at `pointAlong(road, endKm)`, labelled with the heading's name, or "Night N" for a cut said in hours.
- `RouteMap.tsx`:
  - `nightIcon()` draws a white ring on a dark fill, on the endpoints' 64 px canvas.
  - New effect 3b draws the marks at zIndex 1750, not clickable.
  - In effect 2e, the nights' names come first after the fixed names (start, end, stops) and before the towns, offset 30 px above the ring. A crowded night keeps its ring and loses its name.
- `PlanWorkspace.tsx`: `dayNightMarks` is passed to the map.

## Iteration

The first build placed night names as *fixed* labels, which never yield. On Kansas City → Denver at 4 h, "Night 2" falls 44 min short of Denver and drew "Denveght 2". Night names now yield to the start, end and stop names, ahead of the towns.

## Mutation proofs

All 5 are caught:

- stop nights marked
- hours night unnamed
- mark placed at the day's start
- night names never yield
- marks not passed to the map

## Gates

eslint, vitest (792) and next build are clean.

## Critic, round 1: REJECT

- **The name sat too far from its ring (real).** At 30 px up, "near Hays" read as the diamond's label, and "near Sweetwater" landed on Lubbock's dot. A night's name now sits TOWN_LABEL_DY (18 px) from its ring, as a town's does.
- **"Night 2" vanished beside Denver (real).** Names now get a second side: `placeLabels` tries above, then below, and only then gives way. The ring's icon follows the chosen side through `nightsBelow`. "Night 2" now reads below its ring, beside Denver.
- **Salina lost its name.** At this zoom its name overlaps "near Hays" by about 8 px, and the night's name ranks first. That is kept deliberately; zooming in names both.

Tests: `placeLabels` with sides (above, below, neither). The source guards were updated for the side wiring. Mutations caught: no second side, and icon ignores the side.

Gates: vitest (793) and next build are clean.

## Critic, round 2: APPROVE

Rule 5 is now met on the map, and the rings read as distinct from towns and diamonds.

Weakest spot: "Night 2", only 43 min short of Denver, reads as a second name for Denver. Backlogged: consider no ring when the last day is very short.
