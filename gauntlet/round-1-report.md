# Round 1 of the interface build: report

Ship rules are in `round-1.md`, declared before the first build. This file grows a section per component as it lands.

## U1, roadside stops first-class (2026-09-29)

Six builder/critic rounds, then the operator, then one fix round.

- Rounds one and two delivered the component: a card on tap with the five parts, the
  list open with the ten strongest and "Show all N", the arc gone, the sheet's numbers
  as sentences. The "N" that sat over the sheet turned out to be Next's dev-mode
  button, not the map's compass.
- Round three's critic noted two diamonds stacked at Amarillo. The builder answered by
  spreading overlapping diamonds apart, and rounds four to six elaborated that until
  places in Amarillo and Austin were drawn in New Mexico and near Louisiana and moved
  when tapped. The critic rejected each round for the right reason (rule 6: the map
  showed machinery, not the trip); the builder closed the distance on the wrong thing.
- At six, the state went to the operator with the screenshots. His decision: keep
  rounds one and two, remove the spreading, draw every diamond where its place is;
  overlap at state zoom is what the zoom rule and a pinch are for. One fix round,
  approved.
- Council on the code: three rounds, the cap; five, three and three items, all guards
  and comments except one (contrast) answered with measurements. Merged as #83.

Lesson for the bar, applied to rule 6: a diamond is drawn at its place's position and
never moved; overlapping diamonds are allowed. A critic's note about overlap is not a
licence to move markers, and a spec that says "cluster or stack" is read as "move" by a
builder under pressure; say "never move".

## U2, plain words and readable type (2026-09-29)

Three builder/critic rounds, approved in the third; the council on the code, three rounds
to the cap, then a fourth run on the lockfile push, clear.

- Round one rewrote the words and swapped the body face to Geist at 16 px with the
  mono face kept for numbers; the critic failed it on chips that measured 26 px high
  and a name still clipped. Round two's builder found the cause was not the code: the
  runner's dev server had served round one's stylesheet from Next's webpack cache in
  `.next`, so the screenshot showed the previous round's CSS. The worktree's `.next`
  is now deleted before each round's server, and the plan says so.
- Round three: every app string on the four screens is sentence case with no glossary
  word; the plan sheet's header is a sentence from the data ("Lubbock and Oklahoma City
  fit today"); body text is Geist at 16 px everywhere but the home title at 24; the
  only smaller text is Google's own map chrome; no ellipsis anywhere; no horizontal
  overflow. Two tests hold it: a glossary test over the rendered home, plan (with its
  loading and error states) and today screens, and a stylesheet test that compiles the
  CSS and pins the sizes and the targets.
- Council: round one blocked on six items, four of them crashes on a failed fetch that
  the type makes impossible (a failed fetch arrives as an empty set with a flag), each
  answered with a comment at the line and a test rendering the real failed state; round
  two conditional on two hygiene items (`postcss` named as a dependency, a timeout
  explained); round three clear. The `postcss` line then took three pushes: CI installs
  with `npm ci` and the desk with `bun`, and a version that is right for one lockfile
  can be wrong for the other. Merged as #85.
- Seen and routed to U3 by name: the plan map at rest frames the whole country rather
  than the road, a fit regression from the sheet's new height; U3 redraws the fit per
  day and at rest.

Lessons made executable: the runner's purge of the build cache is in the workflow's
prompt, and Gate 1 now checks the npm lockfile against `package.json` whenever either
changes, since the council's "add the dependency" cost two failed pushes that a
two-second dry run would have caught at the desk.

## U3, the trip told as days (2026-09-29)

Six builder/critic rounds, approved in the sixth, the last the bar allows.

- Round one built the days, the tap that fits a day and the fit at rest, and lost the
  towns: once Lubbock was a stop its town and places left the day list for a collapsed
  row above the days. Round two kept them under the day but put day two eleven hundred
  pixels below the fold. Round three drew no roadside place at all: the dev server in
  the worktree found no store, because the store is gitignored and lives only in the
  main checkout; the builder taught the store lookup to find the main checkout from a
  linked worktree's `.git` file (a deploy has no `.git`, so nothing changes there).
- Rounds four and five were the days themselves: a stretch longer than the daily budget
  was one heading ("Days 1 and 2 · Amarillo to Austin") with no cut, then the title said
  "Fort Worth fits in day 2" while the section listed Fort Worth under day three. Round
  six reads the title and the sections from one assignment, cuts a long stretch at the
  budget ("Day 1 · 4 h down the road from Amarillo", "a night on the road") and lists the
  towns that fit under the day they fall in.
- Approved on: sentence-case words with no glossary word; the town's places and the
  roadside rows under each day heading; a heading per day with where it starts, where it
  ends and how long it drives; the road filling the map above the sheet at rest and a
  day's stretch after its tap; every control at least 44 px; "Arrive in Austin by
  October 14, fifteen days from now".
- The pure grouping lives in `src/lib/plan/days.ts` with its tests; `Itinerary.tsx` and
  the itinerary summary are gone, replaced by the days. Three mutations of the assignment
  recorded in the plan, each failing tests by name.

- Council on the code: three rounds to the cap. Round one, eight items: six comments,
  a hydration check on the deadline's "now" (the server passes today as a string and
  the browser's clock is read only after mount, so none), and the store's path logged
  in production (now said in words, never the path). Round two, one item: the
  production build run with the server fourteen hours ahead of UTC and the browser
  ten behind, no hydration warning, the far-zone line moving from fifteen to sixteen
  days after mount with nothing printed. Round three blocked on four: two were the
  phantom fetch state from #85, shown impossible by tests that render every member of
  the type; one was real, a route answer for a stop just taken out landing on an
  emptied trip after two quick taps, fixed with a sequence rule and its test; one made
  the worktree lookup return at once in production. Merged as #87 with the skip marker
  on the last push, the cap being the rule.

Lesson for the runner: a worktree has no gitignored data; give the dev server the store
(the lookup now finds it, and `ROADSIDE_STORE_PATH` always did) before judging a screen
that depends on it. Round three's failure was the harness, not the component.

## U4, a shorter home (2026-09-29)

Two builder/critic rounds, approved in the second.

- Round one delivered the shape: the title, one example line, From, To, the hours and
  "Plan the trip" inside one phone screen with nothing below the fold; dates and the
  mood under "More: dates and what I'm in the mood for", closed unless the URL carries
  dates; "Use where I am" inside the From field as "Here". The critic failed it on two
  pixels: the To input measured 42 px inside its box against the From's 44.
- Round two moved the 44 px minimum from the box to the input, so both fields measure
  the same, and was approved: every control 44 px or more, no glossary word, no
  horizontal scroll, the fold's open content ending at 815 of 844, and the button
  opening the plan page with the same trip in the URL (from, to, budget), which is the
  constraint the spec set.
- The example line reads two names from the store when the server finds it and falls
  back to "the Cadillac Ranch and the Big Texan" when it does not; a test pins the
  sentence for both. A new test holds the fold closed without date params and open
  with them. Two mutations recorded in the plan, each failing one test by name.
- Council on the code: one round of five items, four comments and a check that the plan
  page validates the mood it now receives from the home (it does, through a zod enum
  that falls back to the default for anything else; a test now pins that for
  "banana", capitals, a list and an empty value). Three of the council's claims were
  wrong and are corrected at the line: the stylesheet test does not guard the field's
  44 px, the plan page refuses half a date range with an error screen rather than
  failing silently, and no test measures the fold's height.
- Routed on by name: the chips as one row to U5; the plan sheet's town row, which the
  critic saw overlapping its buttons on the plan page reached from the home, was U3's
  and is redrawn there.
