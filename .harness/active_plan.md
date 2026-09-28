<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u3-trip-as-days`

## Ship rule (written before the work)

Gauntlet component U3, round 3: the trip told as days (quality bar, rule
5). Round 2 put a stop's town under the day it ends and took the
itinerary off the sheet; the critic's one failure was that after a stop
is added the phone shows "Day 1 · Amarillo to Lubbock · 1 h 43 min" and
nothing else about days: Day 2's heading sat 1,100 px below the fold, and
neither the title, the numbers nor the amber box said the trip is now two
days or where day two starts and ends. This round puts the run of days
where the eye lands, under the sheet's numbers, and closes the three
smaller notes (the title that said "today" for a day-2 town, two figures
for one drive, the off-day town's label clipped in a day's frame).

**Cost:** $0 in API calls; one council run on the hook change, cents.

1. **The run of days sits under the numbers.** A trip of two or more days
   draws a strip right under "497 mi · 7 h 45 min on the road" and the
   driving-left line, before any alert: one row per day, the day's own
   heading sentence ("Day 1 · Amarillo to Lubbock · 1 h 43 min", "Day 2 ·
   Lubbock to Austin · 6 h 1 min, over the 4 h you wanted", the figures in
   the mono face), each row a 44 px button that does what the day's
   heading does (fits the map to that day and scrolls the sheet to that
   day's section; a second tap on the open day fits the whole trip), the
   open day marked, and one line under the rows that says what a tap does
   ("Tap a day to see it on the map.", or "Tap Day 1 again to see the
   whole trip."). On a 390 by 844 phone at rest the strip's two rows are
   on screen with the numbers (the box is 537 px; the mood, the numbers
   and the strip are about 350). A one-day trip draws no strip: its one
   heading is a few lines down and a second copy of it would be a
   duplicate. The day sections keep their headings and their open lists
   of towns and places (rule 4). Held by `PlanWorkspace.days.ssr.test.tsx`
   ("puts the run of days under the sheet's numbers…").
2. **The title agrees with the days.** After a stop the towns that fit are
   counted from that stop, so they are the next day's: the sheet's title
   says "Fort Worth fits in day 2" (`fitsTodayLine(towns, toName, day)`,
   day 1 is "fit today" as U2 wrote it), "Fort Worth and Abilene fit in
   day 2", "Nothing fits in day 2; drive on to Austin". The day is the
   number of stops plus one, the section the towns are listed under. The
   "after Lubbock" clause goes: the strip's Day 2 row says where day two
   starts. The glossary test pins the shapes.
3. **One figure for one drive.** A stop's row drops its "· 1 h 40 min
   away": the day's heading right above says the drive the route gave
   ("Amarillo to Lubbock · 1 h 43 min"), and the row's figure was the
   town set's estimate of the same drive. A town that fits keeps its
   "away", the only figure for that drive on the sheet.
   `RecommendationList.ssr.test.tsx` pins both.
4. **A day's frame shows that day's towns.** While a day is open on the
   map, the towns that are not in it (the dots the sheet lists under
   other days) are drawn faded (`Marker.setOpacity`, `OFF_DAY_OPACITY`),
   name and dot together; the day's own towns and every stop stay as they
   are; nothing moves (rule 6). The whole trip restores every town. Pure
   `candidateOpacity(id, focus)` in RouteMap.tsx with a test; the
   workspace hands the open day's towns and its two ends as `focus`.
   The fit's padding is not changed: for Amarillo to Lubbock the height
   binds at zoom 6 with 40 px or 56 px margins alike, so a wider margin
   moves nothing on the screenshot and the day's ends keep the room the
   trip's fit gives them.
5. **Unchanged from rounds 1 and 2, and not touched:** the day cut in
   `src/lib/plan/days.ts` and its tests; the deadline arithmetic in
   `trip-state.ts`; the fit at rest (PLAN_HEADER_PX, the masthead's
   classes, the fit test); the arrival sentence and `localTodayIso`; the
   stop's town kept under its day; no new routing call: the strip is the
   same `days` array the sections draw.

Routed by name, not dropped: the driving-left line says "2 h 16 min of
driving left today" after a stop on a trip without dates, because the
trip's budget is one day's when no dates were given (the documented
default in PlanWorkspace) while the stops make two days; whether a trip
with no dates should budget a day per stretch is the operator's call, a
change to the budget's arithmetic, not its words. The mood chips still
sit above the days (U5). The roadside store lists no place on the
runner's Amarillo to Austin road, so the screenshots show towns and their
places under the days, not roadside rows.

**Cost:** $0. No new routing call, no store write, no score touched, no
dependency added, no deploy. The strip draws the `days` array the
sections already draw; the faded towns are the markers already on the
map with one option set.

**Weakest part:** The strip's tap scrolls the sheet to the day's section,
so the strip itself leaves the screen on a tap and comes back on a scroll
up; the section's heading then says "See the whole trip". Second, the
fading relies on the legacy Marker's `opacity` applying to the label as
well as the icon (the documented option covers the marker); if a browser
draws the label unfaded the dot fades alone, which is less than promised
but not wrong. Third, the title's "day 2" is the count of stops plus one,
and a town that fits from the last stop but projects onto the direct road
before it is listed under the earlier day; the days test names that case
and the title does not.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, the
  same 9 U2 and rounds 1 and 2 recorded, none new. `bunx vitest run`:
  51 files, 516 tests, all green (round 2 left 513; 3 are new). New or
  reshaped: `PlanWorkspace.days.ssr.test.tsx`: "puts the run of days
  under the sheet's numbers, before the alerts, each row a 44 px button
  with the day's sentence, and none for a one-day trip" (two rows in
  order after "on the road" and before the amber box and Day 1's
  section, `aria-pressed="false"`, `min-h-[44px]`, the hint, no strip
  with no stop); "keeps a stop's town…" now pins "Fort Worth fits in day
  2" and that Lubbock's row has no "away" while Fort Worth's has; "fades
  the towns of the other days while one is open, and never a stop"
  (`candidateOpacity`). `RecommendationList.ssr.test.tsx`: "drops the
  drive from a stop's row: the day's heading says it". `glossary.ssr.
  test.tsx`: `fitsTodayLine` with the day.
- Mutation, rule 1 of round 1 (every town and place in the first day):
  in `src/lib/plan/days.ts`, `dayFor` set to return `days[0]` regardless
  of the position. The days unit test and the days SSR test fail by name
  ("cuts two legs that together exceed a day's budget into two days, and
  lands every town and roadside stop in its day by its position along
  the road", "keeps a place beyond every stop in the last day…", "renders
  two day headings in order…", "keeps a stop's town and its places under
  the day it ends…", "shows the ten strongest places per day…"): five of
  fifteen. Restored; `cmp` identical. Recorded in round 1 and re-run
  this round with the same five.
- Mutation, rule 1 of this round (the strip shows the first day only):
  in `PlanWorkspace.tsx`, the strip maps `days.slice(0, 1)`. The days SSR
  test and the glossary test run 19 and fail one by name: "puts the run
  of days under the sheet's numbers, before the alerts, each row a 44 px
  button with the day's sentence, and none for a one-day trip"
  (`expected ' Day 1 · Amarillo to Lubbock · 3 h 20…' to contain 'Day 2 ·
  Lubbock to Austin · 4 h 30 mi…'`). Restored; `cmp` identical; the
  three files run 25 green after.
- Decisions taken here, for the critic and the council: the strip is a
  second reading of the same headings, not a second source: one
  `dayHeadings` array feeds both, so the two can never disagree. The
  strip shows for two days or more only. The stop's row loses its
  estimate rather than the heading losing the route's figure, because
  the route's is the measured one. Off-day towns fade rather than hide:
  a hidden dot would say a town is not there. `next-env.d.ts` in this
  worktree carries the dev server's own edit and is not in the commit.
  For the runner, unchanged: delete `.next` in the worktree before the
  round's dev server; the two-day screenshot at rest after adding
  Lubbock shows the strip's two rows under the numbers; the day-tap
  screenshot shows Day 1's heading at the top of the sheet and the towns
  of day 2 faded on the map.
