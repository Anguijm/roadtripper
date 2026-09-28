<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u3-trip-as-days`

## Ship rule (written before the work)

Gauntlet component U3, round 6 of six: the trip told as days (quality
bar, rule 5). The critic's one failure on round 5: the title said "Fort
Worth fits in day 2" while Fort Worth's row and its five places sat under
"Day 3 · mile 370 to Austin · 2 h", so the screen told the same town in
two different days. Round 5 placed every town by where the direct road
passes nearest it, and Fort Worth, four hours from Lubbock by road but
340 km east of the direct road, projected past day 2's cut; the title
took its day from a different rule (the first day after the last stop).
This round makes them one assignment. The three smaller notes are
closed too: a cut named by the mile ("Amarillo to mile 259", "a night at
mile 370"); Oklahoma City under Day 1 with its dot far from day 1's road;
a diamond over Austin's end marker at the rest zoom.

**Cost:** $0 in API calls; one council run on the hook change, cents.

1. **The towns that fit are the next day's, and the title reads that
   day from the days.** The towns that fit are, by the app's own rule,
   the towns within a day's drive of the last stop (the start with no
   stops) that make progress toward the end (`findCitiesInRadius`,
   `makesProgress`): the choices for where the next day ends. So every
   one of them is listed under the first day after the last stop, day 1
   with no stops (`holdsTowns` on that one `TripDay` in
   `src/lib/plan/days.ts`), whatever its position along the direct road,
   and the sheet's title ("Fort Worth fits in day 2") takes its day
   number from the day that holds the towns: one assignment, read from
   one place. The roadside places stay by their position along the road
   (they are what the road passes, not a choice); a stop's town stays
   under the day that ends at it. Over the towns, the day says what they
   are in the glossary's words, "Towns that fit today" / "Towns that fit
   in day 2", so a town hours off the road under Day 1 (Oklahoma City)
   reads as a choice of where the day ends, not as a place along its
   road. Held by `days.test.ts` (every town under the next day, none
   elsewhere; the places by position; a stop-less trip's one day holding
   all), `PlanWorkspace.days.ssr.test.tsx` (a town past the cut listed
   under the day the title names; the title's number equal to the
   section's), and the glossary test.
2. **A cut with no town near it is said in hours, not miles.** Where a
   day's budget runs out with no town on the road within NEAR_CUT_KM
   (30 km, unchanged) the day is headed as a person says it: "Day 1 ·
   4 h down the road from Amarillo", the next "Day 2 · on to Austin ·
   3 h 37 min", a second cut in a row "another 4 h down the road"; the
   shape line says "a night on the road" ("Three days, with a night in
   Lubbock and one on the road"). A cut with a town near it keeps "near
   Snyder". `DayEndKind` "mile" becomes "hours"; `TripDay` gains
   `fromKind` (what the day starts from) so the heading knows when its
   start is unnamed; `mileAlong` goes. The atlas has eight towns in this
   corridor (Oklahoma City, Amarillo, Lubbock, Dallas, Fort Worth, Waco,
   Fredericksburg, Austin), so on the Amarillo to Austin trip this is the
   heading every cut gets. Held by `days.test.ts` and the glossary test
   (the sentences' shapes) and the days SSR test (the headings on the
   page).
3. **The end of the trip draws above the diamonds.** The start, end and
   stop markers are created with `optimized: false`, so Google draws
   them as elements above any diamond it draws on a canvas, and by their
   zIndex (1800, 2000) above a diamond it draws as an element (1500,
   1600). No diamond moves (rule 6). Held by a source pin in the roadside
   SSR test.
4. **Unchanged and not touched:** the cut arithmetic (ceil(minutes /
   budget), the deadline's own count) and where a cut falls; the deadline
   math in trip-state.ts; the fit padding math, the fractional zoom and
   the fit test; the arrival sentence; the roadside card and rows; "Show
   all N" per day; the day tap and its frame; the store, its scores and
   its line (hard stop); no new routing call.

Routed by name, not dropped: the driving-left line's budget for a trip
with no dates is one day's (the documented default), the operator's call
from round 5; the mood chips still sit above the days (U5); whether a
town that fits but sits hours off the road should be offered at all is
the planner's rule (`makesProgress`), not the sheet's words.

**Cost:** $0. No new routing call, no store write, no score touched, no
dependency added, no deploy. The assignment is a flag on the day the
legs already give; the words are strings; `optimized: false` is a marker
option, no extra tiles. The runner's dev server calls the routes API once
per distinct route as before.

**Weakest part:** The towns that fit are listed under the next day
whatever their position, so a town the planner offers from far off the
road (Oklahoma City from Amarillo) sits under Day 1 with its dot far from
day 1's road; the label over the rows says what the list is, but the
planner's reach (the budget plus 30 min, toward the end) is the rule that
put it there. Second, "4 h down the road" is the stretch's average pace,
as round 5's cut was; a day that starts on town roads ends a little short
of four hours' driving. Third, the z-order fix is a marker option this
builder cannot see drawn; if Google honours zIndex already it changes
nothing, and if it draws the endpoints on a canvas under the diamonds
this is the documented way to stop it.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, the
  same 9 U2 and rounds 1 to 5 recorded, none new. `bunx vitest run`: 51
  files, 524 tests, all green (round 5 left 523; 1 is new). New or
  reshaped: `days.test.ts`: "cuts two legs that together exceed a day's
  budget into two days, lists every town that fits under the day after
  the stop, and lands every roadside stop in its day by its position
  along the road" (Fredericksburg, which the road passes nearest at 526
  km, past the cut at 513, is day 2's; `holdsTowns` [false, true,
  false]; `townsDay` is day 2; the places by km; `fromKind` ["start",
  "stop", "hours"]); new, "lists the towns that fit under the first day
  after the last stop, whatever the cuts, and the title's day is that
  day" (no stop, one stop, two stops with the last stretch cut, a
  stretch unknown: one day flagged, the towns on it alone); "makes two
  days of the whole road with no stops…" (every town day 1's, Brady past
  the cut included); "names where a cut day ends by the nearest town on
  the road, or in hours with none near" (`cutEndName` at 31 km is
  `ON_THE_ROAD`, "hours", no digit); "says a day's time only when its
  route is known…" (the 12 h stretch's `fromKind`/`endKind` ladder);
  "keeps a place beyond every stop in the last day…" (the places by
  position, the towns the last day's). `PlanWorkspace.days.ssr.test.tsx`
  (the fixture after a stop is now the set counted from Lubbock, with
  Lubbock kept via `addedFrom`, as the app does): "renders a heading per
  day in order…" (the title "Post, Snyder and 3 more fit in day 2"; the
  label "Towns that fit in day 2" over the rows; Fredericksburg and
  every "+ Stop here" in the section the title's number names and in no
  other; one `data-towns-heading`); "renders two day sections…" (the
  spec's acceptance); "keeps a stop's town … says a cut with no town near
  it in hours…" ("Day 2 · 4 h down the road from Lubbock", "Day 3 · on
  to Austin · 30 min", "Three days, with a night in Lubbock and one on
  the road", no "mile", the title's day equal to Fort Worth's section);
  "makes the heading a 44 px button…" ("Day 1 · 4 h down the road from
  Amarillo", "Day 2 · on to Austin · 3 h 50 min", the figures alone in
  `.num`); "tells a trip with no stops…" (all six towns under Day 1
  with "Towns that fit today", Windmill alone under Day 2).
  `glossary.ssr.test.tsx`: the heading's shapes (from a stop, a near
  cut, an hours cut, "another 4 h down the road", "on to Austin", "on to
  near Austin", no drive), the shape line's ("a night on the road", "two
  nights on the road", "a night in Lubbock and one on the road", "nights
  in Lubbock and Abilene, and one on the road", "a night near Austin and
  two on the road"), `townsFitHeading`, and the sheet screen carrying
  "Towns that fit today" with no never-word.
  `PlanWorkspace.roadside.ssr.test.tsx`: the diamond test pins
  `optimized: false` on both endpoints (zIndex 1800) and the stops
  (2000), and the diamonds' options unchanged.
- Mutation, rule 1 (every town that fits under the first day): in
  `src/lib/plan/days.ts`, `next` set to `days[0]` regardless of the
  stops. Seven of fifty-three fail by name: "cuts two legs that together
  exceed a day's budget into two days, lists every town that fits under
  the day after the stop…", "lists the towns that fit under the first
  day after the last stop, whatever the cuts, and the title's day is
  that day", "keeps a place beyond every stop in the last day…",
  "renders a heading per day in order…", "renders two day sections…",
  "keeps a stop's town and its places under the day it ends…", "sets no
  heading, label or button in letter-spaced capitals…" (the glossary
  screen's "Lubbock fits in day 3" over a Day 1 list). Restored; `cmp`
  identical.
- Mutation, rule 1 again (the title reads a day the towns are not
  under): `townsDay` set to return `days[0]`. Five fail by name, among
  them "keeps a stop's town … says a cut with no town near it in hours…"
  (the title says day 1 while Fort Worth's section is Day 2) and "lists
  the towns that fit under the first day after the last stop… and the
  title's day is that day". Restored; `cmp` identical.
- Mutation, the places (every roadside stop under the first day):
  `dayFor` set to return `days[0]`. Eight fail by name, among them
  "tells a trip with no stops as the days the budget cuts it into, each
  holding what its road passes…" and "shows the ten strongest places per
  day…". Restored; `cmp` identical.
- Decisions taken here, for the critic and the council: the critic's
  "either Fort Worth is under Day 2 or the title says day 3" is answered
  with the first, because "fits in day 3" would be false (Fort Worth is
  four hours from Lubbock by road, the planner's own measure, so it is
  reachable on day 2) and because the towns that fit are by the app's
  rule the choices for where the next day ends, which is one day; the
  places keep their position rule since they are what the road passes.
  A cut with no town near is said in hours because the atlas has eight
  towns in this corridor and none within 30 km of where four hours run
  out, so the fallback is the heading the real trip shows; "near X"
  stays for the case a town is there. The label over the towns is the
  glossary's phrase, said once per day, not a new word. `next-env.d.ts`
  in this worktree carries the dev server's own edit and is not in the
  commit. For the runner, unchanged: delete `.next` in the worktree
  before the round's dev server; the rest screenshot shows "Day 1 · 4 h
  down the road from Amarillo" with "Towns that fit today" and the towns
  under it, then "Day 2 · on to Austin · 3 h 37 min" with its places;
  after adding Lubbock, "Three days, with a night in Lubbock and one on
  the road", "Fort Worth fits in day 2" in the title and Fort Worth's
  row under "Day 2 · 4 h down the road from Lubbock" beneath "Towns that
  fit in day 2"; the day-tap screenshot as round 5's.
