# U50: Along the way, then the towns, as drawers, in the order you pass them

John, 2026-11-10: "there should be two collapsible drawers, a) an along the
way list of POIs in order that they will be passed, and b) a list of towns,
cities, villages, etc on the trip, each one its own drawer with the POIs from
the particular village. All filtered by the genre." His choices, the same day,
from a four-question menu: hide what does not match; along the way open and
each town closed; towns in the order you pass them; keys copied to the MS-S1
so the critic judges before merge.

## Deliverables

Within each day (quality bar rule 5 stands: the trip is told as days):

1. **Along the way**, first, a drawer that starts **open**. The day's places
   worth pulling over for, in the order you pass them (`alongKm`). Ten at a
   time: the **ten strongest, listed in road order**, then "Show all N" for
   every one in road order. The sort control goes: there is one order.
2. **The towns**, after it, each its own drawer, **closed** by default, in
   the order you pass them. A closed town is one header: its name and time
   ("Grand Island · 2 h 3 min from Omaha"), a line with its pick and count
   ("Stuhr Museum and 4 more"), and its "Stop here" (U31's one filled Stop
   here stays on the town nearest where the day runs out, wherever it now
   falls in the order, with its "Closest to where today's 4 h run out" line).
   A tap on the header opens the town's places, ranked as today.
3. **The moods filter.** With a mood chosen, a place that answers none of the
   chosen moods is hidden, in both drawers. A town with nothing left is
   hidden, and one line says so: "2 towns have nothing for History today."
   Machines and Sports map to no kind of town place (U6), so with only those
   chosen the towns are not filtered. With no mood chosen nothing is hidden.
4. The day's stop town (a day that ends at a stop) is a town drawer like the
   others, with its "✓ Added".

## Acceptance

- 390 px screenshots, Omaha to Denver and Amarillo to Austin: at rest; a town
  opened; one mood chosen (History); Machines chosen. Blind critic against
  `gauntlet/quality-bar.md`, before merge, a fresh critic each round.
- Tests: towns in road order with the stop town in place; the ten strongest
  in road order and Show all; the filter in both drawers; the "nothing for"
  line; Machines leaving towns whole; a town drawer opening and closing.
  Mutation proof on each.
- Gate 1. No change to what the app fetches or to the Routes API calls.

## Constraints

- The PolylineRenderer effect split in `RouteMap.tsx` is not touched; the
  map is unchanged.
- No `router.replace`; drawer state is client state.
- Rule 4 of the quality bar is amended by John's ruling (dated in the bar).
- Plain words: "Along the way", never "POIs".
