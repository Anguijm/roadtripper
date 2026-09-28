<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u3-trip-as-days`

## Ship rule (written before the work)

Gauntlet component U3, round 4: the trip told as days (quality bar, rule
5). The critic's one failure on round 3: every capture shows towns and
their in-town places under the days and not one roadside place, and the
dev log says no store was found. The cause is not the days: the store
(`data/roadside.sqlite`, 111 MB, gitignored) lives beside the main
checkout's atlas, and `resolveStorePath` looked in the worktree's own
`data/` alone, so the runner's dev server in `roadtripper-u3` never
opened it. The main store holds 744 scored places above the line in the
Amarillo to Austin box (Cadillac Ranch at 0.89, the Big Texan at 0.83,
Palo Duro Canyon at 0.72). This round points the app at it and closes
the three smaller notes: the sheet that said "over 2 days" over one "Day
1", each day's sentence told twice, and Fort Worth's name clipped at the
map's edge.

**Cost:** $0 in API calls; one council run on the hook change, cents.

1. **The dev server finds the store from a worktree.** `resolveStorePath`
   in `src/lib/roadside/store.ts` looks, after `ROADSIDE_STORE_PATH`, the
   working directory's `data/` and the standalone output, in the main
   checkout's `data/` when the working directory is a linked git worktree
   (its `.git` is a file, `gitdir: …/.git/worktrees/<name>`; pure
   `mainWorktreeDir(cwd)`). Once per process the log says which path was
   opened (`[roadside] store: …`), so a capture with no diamonds can be
   read against the log. Held by tests in `store.test.ts` on temp
   directories: the worktree's own file wins over the main checkout's,
   the explicit path over both, and a plain checkout or no `.git` falls
   back to nothing. The worktree's untracked `.env.local` also names the
   main checkout's file in `ROADSIDE_STORE_PATH`, belt and braces for the
   runner. The store itself, its scores and its line are not touched
   (hard stop); it is opened read-only as before.
2. **A stretch is labelled by the days it takes.** A stretch longer than
   the daily budget stays one section (the settled reading) and its
   heading counts the days: "Days 1 and 2 · Amarillo to Austin · 7 h 50
   min, over the 4 h you wanted"; three or more, "Days 1 to 3". The next
   stretch starts at the next number ("Day 1 · Amarillo to Lubbock · 1 h
   43 min", then "Days 2 and 3 · Lubbock to Austin · 6 h 1 min, over the
   4 h you wanted"). The count is `ceil(minutes / budget)`, the same
   reading as `legsQuantizedDays` in trip-state.ts (a 6 h leg on a 4 h
   budget costs two days), so the day numbers and the deadline math can
   never disagree; the deadline arithmetic is not changed. `TripDay`
   gains `firstDay` and `daysSpanned` in `src/lib/plan/days.ts`; the
   sentence is `dayHeadingLine` in `src/lib/plan/words.ts`. The title's
   "fits in day N" takes N from the last stretch's `firstDay`, the day
   the towns are listed under. Round 3's capture read "8 h of driving
   left over 2 days" over "Day 1 · Amarillo to Austin"; now it reads over
   "Days 1 and 2 · Amarillo to Austin".
3. **Each day is told once.** The strip of day rows under the numbers
   (round 3) goes: it repeated each day's heading. In its place, for a
   trip of two or more stretches, one sentence under the driving-left
   line says the trip's shape without repeating a heading: "Three days,
   with a night in Lubbock", "Four days, with nights in Lubbock and
   Abilene" (`tripShapeLine`; the count in words, the nights the stops).
   A trip of one stretch says nothing there: its one heading is a few
   lines down. The headings keep their 44 px button and their second
   line ("See it on the map" / "See the whole trip"); the sections keep
   their open lists (rule 4). Held by `PlanWorkspace.days.ssr.test.tsx`:
   each heading sentence appears once in the markup, the shape line sits
   between "of driving left" and the first alert, and a one-day trip has
   none.
4. **No name clipped at the map's edge.** While a day is framed, a town
   outside it keeps its faded dot (`OFF_DAY_OPACITY`, round 3) and its
   name is not drawn (`Marker.setLabel(null)`); the whole trip restores
   every name. Nothing moves (rule 6). Round 3's day-tap capture showed
   "For" at the right edge: Fort Worth is off day 1 and its dot sat at
   the edge with its name cut. The rule is `candidateOpacity` as before;
   the label follows it, and the days SSR test pins the line in
   RouteMap.tsx.
5. **Unchanged and not touched:** the day cut by position along the
   road and its tests; the deadline arithmetic in `trip-state.ts`; the
   fit at rest (PLAN_HEADER_PX, the masthead, the fit test) and the fit
   per day; the arrival sentence; the roadside card and rows; "Show all
   N" per day; no new routing call.

Routed by name, not dropped: the driving-left line says "2 h 16 min of
driving left today" after a stop on a trip without dates, because the
trip's budget is one day's when no dates were given (the documented
default in PlanWorkspace) while the stretches make more days; whether a
trip with no dates should budget a day per stretch is the operator's
call, a change to the budget's arithmetic, not its words. The mood chips
still sit above the days (U5).

**Cost:** $0. No new routing call, no store write, no score touched, no
dependency added, no deploy. The store is read from where it already is;
the resolver reads one small `.git` file. The runner's dev server calls
the routes API once per distinct route as before.

**Weakest part:** The store fallback depends on the worktree layout git
writes (`.git/worktrees/<name>`), which is git's documented layout but
not one the app controlled before; a worktree made another way still
has `ROADSIDE_STORE_PATH`. Second, "Days 1 and 2" for a stretch with no
stop chosen names days whose end is not chosen; the towns that fit
under it with "Stop here" are the choice, and the wording says nothing
of where the unplanned night falls. Third, the shape line names the
nights at stops only: "Three days, with a night in Lubbock" leaves the
second night, somewhere between Lubbock and Austin, to the heading
below.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, the
  same 9 U2 and rounds 1 to 3 recorded, none new. `bunx vitest run`: 51
  files, 519 tests, all green (round 3 left 516; 3 are new, and the
  strip test is reshaped, not added). New or
  reshaped: `store.test.ts`: "finds the main checkout's store from a
  linked worktree, and lets the worktree's own file and the explicit
  path win" (temp dirs); "names no store from a plain checkout, or with
  no .git at all". `days.test.ts`: "counts the days a stretch takes by
  the budget, and numbers the next stretch from there" (200, 270 → 1,
  then 2 and 3; 200, 240, 241 → 1, 2, 3 and 4; an unknown leg counts
  one). `PlanWorkspace.days.ssr.test.tsx`: "says the trip's shape in one
  line under the numbers, tells each day once, and says nothing for a
  one-stretch trip" (replaces the strip test); the headings "Days 2 and
  3 · Lubbock to Austin · 4 h 30 min, over the 4 h you wanted" and
  "Days 1 and 2 · Amarillo to Austin · 7 h 50 min, over the 4 h you
  wanted"; "fades the towns of the other days…" now also pins the label
  line. `glossary.ssr.test.tsx`: the shapes of `dayLabel`,
  `dayHeadingLine` and `tripShapeLine`.
- Mutation, rule 1 of round 1 (every town and place in the first day):
  in `src/lib/plan/days.ts`, `dayFor` set to return `days[0]` regardless
  of the position. The days unit test and the days SSR test fail by
  name: "cuts two legs that together exceed a day's budget into two
  days, and lands every town and roadside stop in its day by its
  position along the road", "keeps a place beyond every stop in the last
  day…", "renders two day headings in order…", "keeps a stop's town and
  its places under the day it ends…", "shows the ten strongest places
  per day…": five of sixteen. Restored; `cmp` identical.
- Mutation, rule 1 of this round (the resolver looks in the worktree
  alone): the main-checkout candidate removed from `resolveStorePath`.
  `store.test.ts` fails one by name: "finds the main checkout's store
  from a linked worktree, and lets the worktree's own file and the
  explicit path win" (`expected null to be '…/main/data/roadside.sqlite'`).
  Restored; `cmp` identical.
- Verified on this machine, not a test (a throwaway test file, run and
  deleted): `resolveStorePath(process.cwd(), undefined)` from the
  worktree's directory answers
  `/home/johnanguiano/projects/roadtripper/data/roadside.sqlite`, and
  `survivorsAlongRoute` on a road drawn by the towns from Amarillo to
  Austin (Canyon, Tulia, Plainview, Lubbock, Post, Snyder, Sweetwater,
  Abilene, Brownwood, Lampasas) answers 227 places, the Big Texan Steak
  Ranch (0.83) the strongest. The page's own polyline will differ; the
  point is that the store opens and the corridor is not empty.
- Decisions taken here, for the critic and the council: the store
  fallback is in code, not only in the runner's environment, so every
  future worktree finds it; the explicit path and the working directory
  still win, so a deploy is unchanged. The stretch keeps one section and
  its heading counts the days rather than the section being split at an
  unchosen night: a split would invent a stop. The strip went rather
  than the headings: the headings are the sections' own and the settled
  reading names them. Off-day names are hidden rather than moved (rule
  6) or kept: kept, one sat clipped at the edge. `next-env.d.ts` in this
  worktree carries the dev server's own edit and is not in the commit.
  For the runner, unchanged: delete `.next` in the worktree before the
  round's dev server; the dev log now says `[roadside] store: …` once;
  the two-day screenshot at rest after adding Lubbock shows "Three
  days, with a night in Lubbock" under the numbers and, under each day,
  the towns then the places worth pulling over for, strongest first,
  with amber diamonds on the map; the day-tap screenshot shows Day 1's
  heading at the top of the sheet, the map on Amarillo to Lubbock, and
  the other days' towns as faint dots with no name.
