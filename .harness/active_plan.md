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

## Council round 1 on #87

Eight items, answered on the branch. The six comments name the tests
that hold each value; each name was checked against the test file
before the commit, so none is invented.

1. `PLAN_HEADER_PX` (src/components/RouteMap.tsx). The comment now says
   what the value is not, a number the app reads (the fit measures the
   map's box with `getBoundingClientRect` in effects 1a and 1c), and
   what to change with it: the header's classes in
   src/app/plan/page.tsx, this number and the page SSR test "keeps the
   masthead at the height the fit at rest counts on" in
   src/app/plan/__tests__/page.ssr.test.tsx together, then the fit test
   "fits the road into the strip of map above the sheet at rest, on a
   phone" in src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx,
   which takes the strip from this and the rest snap (`sheetTopDvh(1)`,
   from SHEET_SNAPS[1]); the strip's floor STRIP_MIN_PX and what a taller
   masthead does to every fit.
2. `OFF_DAY_OPACITY`. The bounds, 0.25 to 0.5 as the days SSR test's
   "fades the dots..." case pins them, and why: below, the dot is the
   land's colour and the town reads as gone; above, it reads as the
   day's own. A faded town's name is not drawn at all, so no
   half-strength text is ever measured for contrast; only effect 2c's
   `marker.setOpacity` reads the value, and the stop squares and the
   diamonds never fade.
3. `tripStopIcon`. Every number in the SVG and the icon (the 64 px
   canvas, the square at 22 and 30 by 20, anchor (32, 40), labelOrigin
   (32, 10), the text at x 32 on baseline 44.5, the colours) with how
   each centres the name over the square and the number in it, what
   moves with it (endpointIcon's canvas and origins, STRIP_MARGIN_PX.top),
   and that the coordinates are not pinned by a test, so the check is a
   screenshot with a stop added.
4. `focusCandidateIds` (src/components/PlanWorkspace.tsx). An inline
   comment on the slice: the day's two ends that are stops are in the
   focus because a stop's town can still be drawn as a candidate dot
   while the refresh past it is in flight or has failed
   (`liveCandidateMarkers` is the last set that answered) and
   `cityIdsByDay` leaves stops out; without them a framed day's own
   start or end would fade as another day's town, dot and name.
5. `NEAR_CUT_KM` (src/lib/plan/days.ts). What to update: the probes at
   29 and 31 km and the pin in the days test "names where a cut day
   ends by the nearest town on the road, or in hours with none near",
   then the days SSR test's headings, which come from `tripDays` over
   its fixtures and so move with the value, and which way each flips;
   the glossary test builds its headings by hand and does not move;
   `cutEndName` is the one reader and ON_ROAD_KM is a separate
   threshold.
6. `mainWorktreeDir` (src/lib/roadside/store.ts). Why the `.git` file is
   read rather than git asked (a request-time lookup; no child process
   per plan render and no git binary in the deploy), the trade (no
   GIT_DIR or GIT_COMMON_DIR, a moved main checkout leaves a dangling
   line that existsSync catches, a submodule's pointer is null on
   purpose, the file is trusted only as a directory to look in, never
   run), the `[\\/]` regex (resolve gives backslashes on Windows, git
   writes forward slashes on both, so one pattern for every platform)
   and the cases the store test lays out.
7. Hydration of `today`: checked, no mismatch, no change. The plan page
   computes `today={localTodayIso()}` on the server
   (src/app/plan/page.tsx, line 280) and PlanWorkspace seeds
   `sheetToday` from that prop (src/components/PlanWorkspace.tsx, line
   473), so the server render and the first client render carry the
   same string; the browser's clock is read only in the `useEffect`
   after it (line 475), a state update after hydration. Nothing else on
   the render path calls the clock: a grep for `new Date`, `Date.now`,
   `todayIso` and `localTodayIso` outside tests in src/components,
   src/lib/plan and src/app/plan finds that effect, the page, the pure
   date maths in deadline.ts and types.ts, TripCard's formatting of a
   saved trip's date and the server-side rate limiter. The days'
   "today" (`fitsTodayLine`, `townsFitHeading` in src/lib/plan/words.ts)
   is the word for day 1, not a date. A viewer whose day differs from
   the server's sees the count change once after mount; that is a
   re-render, not a hydration warning, and the date itself is always
   shown. Written at the line as a comment; no test added, since no
   behaviour changed.
8. The store's log line. `resolveStore` returns the path with which of
   the four places it was found in, and `roadsideForRoute` logs the
   words ("[roadside] store: ROADSIDE_STORE_PATH", "beside the atlas",
   "in the standalone output", "in the main checkout") and never the
   path, in every environment; `resolveStorePath` stays for whoever
   opens the file. store.test.ts did not assert on the message; it now
   does: the source words for each place, and one call of
   `roadsideForRoute` against the fixture store with a spy on
   console.info, one line, the words, no path, no separator.
   docs/roadside-store.md says the same.

Checks: `bunx vitest run` 51 files, 525 tests, all green; `bun run
type-check` clean; `bun run lint` 0 errors, 9 warnings, all on lines
not touched here. Weakest part unchanged: item 7 found no mismatch.

## Council round 2 on #87: the hydration check

The item: verify the production build locally and confirm no React
hydration warning is printed in the browser console under simulated
system timezone offsets (src/components/PlanWorkspace.tsx). Evidence
only, taken 2026-09-29 00:22 UTC; nothing in src changed.

The build. `bunx next build` (Turbopack) does not compile in this
worktree: "Symlink [project]/node_modules is invalid, it points out of
the filesystem root" (node_modules here is a symlink to the main
checkout's, the reason the Gauntlet runner uses `--webpack`).
`bunx next build --webpack` compiled: "Compiled successfully in 6.9s",
TypeScript finished clean, six routes (ƒ /, ○ /_not-found, ƒ /health,
ƒ /plan, ƒ /today, ○ /trips). `bun run build` was not used: its fetch
step hashes data/roadside.sqlite against the checksum in git, and the
main checkout's store (e355fd9f...) is not the published one
(3dcdebf3...), so it would have downloaded the published store. The
store was symlinked from the main checkout for the run (the server in
fact read it through ROADSIDE_STORE_PATH in .env.local, which names the
same file; the log line was "[roadside] store: ROADSIDE_STORE_PATH")
and the symlink was removed after.

The zones. Server: `TZ=Pacific/Kiritimati PORT=3133 bun run start`
(UTC+14; /health answered 200 within a second). Browser: headless
Chrome driven over CDP (debugging ports 9376 and 9377), with
`Emulation.setTimezoneOverride` sent before every navigation and a
390x844 phone emulated. Pacific/Honolulu (UTC-10, twenty-four hours
behind the server) was the far zone and Pacific/Kiritimati, the
server's own zone, the control. At the time of the check the server's
day was 2026-09-29 and Honolulu's was 2026-09-28; each page confirmed
its zone from inside (`Intl.DateTimeFormat().resolvedOptions().timeZone`
gave the zone asked for, `new Date()` gave 14:23 on the 28th in
Honolulu and 14:23 on the 29th in Kiritimati).

The server's HTML by curl, the arrival URL: `<p data-arrival>` reads
"Arrive in Austin by October 14, fifteen days from now"; the day lines
begin "Day 1" and "Day 2"; the shape is "Two days, with a night on the
road". Without dateMode and endDate: no data-arrival element and no
"Arrive" anywhere in the page.

The four loads. URL A is
/plan?fromName=Amarillo&fromLat=35.2073&fromLng=-101.8338&toName=Austin&toLat=30.2672&toLng=-97.7431&budget=4&dateMode=arrival&endDate=2026-10-14
and URL B the same without dateMode and endDate. Each was read from
the DOM 15 s after navigation; every Runtime.consoleAPICalled,
Runtime.exceptionThrown and Log.entryAdded event was collected from
the navigation on.

1. Honolulu, A. Deadline line (data-arrival): "Arrive in Austin by
   October 14, sixteen days from now". Days: "Day 1 · 4 h down the road
   from Amarillo" (towns heading "Towns that fit today"), "Day 2 · on
   to Austin · 3 h 41 min". Console messages: 1. Hydration-shaped:
   none.
2. Honolulu, B. No deadline line (no data-arrival element, no line
   containing "Arrive"). Days as in 1. Console messages: 1.
   Hydration-shaped: none.
3. Kiritimati, A (control). Deadline line: "Arrive in Austin by
   October 14, fifteen days from now". Days as in 1. Console messages:
   1. Hydration-shaped: none.
4. Kiritimati, B (control). No deadline line. Days as in 1. Console
   messages: 1. Hydration-shaped: none.

The one console message, the same in all four loads, is a warning from
the Maps JavaScript API and not from React: "As of February 21st, 2024,
google.maps.Marker is deprecated. Please use
google.maps.marker.AdvancedMarkerElement instead. At this time,
google.maps.Marker is not scheduled to be discontinued, but
google.maps.marker.AdvancedMarkerElement is recommended over
google.maps.Marker. While google.maps.Marker will continue to receive
bug fixes for any major regressions, existing bugs in google.maps.Marker
will not be addressed. At least 12 months notice will be given before
support is discontinued. Please see
https://developers.google.com/maps/deprecations for additional details
and
https://developers.google.com/maps/documentation/javascript/advanced-markers/migration
for the migration guide." No Runtime.exceptionThrown and no
Log.entryAdded in any load. Nothing in any load contains "hydrat",
"did not match", "Text content does not match", "Warning:", "Error",
or a minified React error number (418, 423, 425, the production forms
of a hydration mismatch).

What it shows. In the far zone the deadline line moves from the
server's "fifteen days from now" (the HTML) to the person's "sixteen
days from now" (the DOM after mount) with no message printed: the
re-render item 7 of round 1 describes, `sheetToday` seeded from the
server's `today` and the browser's clock read in the effect after
hydration. In the control the two agree and the line does not move.
Without an arrival deadline nothing on the sheet depends on the day
and the two zones render the same page. No hydration warning in the
far-zone loads or the control; nothing to fix.

Command lines: `rm -rf .next`;
`ln -s /home/johnanguiano/projects/roadtripper/data/roadside.sqlite data/roadside.sqlite`;
`bunx next build` (failed as above); `bunx next build --webpack`;
`TZ=Pacific/Kiritimati PORT=3133 bun run start`; `curl -s "$A"` and
`curl -s "$B"` for the server's HTML;
`node hydra.mjs Pacific/Honolulu 9376 hydra-honolulu.json "$A" "$B"`;
`node hydra.mjs Pacific/Kiritimati 9377 hydra-kiritimati.json "$A" "$B"`
(hydra.mjs: spawn headless google-chrome with --remote-debugging-port,
Page.enable, Runtime.enable, Log.enable,
Emulation.setDeviceMetricsOverride 390x844 mobile,
Emulation.setTimezoneOverride, Page.navigate, 15 s, Runtime.evaluate
reading [data-arrival], [data-day] [data-day-line], [data-towns-heading]
and [data-trip-shape]); the server stopped by its pid, the two Chromes
by theirs. The logs and the two JSON captures are in the session's
scratchpad (u3/prod-build.log, prod-build-turbopack-failed.log,
prod-start.log, ssr-A.html, ssr-B.html, hydra-honolulu.json,
hydra-kiritimati.json); this section carries the words.
