<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u3-trip-as-days`

## Ship rule (written before the work)

Gauntlet component U3, round 1: the trip told as days (quality bar, rule
5). The plan sheet groups the road by day from the legs and the daily
budget, a tap on a day fits the map to that day's stretch of road, the
arrival deadline is a sentence, and the fit at rest, broken since U2,
frames the road again.

**Cost:** $0 in API calls; one council run on the hook change, cents.

1. **A day is a stretch of road between overnights.** The start to the
   first stop, each stop to the next, the last stop to the end; no stops
   is one day, the whole road. A stretch longer than the daily budget
   stays one section and its heading says so in plain words ("7 h 31 min,
   over the 4 h you wanted"); the deadline arithmetic in `trip-state.ts`,
   which counts nights, is not changed. The grouping is a pure function in
   `src/lib/plan/days.ts` (`tripDays`): in, the legs' minutes, the direct
   route, the towns and the roadside stops with their position along it;
   out, ordered days, each with from, to, minutes, its towns and its
   roadside stops. A town or a place belongs to the first day whose
   stretch reaches it (inclusive at the stop, so the stop's own town sits
   under the day that ends there). Positions are along the direct route,
   the road the roadside stops were measured on (`roadsideAlong`); a stop
   hours off the road is placed where the road passes nearest it. Held by
   `src/lib/plan/__tests__/days.test.ts`.
2. **The sheet shows the days in order.** Under the sheet's title (still
   on the handle row) and the trip's numbers and the mood chips: a heading
   per day, a sentence with the numbers in `.num` ("Day 1 · Amarillo to
   Lubbock · 3 h 20 min"), then that day's towns with their "Stop here"
   controls, then that day's roadside places in the same rows and card U1
   and U2 built, strongest first, ten at a time, "Show all N" per day only
   where a day has more than ten. No glossary never-word; every string in
   sentence case. Held by `PlanWorkspace.days.ssr.test.tsx` (a one-stop
   trip, two legs, two headings in order with the right names under each)
   and the glossary test, which renders the sheet.
3. **A tap on a day fits the map to that day's road; a second tap fits
   the whole trip.** The heading is a 44 px button whose second line says
   what the tap does ("See it on the map", then "See the whole trip"), not
   an icon. The fit is the polyline between the day's ends with the sheet's
   share of the map left out through `fitPaddingPx`; a sheet that is fully
   open drops to rest so the strip shows the day. A recompute never moves
   the camera: when the stops change the open day closes and no fit is
   requested (Council ARCH-2).
4. **The fit at rest frames the road, not the country.** Why it broke: U1
   round 5 designed the fit for a 45 px masthead (the map at y 45, a
   217 px strip above the sheet at rest on a 390 by 844 phone, 145 px of
   it inside the strip's margins; the Amarillo to Austin road is 134 px
   tall at zoom 5). U2 rebuilt the masthead at 16 px with a 44 px link and
   `py-3`: 69 px, 73 with the deadline line, so the strip fell to 189 px
   and the inner area to 117; `fitBounds` takes whole zooms on a raster
   map, so the fit dropped to zoom 4, a third of the country in the strip.
   The other two candidates are not it: the map's box is read in an effect
   that runs after the library's own create effect has laid the div out
   (`getBoundingClientRect` forces layout), and the once-only guard sees
   its first map only after the strict-mode double invoke, since the
   geometry library lands a render later. The fix: the masthead loses its
   vertical padding (the link's 44 px is the row; two lines on the right
   make it 49 with the border) and the arrival sentence, which is 49
   characters and would wrap the masthead to three lines, moves to the
   sheet's numbers block, built on the page and handed down as `today`.
   `PLAN_HEADER_PX` (49) in `RouteMap.tsx` mirrors the masthead; the fit
   test takes the strip from it and pins zoom 5, and the page SSR test
   pins the masthead's classes to the constant.
5. **Arrival mode is a sentence.** "Arrive in Austin by October 14, six
   days from now": the destination, the date without the year when it is
   this year, the count in words up to twenty and digits past that,
   "tomorrow" for one, "today" for zero, "yesterday" and "three days ago"
   once passed. `arrivalSentence` beside `formatDeadline` in
   `src/lib/plan/deadline.ts`, pinned for a fixed "now".
6. **No new routing call.** The days come from the legs and the route the
   app already has; the direct route is decoded once per plan on the
   client. Nothing the app pays for changes.

Routed by name, not dropped: the mood chips sit after the trip's numbers
and before the days, as U2 left them relative to the numbers; whether they
belong above the days at rest is the round's critic's call, not a rule
here. The today screen's deadline line ("Arrive in Austin by Oct 14, 6
days left") is not this component's.

**Cost:** $0. No new routing call, no store write, no score touched, no
dependency added, no deploy. The days are cut from the legs the recompute
already returns and the direct route the page already has, decoded once
per plan on the client (a few thousand points). One `today` string is
passed from the server to the sheet.

**Weakest part:** The strip is thin. At rest with a 49 px masthead the
inner area is 141 px and the road needs 134 at zoom 5: seven pixels. A
masthead that wraps to three lines (two long town names at 16 px in a
222 px column) takes 24 more and the fit is back at zoom 4; the fit reads
the real box, so it degrades to the country, never crashes, but nothing in
this tree stops a long name doing it. Second, a day's minutes come from
`tripState.legs[i]` by index, as the Itinerary's do: a removed stop whose
recompute failed leaves the old leg under a new stop until the next
success.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, the
  same 9 U2 recorded, none new. `bunx vitest run`: 53 files, 517 tests,
  all green (U2 left 51 files, 504 tests). New: `days.test.ts`, 6 tests
  (the road's measure, two legs over the budget into two days with every
  town and place in its day, no stops as one day holding everything, the
  over-budget flag and unknown minutes, a stop added behind an earlier
  one, a day's frame on the map); `PlanWorkspace.days.ssr.test.tsx`, 5
  (two headings in order with the right names under each, the 44 px
  heading that says what a tap does, one day with no stops and a day with
  no time until its route is known, ten strongest and one "Show all" per
  day, the arrival sentence on the sheet); `deadline.test.ts` gains the
  fixed-now arrival sentence; `page.ssr.test.tsx` gains the masthead pin
  and reads the sentence from the page's own render.
- The fit, from the padding math: "fits the road into the strip of map
  above the sheet at rest, on a phone" now takes the map's top from
  `PLAN_HEADER_PX` (49): strip 212.6, inner area 310 by 141, the road
  fits at zoom 5, and the same arithmetic with U2's 73 px masthead gives
  an inner height of 117 and zoom 4, asserted in the test as the shape of
  the bug. It passed before this change with round 4's 45 hard-coded,
  which is how the country got past it.
- Mutation, rule 1 (every town and place in the first day): in
  `src/lib/plan/days.ts`, `dayFor` set to return `days[0]` regardless of
  the position. `bunx vitest run src/lib/plan/__tests__/days.test.ts
  src/components/__tests__/PlanWorkspace.days.ssr.test.tsx` fails four
  tests by name: "cuts two legs that together exceed a day's budget into
  two days, and lands every town and roadside stop in its day by its
  position along the road" (`expected [ 'Plainview', 'Post', 'Brady', …(1)
  ] to deeply equal [ 'Plainview', 'Lubbock' ]`), "keeps a place beyond
  every stop in the last day, and a stop added behind an earlier one
  leaves the earlier day what the road passed first", "renders two day
  headings in order for a one-stop trip, with the right towns and places
  under each" (`to contain '1 place worth pulling over for'`, the section
  had all three), and "shows the ten strongest places per day and one
  Show all per day only where a day has more than ten" (`'14 places'`,
  the day had 17); the other seven pass. Restored from the copy taken
  first; `cmp` reports the file identical; the two files run 11 green.
- Decisions taken here, for the critic and the council: the arrival
  sentence is built on the page (`today` is the server's UTC day, as
  every deadline on every screen) and shown on the sheet under the trip's
  numbers, not on the masthead, because at 49 characters it wraps the
  masthead to three lines on a 390 px phone and takes back the strip the
  fit needs; the page SSR test reads it from the page's own render. A
  day's towns are the same `RecommendationList` with a `cityIds` filter
  and `notices` off; the notes (why "Stop here" is off, that some places
  did not load, that nothing is written up yet) are said once above the
  days through the exported `RecommendationNotices`, which the list still
  uses on its own. `initialTrip` on `PlanWorkspace` is the SSR tests' way
  to render a trip with legs, as `initialSelectedRoadsideId` was U1's; the
  page never sets it. `ROADSIDE_LIST_PX` and the rest-snap arithmetic
  stay, reworded: the list is inside its day now and reached by a scroll,
  which rule 4 (open, strongest first) allows and U1's "first in the box"
  did not require. For the runner, unchanged from U2: delete `.next` in
  the worktree before the round's dev server, or the screenshot is the
  previous round's stylesheet.
