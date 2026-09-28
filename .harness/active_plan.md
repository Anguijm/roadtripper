<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u3-trip-as-days`

## Ship rule (written before the work)

Gauntlet component U3, round 2: the trip told as days (quality bar, rule
5). Round 1 cut the road into days; the critic's one failure was that once
Lubbock is a stop, Day 1 read "Nothing listed along this stretch" and
Lubbock with its places left the days for a collapsed "1 stop · Lubbock"
row above them, so neither day said where it ends or what fits in it. This
round puts a stop's town under the day it ends, takes what was stacked
above the days off the sheet, and closes the three smaller notes (the town
row's overlap and 30 px buttons, the mono face on words, the arrival count
from the UTC day).

**Cost:** $0 in API calls; one council run on the hook change, cents.

1. **A stop's town stays under the day it ends.** The refresh after a stop
   is added counts the towns that fit from that stop, so the stop's own
   town leaves the set; the sheet remembers it. The moment a town is added
   the workspace keeps its town and its places (`stopTowns`, snapshotted
   from the set it was added from; seeded from `initialTrip.addedFrom` or
   the page's set for a trip rendered on the server), drops it when the
   stop is taken out, and draws it last among the day's towns, in the same
   row as every town, with "✓ Added" for its state and "What's in Lubbock".
   A stop's town with nothing written up still gets its row and says so.
   The candidates of a day are the towns that fit in that stretch by their
   position along the direct road, the stops among them left out (a stop is
   drawn as its day's end, never twice). "Nothing listed along this
   stretch" only when a day has no town, no stop and no place. A stop whose
   recompute failed says so under its day's heading in a sentence. Held by
   `PlanWorkspace.days.ssr.test.tsx`: the towns moved on (the set is Fort
   Worth after Lubbock) and Day 1 still holds Lubbock and its places with
   "✓ Added", Day 2 holds Fort Worth with "Stop here".
2. **The days are the trip; nothing stacks above them after a stop.** The
   collapsed itinerary row, the `Itinerary` component and the route lock
   leave the sheet: each day's heading already says where it ends and its
   drive, "✓ Added" takes a stop out, and the failed state is on the day.
   `Itinerary.tsx`, `itinerary-summary.ts` and their tests are deleted, not
   kept idle. "What's in X" no longer opens by itself when a stop is added:
   it opens on its button (a second tap closes it) or a tap on a stop's
   square on the map, is drawn under that town's row inside its day, and
   closes when its town leaves both lists (`nextPanelCityId` closes instead
   of moving to the last stop). The panel resolves its town from the live
   towns, not the page's first set.
3. **A tap on a day shows that day.** The map fits the live road between
   the day's ends (the route as drawn, cut at the stops by `alongRoadKm`),
   padded by the sheet's share of the map as before; a second tap fits the
   whole trip. The sheet scrolls so the day's heading is at the top of its
   box, so what fits in the day is what the strip and the box show
   together; a fully open sheet drops to rest. A recompute closes the open
   day and moves nothing.
4. **The town row is two rows, both readable.** The name with its drive
   ("Lubbock · 1 h 40 min away", the figures in the mono face) on one line
   that wraps, then "What's in Lubbock" and "+ Stop here" side by side,
   each 44 px tall on the screen and sharing the width; no invisible hit
   area. The heading is the town's name; the buttons are its siblings.
5. **The mono face is for figures only.** One component, `Figures`, sets
   the digit runs of a sentence in `.num` and leaves every word in the
   body face: "Day 1 · Amarillo to Lubbock · 3 h 20 min" has 1, 3 and 20
   in mono and "h", "min", "Day" and "over the 4 h you wanted" in sans;
   "Arrive in Austin by October 14, six days from now" has only 14 in
   mono; the sheet's numbers, the driving-left line, the alerts, the town
   row's drive and the masthead's range dates the same. The glossary test
   pins the new shape.
6. **The arrival count is the person's clock.** `localTodayIso` beside
   `todayIso` gives the calendar day in the running clock's zone; the page
   passes it (the server's local day, Japan on the operator's machine) and
   the sheet re-reads the browser's on mount, so "sixteen days from now"
   on a UTC day that is already tomorrow in Japan is "fifteen". Pinned in
   `deadline.test.ts` with dates built from local parts, so the test does
   not depend on the machine's zone.
7. **Unchanged from round 1, and not touched:** the day cut in
   `src/lib/plan/days.ts` and its tests; the deadline arithmetic in
   `trip-state.ts`; the fit at rest (PLAN_HEADER_PX, the masthead's
   classes, the fit test); no new routing call: the days come from the
   legs the recompute already returns and the routes the page already has.

Routed by name, not dropped: the mood chips still sit above the days (U5's
row that fits 390 px would give the days 50 px back); whether the budget
warning belongs above the days when each day already says it is over is
the critic's call. The roadside store lists no place on the runner's
Amarillo to Austin road, so the screenshots show towns and their places
under the days, not roadside rows; that is the store's, not this
component's.

**Cost:** $0. No new routing call, no store write, no score touched, no
dependency added, no deploy. The stop's town is a snapshot of data the
sheet already had; the day's frame is cut from the polyline already drawn.

**Weakest part:** The stop's town is remembered from the set it was added
from, so its "N min away" is the drive from the previous stop as the set
measured it then, and if that set was degraded its places are what loaded
then; a reload rebuilds it from the page's set, which for a stop that no
longer fits from the start is the name alone. Second, the day frame reads
the live route, which lags a recompute by one round trip: a tap in that
window frames the old road. Third, the sheet at rest still shows one day's
worth before the fold when the first day has a town with five places; the
tap's scroll is what puts a day's heading at the top, and a screenshot
without the tap shows Day 2 only by scrolling.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, the
  same 9 U2 and round 1 recorded, none new. `bunx vitest run`: 51 files,
  513 tests, all green (round 1 left 53 files, 517: the itinerary's 4 and
  its summary's 4 are deleted with their components; 4 are new). New or
  reshaped: `PlanWorkspace.days.ssr.test.tsx` (7): the headings with the
  figures alone in mono; "keeps a stop's town and its places under the
  day it ends after the towns that fit have moved on, and stacks nothing
  above the days" (the set is Fort Worth after Lubbock: Day 1 holds
  Lubbock, "✓ Added" and Buddy Holly Center, Day 2 holds Fort Worth and
  "+ Stop here", no "Nothing listed", no "1 stop ·", no lock, no panel
  above the days; and a stop the page's set no longer holds keeps its row
  with "Nothing written up for Lubbock yet"); "says on the day when its
  stop's route did not update, and draws the answer to What's in under
  that town's row"; the arrival sentence with only the day's figure in
  mono. `RecommendationList.ssr.test.tsx` (8): the two-row header pinned
  to its markup, both buttons `min-h-[44px]`, no `before:` hit area;
  `keepEmpty` and `detail`. `glossary.ssr.test.tsx`: the sheet with two
  stops replaces the itinerary screen; `class="num">` never followed by
  a letter on the sheet. `panel-city.test.ts`: closes instead of moving.
  `deadline.test.ts`: `localTodayIso` from dates built of local parts.
- Mutation, rule 1 of round 1 (every town and place in the first day):
  in `src/lib/plan/days.ts`, `dayFor` set to return `days[0]` regardless
  of the position. `bunx vitest run src/lib/plan/__tests__/days.test.ts
  src/components/__tests__/PlanWorkspace.days.ssr.test.tsx` fails five
  of thirteen by name: "cuts two legs that together exceed a day's budget
  into two days, and lands every town and roadside stop in its day by its
  position along the road" (`expected [ 'Plainview', 'Post', 'Brady',
  …(1) ] to deeply equal [ 'Plainview', 'Lubbock' ]`), "keeps a place
  beyond every stop in the last day, and a stop added behind an earlier
  one leaves the earlier day what the road passed first", "renders two
  day headings in order for a one-stop trip, with the right towns and
  places under each" (`to contain '1 place worth pulling over for'`),
  "keeps a stop's town and its places under the day it ends after the
  towns that fit have moved on, and stacks nothing above the days"
  (`to contain "What's in Fort Worth"`, Fort Worth fell into day 1), and
  "shows the ten strongest places per day and one Show all per day only
  where a day has more than ten" (`'14 places'`). Restored from the copy
  taken first; `cmp` reports the file identical.
- Mutation, rule 1 of this round (the sheet forgets a stop's town): in
  `PlanWorkspace.tsx`, `sheetFetch` made to return the effective set
  always (`kept.length >= 0`). The days test and the glossary test run 17
  and fail one by name: "keeps a stop's town and its places under the day
  it ends after the towns that fit have moved on, and stacks nothing above
  the days" (`to contain "What's in Lubbock"`). Restored; `cmp` identical;
  the three files run 23 green after.
- Decisions taken here, for the critic and the council: the `Itinerary`
  component, `itinerary-summary.ts` and their tests are deleted, not left
  unused (Council ISC-S6-PROD-2 wanted the trip above the towns whenever
  it has stops; the days are that, each heading a stop with its drive,
  and the bar's rule 5 is the answer). The route lock went with it: no
  screen offered it but the itinerary's end row. `nextPanelCityId` closes
  instead of moving to the last stop, and the panel resolves from the
  live towns (a town a refresh brought in could not be read about before).
  The day's frame is cut from the live route; the towns and places are
  still placed along the direct route, the road the store measured them
  on. `Figures` is one component for the sheet, the town row and the
  masthead; the home form's date button (U4's screen) is not touched.
  `next-env.d.ts` in this worktree carries the dev server's own edit and
  is not in the commit. For the runner, unchanged: delete `.next` in the
  worktree before the round's dev server, or the screenshot is the
  previous round's stylesheet; and the two-day screenshot after the tap
  on Day 1 shows Day 1's heading at the top of the sheet and Day 2's
  heading under Lubbock's places.
