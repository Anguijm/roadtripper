<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u2-plain-words-and-type`

## Goal

Gauntlet component U2, round 3: plain words and readable type on the four
screens (home, plan, today, trips). The round-2 critic's one failure
(rule 7): the hour buttons and the mood chips measured 26 px on the home
and today screenshots, under the 44 px target. The source had
`min-h-[48px]` on every one of them since round 2. What the critic
measured was round 1's stylesheet: the runner's dev server, started 39 s
after round 2's commit, restored `.next/dev/cache/webpack` (written at
05:44 for round 1's screenshot) and the CSS it served (06:07:56) has no
`.min-h-\[48px\]`, no `.plan-sheet-visible`, the old `.plan-sheet-scroll`
calc, and still the `line-clamp` rules round 2 removed. That one stale
sheet is also the critic's cut "Show all 211" button: without
`.plan-sheet-visible` the scroll box has no height and runs off the
screen. Compiled fresh from this tree, the stylesheet holds every rule.

## Ship rule (written before the code)

1. **The chips are 48 px on the screen, not only in the source.** Two
   things, since a class in the markup is nothing without its rule. The
   stale `.next` is deleted from the worktree, so the next dev server
   compiles the stylesheet from this tree instead of restoring round 1's.
   And a test, `src/app/__tests__/stylesheet.test.ts`, compiles
   `globals.css` through Tailwind the way the build does (PostCSS, the
   sources found from the project root) and fails if the sheet lacks the
   chips' `.min-h-\[48px\]`, the 44 px `.min-h-\[44px\]`, the body face
   at 1rem, the `.num` face, or the sheet's `.plan-sheet-visible` column,
   or still carries a `line-clamp` rule. The chip classes themselves stay
   held by `glossary.ssr.test.tsx`. For the runner, in this file and the
   commit: delete `.next` before each round's server, or the screenshot
   is the previous round's stylesheet.
2. **The along-the-road line is a person's phrase.** "494 miles along, in
   Austin", "131 miles along, past Lubbock", "less than a mile along, in
   Amarillo", and "131 miles along the road" with no town (the critic:
   "494 mi in, at Austin" read as engineer shorthand). Miles, rounded the
   same way as the sheet's "497 mi" (`Math.round` of the miles, as
   `formatDistance`), one unit on one sheet. Held by U1's roadside test
   (six shapes, the singular "1 mile" among them) and its render pins on
   the row and the card.
3. **The mono face is on numbers only, on the today screen's results
   too.** "3 h 45 min away": the time in `.num`, "away" in the body face;
   it was the whole phrase in mono. Held by the today SSR test.
4. **The plan screen's loading and error states are sentence case at 16 px
   in the body face.** `src/app/plan/loading.tsx` and `error.tsx` were
   the two states of the screen no round had read: letter-spaced capitals
   at 12 px in the mono face, "Planning route…" with an ellipsis. Now
   "Planning the route" while it loads, and on a failure "Couldn't load
   the plan page" as a sentence, an error code in the mono face (it is a
   code) and one action, "Back to the start". No `uppercase`,
   `tracking-`, `font-mono`, `text-xs` or `text-sm` on either. Held by the
   glossary test, which now renders both.
5. **Nothing the app pays for changes.** No call, no store, no score, no
   route is touched.

Routed by name, not dropped: the roadside list collapsed to ten of N
behind "Show all N" (rule 4 wants it open) and that button's thumb reach
belong to U1's roadside section in `PlanWorkspace.tsx`
(`ROADSIDE_SHOWN_FIRST`, `ROADSIDE_LIST_PX`), not to U2's rules. The days
view is U3.

**Cost:** $0. Words, classes, one test that compiles CSS, and a deleted
build cache. No new call, no store write, no deploy, no dependency added.

**Weakest part:** The stale stylesheet is the runner's cache, not this
tree's, and nothing in this tree can stop it coming back: the test proves
the sheet compiles from these sources, the purge makes the next server
compile it, but a later round whose server starts over an old `.next`
serves an old sheet again, and the note is a note. Second, the roadside
row's along line can wrap for a long town name ("well-known place · less
than a mile along, in Wichita Falls" is about 400 px at 16 px on a 348 px
row), making that row 66 px where U1's rest-snap arithmetic counts 44;
that was already so with "in, at" and is U1's to count.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, all
  of them there before this branch. `bunx vitest run`: 50 files, 496
  tests, all green (`glossary.ssr.test.tsx` is 10 of them and now renders
  the plan screen's loading and error states too; the new
  `src/app/__tests__/stylesheet.test.ts` is 1, compiling the sheet in
  about 100 ms; U1's roadside test carries the six shapes of the along
  line; the today SSR test pins the face on "3 h 45 min away").
- Why the critic measured 26 px, from the worktree itself, before any
  change: `.next/dev/static/css/app/layout.css` (written 06:07:56, the
  commit was 06:07:17) had `.min-h-\[44px\]` and no `.min-h-\[48px\]`,
  no `.plan-sheet-visible`, `.plan-sheet-scroll` with round 1's
  `calc(100% - var(--sheet-y, 25%) - 45px)`, and four `line-clamp`
  rules; `.next/dev/cache/webpack/client-development/0.pack.gz` dates
  from 05:44, round 1's screenshot. The same `globals.css` compiled
  fresh through `@tailwindcss/postcss` from this tree (85 ms) has
  `.min-h-\[48px\] { min-height: 48px; }`, `.plan-sheet-visible`,
  `.leading-5` and no `line-clamp`. `.next` is deleted; nothing in it was
  tracked.
- Mutation 1, rule 4 and the glossary (a never word back): the loading
  state's line in `src/app/plan/loading.tsx` set to "Finding candidates".
  `bunx vitest run src/components/__tests__/glossary.ssr.test.tsx` fails
  two tests by name: "carries no phrase from the glossary's never column
  on the home form, the plan sheet, the today form, the trips page, the
  itinerary, or the plan screen loading or failed" with `loading:
  /candidates?/i: expected ' ← Roadtripper Finding candidates ' not to
  match`, and "sets no heading, label or button in letter-spaced
  capitals, nothing under 16 px, and keeps the mono face for numbers"
  (`to contain 'Planning the route'`); the other eight pass. Restored
  from the copy taken first; `cmp` reports the file identical.
- Mutation 2, rule 1 (the chips' class gone): `min-h-[48px]` removed from
  the hour buttons in `src/components/DriveBudgetSelector.tsx`. The same
  run fails one test by name, "fits the mood chips: five short words with
  their glyphs, wrapping and never scrolling sideways, 48 px tall like
  the hour buttons", with `expected '<button type="button"
  aria-pressed="f…' to match /class="[^"]*\bmin-h-\[48px\]/`; the other
  nine pass. Restored; `cmp` identical.
- Mutation 3, rule 1 (the rule gone from the sheet): `font-size: 1rem;`
  deleted from `body` in `src/app/globals.css`. `bunx vitest run
  src/app/__tests__/stylesheet.test.ts` fails its one test by name,
  "holds the rules the screens' classes name: 48 px chips, 44 px targets,
  the 16 px body face, the number face, the sheet's column", with
  `expected '/*! tailwindcss v4.2.2 …' to match /body \{[^}]*font-family:
  var\(--font-…/`. Restored; `cmp` identical. The full suite on the
  restored tree: 50 files, 496 tests green.
- Decisions taken here, for the critic and the council: the stylesheet
  test checks presence of rules only, not the absence of `truncate` or
  `line-clamp`, because Tailwind's scan reads every file in the tree,
  the tests included, and a word in a test emits the rule; a cut is a
  class on a name and the glossary test reads the names. `postcss` is
  imported by the test as a hoisted dependency of `@tailwindcss/postcss`
  and `next` (8.5.8 in node_modules), not added to package.json. The
  anchor's "at" became "in" in `src/lib/roadside/anchor.ts` comments and
  the `near` field's doc only; no logic changed. `next-env.d.ts` stays
  uncommitted as in round 2. For the runner: delete `.next` in the
  worktree before each round's dev server, or the screenshot is the
  previous round's stylesheet.

## Council round 1 on #85 (BLOCK, bugs 4), and what changed

The council (Gemini) returned BLOCK with six items, four of them possible
runtime crashes on a failed or missing fetch. Those four rest on a
`"failed"` member of `WaypointFetchResult` that the type does not have:
`src/lib/routing/scoring.ts` declares `status: "fresh" | "degraded"`, and
both members carry `cities`, `waypoints` and `neighborhoods`. A page whose
town read failed passes an empty `"fresh"` set with
`initialCandidateFetchFailed` (`src/app/plan/page.tsx`), and a refresh
whose town read failed answers `waypointStatus: "degraded", waypointFetch:
null`, which `PlanWorkspace` never stores (it keeps the last set and shows
"Couldn't update the places"). So no component can receive a failed
status, and `fetchResult.status !== "failed"` would not compile (TS2367,
no overlap). Item by item:

1. RecommendationList reads `cities` on a failed fetch: answered, not
   applied. There is no failed status to narrow on; the failed state the
   list can receive is the empty set, which draws nothing, since the
   workspace says the failure as the sheet's title. A comment above the
   empty check says so. New tests in `RecommendationList.ssr.test.tsx`
   render the empty fresh set and an empty degraded set (both `""`, no
   throw), a degraded set with a town and no places ("Some of the places
   did not load. Reload to try again."), and a degraded set with rows
   (the note above the rows).
2. `effectiveWaypointFetch` unguarded: answered, not applied. The prop is
   required, `liveWaypointFetch` is only ever set from a refresh that
   returned a set, and both members carry the arrays; a comment above
   the line says so. `PlanWorkspace.ssr.test.tsx`'s zero-state test now
   renders exactly what the page passes on a failed town read and
   asserts the failure, not only no throw: "Couldn't load the towns along
   the road" as the title, the `role="alert"` with "The route is still
   here. Reload to try the towns again.", and no "fits today" sentence.
   A second new test renders a degraded initial set and asserts the
   towns' sentence ("Philadelphia fits today") and the places note.
3. `townsFailed` short-circuit: answered, not applied. `liveWaypointFetch`
   can never hold a failed status; a failed refresh leaves it as it was
   and shows its own notice, so `initialCandidateFetchFailed &&
   liveWaypointFetch === null` is right: once a refresh has replaced the
   failed page fetch the title is the sentence again, and a later failure
   keeps the last set on the sheet rather than saying the towns never
   loaded. The reasoning is now a comment above the line; the test in
   item 2 pins the title while no refresh has replaced the set.
4. Itinerary `legDurations?.[index]` undefined: already true. The line
   after it is `legSecs !== undefined && !failed && <LegTime ...>`, so a
   stop with no leg is drawn without a drive time. A comment says why the
   legs lag the stops (a stop is in the list before its recompute returns
   and stays when that recompute fails). New `Itinerary.ssr.test.tsx`,
   four tests: fewer legs than stops (three stops, one leg: one drive
   line for that leg and one for the final leg, no "NaN", no
   "undefined"), no legs at all (no drive line), more legs than stops
   (the extra ignored), and a failed stop ("Didn't update" and no drive
   line on that stop).
5. Comment above `NAMED_TOWNS` in `src/lib/plan/words.ts`: applied. Two
   names because the sentence is the sheet's title on a phone, about 40
   characters a line at 16 px (36 on a 320 px phone), and it also carries
   "fit today" and "after Lubbock"; two names with the count and the
   after clause is 52 characters, two lines; three names with long towns
   is 79 characters, three lines on the narrower phones, and three names
   with commas read as a list, not a sentence.
6. Comment above `MAX_TRIP_STOPS` in `PlanWorkspace.tsx`: applied, and
   the old comment ("API cost per recompute") was half the truth. Seven
   is not the Routes API's limit (it takes up to 25 intermediates); it is
   this project's own cap, declared three times: `MAX_INTERMEDIATES` in
   `src/lib/routing/directions.ts` (the client throws above it),
   `MAX_STOPS` in `src/app/plan/actions.ts` (answers `too_many_stops`),
   and `MAX_TRIP_STOPS` here, so the three must move together. Every
   stop added or removed is one recompute (a Routes API call, then the
   towns and places along the new route read again), so the cap bounds
   what one trip can cost; and seven stops with the start and the end is
   nine rows on the sheet. The `too_many_stops` label's `${7}` now reads
   `${MAX_TRIP_STOPS}`.

Mutation, item 4: the guard `legSecs !== undefined && ` removed from
`src/components/Itinerary.tsx` (line 134). `bunx vitest run
src/components/__tests__/Itinerary.ssr.test.tsx` fails two tests by name:
"draws a stop with no leg without a drive time, and never NaN, when the
legs are fewer than the stops" with `AssertionError: expected 4 to be 2`
(a drive line on every stop, "NaN h NaN min of driving" on the two with
no leg, from `formatDurationPlain(undefined)`), and "draws every stop with
no drive time at all when no legs are known yet" with `expected 3 to be
+0`; the other two pass. Restored from the copy taken first; `cmp`
reports the file identical.

Gates after the change: `bunx vitest run` 51 files, 504 tests, all green
(8 new: 4 in `Itinerary.ssr.test.tsx`, 3 in
`RecommendationList.ssr.test.tsx`, 1 in `PlanWorkspace.ssr.test.tsx`,
beside the extended zero-state test). `bun run type-check` clean. `bun
run lint` 0 errors, 9 warnings, the same 9 as before.

Cost and weakest part: unchanged by this round. No call, no store, no
score, no route is touched; comments, one label literal, and tests. The
weakest part of the round itself: the failed state is a flag beside an
empty set, which is what the council mistook for a missing guard. A
`failed` member of the union would make the model say it, but that
reaches the page, the action and the scorer, and is not this round's.

## Council round 2 on #85 (CONDITIONAL, two items)

1. `postcss` named in `devDependencies`, pinned to `8.5.8`, the version
   `@tailwindcss/postcss` already resolves to, so the test and the build's
   Tailwind plugin share one copy. `^8.5.6` would have resolved to a newer
   root copy beside Tailwind's nested one: two `postcss` in the tree for
   one test. The lockfile also catches up with `firebase-admin` having
   moved to `devDependencies` earlier; that drift was already there.
2. The thirty-second timeout in `src/app/__tests__/stylesheet.test.ts`
   explained in a comment beside it. Measured: the test runs in about
   0.4 s on this machine; the thirty is headroom for a cold CI runner, and
   the comment says so rather than claiming a slow run that was not seen.

The three deferred items (referrer restriction on the Maps key, a request
sequence on rapid taps, logging the swallowed neighborhood fetch error)
are not this branch's; noted for the round-1 report. Cost and weakest
part unchanged.
