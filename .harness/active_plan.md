<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u2-plain-words-and-type`

## Goal

Gauntlet component U2, round 1: plain words and readable type on the four
screens (home, plan, today, trips). Every visible string is checked against
the glossary in `gauntlet/quality-bar.md` and written in sentence case; the
body face becomes Geist (sans) at 16 px or more on a phone, with the mono
face kept for numbers, distances, times and codes only; no name is cut with
an ellipsis; a disabled button says why in a line beside it and keeps its
verb. Words and type only: no layout change beyond what wrapping needs, no
change to what the app fetches or scores.

## Ship rule (written before the code)

1. **No glossary word on a screen.** The never column of the quality bar
   (candidates, max N min, detour minutes, primary, see what's here, add
   city to trip, recompute, refresh, pending, budget left, persona,
   waypoint, neighborhood, roadside stops along the way) appears in no
   visible string, no `sr-only` text and no `aria-label` on the four
   screens. The plan sheet's header is a sentence built from the data,
   `fitsTodayLine`: "Lubbock and Abilene fit today", "Nothing fits today;
   drive on to Austin", and after a stop "Abilene fits today after
   Lubbock". Counts and minutes are never labels: the town header carries
   "2 h 5 min away" as a phrase, the "+40m" is gone. Held by
   `glossary.ssr.test.tsx`, which renders RouteInput, PlanWorkspace (with
   a town, two places and two roadside stops) and TodayStart, strips the
   tags and fails on any never phrase, case-insensitive, and on any text
   node that is a bare minutes count.
2. **Sentence case, one normal face.** Geist (sans) is loaded beside Geist
   Mono in `layout.tsx` and is the body face (`globals.css`); every text on
   the four screens is `text-base` (16 px) or larger; no `uppercase` and no
   `tracking-` class remains on a heading, a label or a button there; the
   masthead reads "Roadtripper" and the plan header "Amarillo to Austin".
   The mono face is the `.num` class, applied only where a number is shown
   (distances, times, dates, hour chips). Held by the glossary test, which
   also fails on any `uppercase` class in the three renders.
3. **No name cut with an ellipsis.** `truncate` and `line-clamp` are gone
   from every place name, town name, trip name and persona chip; a name
   wraps (`break-words`). `line-clamp` stays only on description
   paragraphs (`data-reason`). Held by the glossary test, which walks the
   markup with a tag stack and fails if any ancestor of a fixture name or
   chip word carries `truncate` or `line-clamp`.
4. **A disabled button says why beside it and keeps its verb.** The home
   form's button reads "Plan the trip" and the today form's "Show me what's
   in range" whether or not they are enabled; the reason ("Choose where you
   are first", "Choose where you're going first", "Pick the dates first")
   is a line under the button, `aria-live`, and empty when the button is
   enabled. Held by the existing SSR tests, whose expectations move to the
   new words.
5. **Persona chips fit 390 px without scrolling.** Labels are Culture,
   Food, Nerd, Gear, Outdoors with their glyphs; the row wraps
   (`flex-wrap`), never scrolls sideways, and no chip carries `truncate`.
   The label change is copy in `src/lib/personas/index.ts`; scoring reads
   ids, not labels.
6. **Nothing the app pays for changes.** No call, no store, no score, no
   route is touched; `maxDetourMinutes` is dropped from PlanWorkspace's
   props because no screen says it any more (U1 left the decision to U2:
   the detour cap's replacement is "nothing").

**Cost:** $0. Words, classes, one font, and tests. No new call, no store
write, no deploy.

**Weakest part:** The 16 px floor is enforced by hand, class by class on
the four screens, not by a rule the runner can read: a `text-sm` on a
branch the SSR tests do not render (the plan page's error screens, the
trips page's blocked-storage notice) would slip through until the
screenshot; the map's no-key placeholder was one such and was caught by
reading, not by the test. The bare-minutes rule in the glossary test is a text-node
rule, so a minutes count typed as part of a longer node ("Lubbock 40m")
would pass it; the same test's phrase list catches the known shapes.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, all
  of them there before this branch. `bunx vitest run`: 49 files, 492
  tests, all green (the new `glossary.ssr.test.tsx` is 7 of them).
- Mutation 1, rule 1 (a never word back): `TIER_LABELS.primary` in
  `src/components/RecommendationList.tsx` set to `"Primary"` in place of
  `"★ The pick"`. `bunx vitest run src/components/__tests__/glossary.ssr.test.tsx`
  fails one test by name, "carries no phrase from the glossary's never
  column on the home form, the plan sheet or the today form", with
  `sheet: /\bprimary\b/i: expected '...' not to match`; the other six
  pass. Restored from the copy taken first; `cmp` reports the file
  identical.
- Mutation 2, rule 3 (an ellipsis back on a name): the row's place name
  in the same file given `truncate` in place of `break-words`. The same
  run fails one test by name, "cuts no name with an ellipsis: no place,
  town or chip sits under truncate or line-clamp", naming the element:
  `"National Ranching Heritage Center" under text-base text-[#f0f6fc]
  truncate`. Restored; `cmp` identical.
- Decisions taken here, for the critic and the council: the detour cap's
  prop `maxDetourMinutes` is gone from PlanWorkspace, the plan page, the
  health page and the tests (its replacement is nothing); the "Other"
  tier badge is no longer drawn (a badge that says "Other" is noise at
  16 px; "★ The pick" and "Also good" remain); the row's own copy of the
  town's drive time ("40m") is gone, the town header says "2 h 5 min
  away" once; `RecommendationList` renders nothing when no town fits,
  because the sheet's sentence ("Nothing fits today; drive on to
  Austin") already says so. The health page's hidden "Budget left"
  canary is untouched: it is the uptime check's matcher, not a screen.
