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
