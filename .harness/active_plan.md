<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u3-trip-as-days`

## Ship rule (written before the work)

Gauntlet component U3, round 5: the trip told as days (quality bar, rule
5). The critic's one failure on round 4: the sheet never says where a
day ends when a stretch runs past the 4 h budget. At rest the 7 h 37 min
trip was one heading, "Days 1 and 2 · Amarillo to Austin", and after the
Lubbock stop the 5 h 58 min remainder was "Days 2 and 3 · Lubbock to
Austin", so the reader was told the trip is three days but never where
day 1 or day 2 ends. Round 4 kept a stretch as one section and counted
its days in the label; this round reverses that decision on the verdict
and gives every day its own heading that names where it stops. The three
smaller notes are closed too: a framed day's end had a "1" badge and no
name and the day sat small in the strip; a place was listed three times
in one day; the numbers said "over 2 days" over a heading that said "over
the 4 h you wanted".

**Cost:** $0 in API calls; one council run on the hook change, cents.

1. **Every day is one section, headed by where it ends.** A stretch
   between overnights (the start to the first stop, stop to stop, the
   last stop to the end) that is longer than the daily budget is cut into
   `ceil(minutes / budget)` days, the count the deadline math gives a leg
   (`legsQuantizedDays` in trip-state.ts, untouched), so the day numbers
   and the deadline can never disagree. Each cut falls where that day's
   budget runs out, placed along the road in proportion to time (the
   stretch's average pace; no routing call). A cut day's end is named:
   "near X" when a town on the road is within NEAR_CUT_KM (30 km, about
   twenty minutes) of the cut, the towns being the ones that fit within
   ON_ROAD_KM of the road, the stops, the start and the end; otherwise
   "mile N", the trip's own count from the start, the count the roadside
   rows already use ("131 miles along"). So at rest: "Day 1 · Amarillo to
   near Snyder · 4 h", then "Day 2 · near Snyder to Austin · 3 h 50 min";
   after a stop: "Day 1 · Amarillo to Lubbock · 3 h 20 min", "Day 2 ·
   Lubbock to near Llano · 4 h", "Day 3 · near Llano to Austin · 30 min".
   Every town and roadside place lands in its day by its position along
   the road, so the towns under Day 1 with "Stop here" are the choice of
   where to actually sleep. `TripDay` in `src/lib/plan/days.ts` loses
   `firstDay`, `daysSpanned` and `overBudget` and gains `legIndex`,
   `endStopId`, `endKind` ("stop", "near", "mile", "end") and the day's
   share of its stretch (`legFractionStart`, `legFractionEnd`), which the
   day tap uses to cut the drawn road the same way. `dayLabel` goes;
   `dayHeadingLine(day)` is the sentence; `tripShapeLine` names every
   night, "Three days, with nights in Lubbock and near Llano". The title's
   "fits in day N" is the first day after the last stop. Held by
   `days.test.ts` (the cut, its naming, the placement) and
   `PlanWorkspace.days.ssr.test.tsx` (the headings in order, the right
   names under each) and the glossary test (the sentences' shapes).
2. **A framed day fills the strip, and its end is named.** The map is
   created with `isFractionalZoomEnabled`, so `fitBounds` lands on the
   zoom at which a day's road (or the whole road at rest) fills the strip's
   inner area, 141 px tall on a 390 by 844 phone, rather than the whole
   zoom below it, at which a day 145 px tall drops to 72 and sits in the
   middle of the strip with the next day's road running on under the
   sheet. The padding is the strip's as before (`fitPaddingPx`; nothing in
   the padding math changes). A stop's square on the map keeps its number
   and gains the town's name above it, in the map's one label style (the
   endpoints'), so the end of a framed day reads as "Lubbock", not "1".
   Held by the fit test, which now pins the option in the map's source and
   that at the fractional zoom the fit lands on, the road fills the inner
   area in one dimension; and by a source pin on the stop marker's label.
3. **A place is listed once in a day.** A day's roadside rows drop a
   place whose name, normalized (case, a leading "the", "&" read as
   "and", punctuation and spacing), repeats a stronger row's in the same
   day or a place already listed under one of that day's towns (round 4:
   Day 1 listed the Buddy Holly Center three times). The diamond on the
   map, the count of diamonds and the card are untouched: a tap on the
   diamond still opens its card in its day. Pure `uniqueByName` in
   days.ts with a unit test; the days SSR test renders the repeat and
   sees it once.
4. **Unchanged and not touched:** the deadline arithmetic in
   trip-state.ts; the fit padding math; the arrival sentence; the
   roadside card and rows; "Show all N" per day (on the rows shown); the
   store, its scores and its line (hard stop); no new routing call.

Routed by name, not dropped: the driving-left line says "2 h 17 min of
driving left today" after a stop on a trip without dates, because the
trip's budget is one day's when no dates were given (the documented
default in PlanWorkspace) while the days now say Day 1, Day 2, Day 3;
whether a trip with no dates should budget a day per section is the
operator's call, a change to the budget's arithmetic, not its words. The
mood chips still sit above the days (U5).

**Cost:** $0. No new routing call, no store write, no score touched, no
dependency added, no deploy. The cut is arithmetic on the legs and the
route the app already has; the fractional zoom is a map option, no extra
tiles. The runner's dev server calls the routes API once per distinct
route as before.

**Weakest part:** The cut is at the stretch's average pace, so a day that
starts on a slow town road and ends on an interstate is cut a little
short of 4 h of driving, and "near X" names the nearest town on the road
within 30 km, a place to sleep near, not a promise it has a bed. Second,
fractional zoom on a raster map is Google's documented option and this
builder takes no screenshots, so the day's frame is proven by the padding
math, the zoom arithmetic and the source pin, not by a capture; if the
option is ignored the fit is what round 4 had, no worse. Third, the name
match for repeats is by normalized name alone, so two different places
with one name in one day would be listed once.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, the
  same 9 U2 and rounds 1 to 4 recorded, none new. `bunx vitest run`: 51
  files, 523 tests, all green (round 4 left 519; 4 are new). New or
  reshaped: `days.test.ts`: "cuts two legs that together exceed a day's
  budget into two days, and lands every town and roadside stop in its day
  by its position along the road" (200 + 270 on 240: three days, the
  second cut at 240/270 of the stretch, 513 km, "mile 319", every town
  and place by its km); "makes two days of the whole road with no stops,
  cut where the budget runs out and named by the town near the cut,
  holding every town and place" (470 on 240: "near Snyder", 6 km from the
  cut); "names where a cut day ends by the nearest town on the road, or
  by the mile with none near" (NEAR_CUT_KM 30, the line at 29 and 31 km;
  a town past ON_ROAD_KM cannot name a cut; a stop and the end can);
  "says a day's time only when its route is known, and counts a
  stretch's days by the budget as the deadline does" (`daysSpannedBy`
  equals `legsQuantizedDays` for six drives; 721 min is four days); "finds
  the point a distance along it"; "lists a place once whatever its
  spelling, and leaves a place its town already lists".
  `PlanWorkspace.days.ssr.test.tsx`: "renders a heading per day in order
  for a one-stop trip whose second stretch is over the budget, each
  naming where it ends…" ("Day 1 · Amarillo to Lubbock · 3 h 20 min",
  "Day 2 · Lubbock to near Llano · 4 h", "Day 3 · near Llano to Austin ·
  30 min"; no "Days", no "over the"); "renders two day sections for two
  legs that together exceed the budget while each fits a day…" (the
  spec's acceptance); "keeps a stop's town … names a cut by the mile
  with no town near it…" ("Day 2 · Lubbock to mile 319 · 4 h"; "Three
  days, with nights in Lubbock and at mile 319"); "tells a trip with no
  stops as the days the budget cuts it into…" ("Day 1 · Amarillo to near
  Snyder · 4 h", "Day 2 · near Snyder to Austin · 3 h 50 min"; within
  the budget, one "Day 1 · Amarillo to Austin · 3 h"); "lists a place
  once in a day whatever the store's spellings, leaves to its town a
  place the town lists, and still opens the card for it"; "fades the dots
  … and names a stop's square" (the stop marker's label and icon pinned
  in RouteMap.tsx); the arrival test now also pins "8 h of driving left
  over 2 days" over "Day 1 … · 4 h" and "Day 2 …" with no "over the".
  `PlanWorkspace.roadside.ssr.test.tsx`: the fit test pins
  `isFractionalZoomEnabled` on the map's source and that at the
  fractional zoom the fit lands on (between 5 and 6) the road's height is
  the inner area's 141 px; the Show-all test's drive is within the budget
  so its fourteen places are one day's list. `glossary.ssr.test.tsx`:
  the shapes of `dayHeadingLine` and `tripShapeLine` ("Two days, with a
  night near Snyder", "Three days, with nights in Lubbock and Abilene",
  "… in Lubbock and near Llano", "… at mile 176").
- Mutation, rule 1 (every town and place in the first day): in
  `src/lib/plan/days.ts`, `dayFor` set to return `days[0]` regardless of
  the position. Nine of twenty fail by name: "cuts two legs that together
  exceed a day's budget into two days, and lands every town and roadside
  stop in its day by its position along the road", "makes two days of the
  whole road with no stops…", "keeps a place beyond every stop in the
  last day…", "renders a heading per day in order…", "renders two day
  sections…", "keeps a stop's town and its places under the day it
  ends…", "tells a trip with no stops as the days the budget cuts it
  into…", "shows the ten strongest places per day…", "lists a place once
  in a day…". Restored; `cmp` identical.
- Mutation, rule 1 again (no stretch is ever cut): `daysSpannedBy` set
  to return 1 always. Ten of thirty fail by name across the days unit
  test, the days SSR test and the glossary test, among them "names where
  a cut day ends by the nearest town on the road, or by the mile with
  none near", "says a day's time only when its route is known, and
  counts a stretch's days by the budget as the deadline does", "says the
  arrival deadline as a sentence on the sheet…" (the numbers and the
  days telling one story). Restored; `cmp` identical.
- Decisions taken here, for the critic and the council: round 4's
  reading (a stretch over the budget stays one section, labelled by its
  days) is reversed on the critic's verdict, since the reader was told the
  count and not where a day ended; the cut is by the stretch's average
  pace because the only alternative is a routing call per cut, which the
  spec forbids; a cut is named "near X" within 30 km and "mile N" beyond,
  two shapes rather than a ladder of "past X" guesses; the day count per
  stretch is still `ceil(minutes / budget)` so a 4 h 5 min stretch is a
  4 h day and a 5 min day ("near Austin to Austin · 5 min"), which is
  what the deadline charges and is not hidden; the fractional zoom is a
  map option on a raster map, and if Google ignores it the fit is round
  4's, no worse; a stop's number moved into its icon so its one label can
  be the name. `next-env.d.ts` in this worktree carries the dev server's
  own edit and is not in the commit. For the runner, unchanged: delete
  `.next` in the worktree before the round's dev server; the rest
  screenshot shows "Day 1 · Amarillo to near <town> · 4 h" and "Day 2 ·
  near <town> to Austin · 3 h 37 min" with the towns that fit and the
  places under each; after adding Lubbock, "Three days, with nights in
  Lubbock and near <town>" under the numbers and three headings; the
  day-tap screenshot shows the day's road filling the strip above the
  sheet with Lubbock's name over its numbered square.
