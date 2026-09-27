<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/reason-leads`

## Goal

Step 14, the last of stage 3: rebuild the plan screen so the reason leads.
Today a candidate card is a city name, an add button, then spots; on a
phone the sheet's sticky header (persona bar, budget block, candidates
line, save button) and the itinerary sit above the first card, so "why
this city" is below the fold. Done when you can answer "why this city"
without scrolling.

## Ship rule, written before the work

1. Each candidate card leads with its reason: the top-ranked spot for the
   persona that has a description, its name and its description, comes
   first in the card, before the other spots. In the server render the lead
   precedes every other row of that card. (Amended during the work: the
   first draft said "top-ranked spot"; a fixture where the top spot had no
   description showed that leads with nothing to say. Every real waypoint
   has one, so in practice they are the same.)
2. The sticky header gets shorter: the Save button moves to the bottom of
   the scroll area (still one tap), and the "Candidates (N) · max" line
   folds into the status row. Nothing is removed, only moved down or
   merged.
3. With stops in the trip, the itinerary shows as one line, "2 stops ·
   Lubbock, Austin · 7 h 20 min", with a toggle (a button, aria-expanded)
   that opens the itinerary as it is today. Collapsed by default, so the
   first card follows it directly. The prior council decision that the
   itinerary sits above the recommendations is kept.
4. The arithmetic for "without scrolling", on a 667 px phone at the sheet's
   middle snap (55% visible, 367 px): handle 44, persona bar about 44,
   status row about 40, itinerary line about 36, card header 44: the lead
   begins about 208 px down, with about 160 px to spare for it. Written in
   the plan; not measured by a test.
5. Nothing calls out. Cost $0.

**Cost:** $0.

**Weakest part:** Rule 4 is arithmetic, not a screenshot. There is no
browser test runner, so the pixel claim rests on the class list and the
sum above. The lead is the top-ranked spot's description, which is only as
good as the description (steps 19 to 25 make it good). And the map still
draws the old 180-degree arc, unchanged since step 8, noted again because
this is the map's screen.

## Gate 1 proofs

- Rule 1: with the lead rendered after the rows (the old order), "leads each card with the top spot that has a reason, before every other row" fails. Restored.
- Rule 3: with the summary line dropping the stop names, both summary tests fail. Restored.
- Rule 2: the workspace server-render test still passes with the header restructured and Save at the bottom.
- 384 tests, 5 new; lint and types clean.

## Council round 1 on #59 (CONDITIONAL, bugs 6, maintainability 5), and what changed

- the itinerary details element is always in the DOM, `hidden` when collapsed, so `aria-controls` resolves; the Itinerary stays mounted across a collapse
- one unknown leg makes the summary's drive unknown rather than a smaller partial sum; tested
- the updating pulse is #e3b341, brighter amber
- the fold budget arithmetic is written above the sticky header, with the instruction that anything added there comes out of the lead's 160 px

## Council round 2 on #59 (CONDITIONAL, bugs 8), and what changed

- Save is disabled while a recompute is in flight; deliberately not after a save, since the trip can change again and saving again is how it is kept
- the lead is excluded from the rows by `waypointId`, not by reference
- comments: why the pulse is #e3b341; that legs are seconds and the direct leg is minutes converted
- Pushed back on optional chaining for `tripState.legs`: never undefined, and the identical expression has fed the Itinerary since before this PR
- Verified by a phone-emulated screenshot (390 by 844): the first candidate's reason is fully visible at the sheet's middle snap without scrolling. The first capture with Chrome's plain --screenshot flag looked clipped; that was the tool, not the page, and was measured (scrollWidth 390 at innerWidth 390).
