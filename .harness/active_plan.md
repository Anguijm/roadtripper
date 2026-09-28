<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u2-plain-words-and-type`

## Goal

Gauntlet component U2, round 2: plain words and readable type on the four
screens (home, plan, today, trips). Round 1 put the glossary's words and
the Geist body face on every screen. The round-1 critic's one failure
(rule 2): the home screen's "Pick the dates" button is set in the mono
face although it is words. Fixed first, then the rest of what the spec
needs that the critic also saw: the plan sheet's header sentence is not
the first thing a person sees; nine description lines end in a painted
ellipsis; the hour buttons and mood chips measure a pixel under 44; the
trips screen has nothing to press but the back link.

## Ship rule (written before the code)

1. **The mono face is on numbers only, never on words.** The home form's
   date button reads "Pick the dates" or "Pick the arrival date" in the
   body sans; once a date is chosen only the date itself sits in a `.num`
   span ("Arrive by <num>Oct 14</num>", "<num>Oct 10</num> to <num>Oct
   14</num>"). A saved trip's card the same: "Arrive by" and "to" are
   sans, the dates mono. Held by `glossary.ssr.test.tsx`: the idle button
   carries no `num` class, and a form opened with dates renders the date
   in a `.num` span with the words outside it.
2. **The sheet's title is the sentence, and it is the first thing seen.**
   The plan sheet's handle row carries "Lubbock and Abilene fit today" (or
   "Nothing fits today; drive on to Austin", or after a stop "Abilene fits
   today after Lubbock") above everything, at every snap, and on a wide
   screen as the side panel's title. The roadside section stays the first
   child of the scroll box (U1's pin), and the box's height is now the
   visible part of the sheet less the handle, whatever the handle's height
   (`.plan-sheet-visible`, a flex column), so a title that wraps to two
   lines shortens the box instead of pushing its bottom off the screen.
   The rest-snap arithmetic (537 px of box, 520 used) holds for the
   one-line title, which is every title on the fresh sheet. Held by the
   glossary test (the title precedes the roadside heading) and U1's
   roadside test, whose two pins on the order and the CSS move with the
   structure and pin the new one.
3. **Text wraps; nothing is cut.** No `line-clamp` remains on the four
   screens: a description (at most 234 characters in the atlas, five lines
   on a phone) wraps like a name does. Held by the glossary test, which
   fails on any `line-clamp` or `truncate` class in the renders.
4. **No text under 16 px anywhere a screen renders.** The itinerary's
   10 px bullets become CSS dots and its 10 px stop number a 16 px digit
   in a 24 px badge; the itinerary joins the glossary test's renders (two
   stops) so its classes are read too. `tracking-tight` leaves the
   headings.
5. **Targets are 48 px.** The hour buttons and the mood chips carry
   `min-h-[48px]`, a few pixels over rule 7's 44, so a measurement of the
   painted box cannot land under it. Held by the glossary test.
6. **Every screen has its one action, and a disabled button says why.**
   The trips screen's empty state (and its blocked-storage state) ends in
   a "Plan a trip" button. On the plan sheet, when the trip is full, one
   line above the towns says "The trip has all the stops it can hold; take
   one out to add another" instead of seven silently disabled buttons.
   The trips page joins the glossary test's renders.
7. **Nothing the app pays for changes.** No call, no store, no score, no
   route is touched.

**Cost:** $0. Words, classes, one CSS rule, and tests. No new call, no
store write, no deploy.

**Weakest part:** The sheet's title lives on the handle row, and its
height is bounded by words, not by a rule: one line for every sentence the
fresh sheet can say, two lines after a stop when nothing fits and the
towns' names are long ("Nothing fits today after Lubbock; drive on to
Austin" is 52 characters, about 420 px at 16 px). Two lines cost the box
24 px at rest, which the roadside section's 17 px of slack does not
cover: "Show all N" would then sit 7 px under the fold until a drag. The
runner's screenshot is the fresh sheet, where the title is one line; the
two-line case is real but rare and is recorded here rather than solved
with a shorter sentence.

## Gate 1 proofs

- `bun run type-check`: clean. `bun run lint`: 0 errors, 9 warnings, all
  of them there before this branch. `bunx vitest run`: 49 files, 495
  tests, all green (`glossary.ssr.test.tsx` is 10 of them, up from 7: the
  sheet's title first, the date button's face, the trips screen's action;
  it now also renders the trips page and the itinerary with two stops).
- Mutation 1, rule 1 of round 1 (a never word back): the row's add button
  in `src/components/RecommendationList.tsx` set to `"Add city to trip"`
  in place of `"+ Stop here"`. `bunx vitest run
  src/components/__tests__/glossary.ssr.test.tsx` fails two tests by
  name: "carries no phrase from the glossary's never column on the home
  form, the plan sheet, the today form, the trips page or the itinerary"
  with `sheet: /add city to trip/i: expected '...' not to match`, and
  "keeps the verb on a disabled button and says why beside it" (the full
  trip's button no longer reads "+ Stop here"); the other eight pass.
  Restored from the copy taken first; `cmp` reports the file identical.
- Mutation 2, rule 1 of this round (the mono face back on words): the
  date button in `src/components/RouteInput.tsx` given `num` in its class
  again. The same run fails one test by name, "sets the date button's
  words in the body face and only a chosen date in the mono face", with
  `expected '<form ...' not to match /<button[^>]*class="[^"]*\bnum\b...`;
  the other nine pass. Restored; `cmp` identical.
- Decisions taken here, for the critic and the council: the sheet's
  sentence moved from the scroll box to the handle row, so U1's roadside
  test changed two pins to the new structure (the sentence precedes the
  section instead of following it; the CSS pin reads `.plan-sheet-visible`
  and the box's `flex: 1 1 0%; min-height: 0` instead of the fixed
  `calc(... - 45px)`); the section is still the scroll box's first child
  and the rest-snap arithmetic is untouched. The towns-failed alert box
  now says "The route is still here. Reload to try the towns again." with
  the failure itself in the title. The "See what is in X" aria-label on
  the town's button is gone: its name is its visible words, "What's in
  X". The today screen's "One-way drive times." is "Drive times are one
  way." The half-picked range on the home form reads "Starts Oct 10; pick
  the end date" in place of "Oct 10 to ?". `next-env.d.ts` in this
  worktree was regenerated by a dev server (`.next/dev/types`) and is
  left uncommitted.
