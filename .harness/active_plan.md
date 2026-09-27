<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/arrival-date-through`

## Goal

Step 9: carry the arrival date through. The picker has an arrival mode,
the plan page derives a start date from it and shows deadline pressure,
and that is where it stops. A saved trip forgets it was an arrival-date
trip, the plan header does not say the date, and the today screen has no
idea you have somewhere to be. Done when every screen knows your deadline.

## Ship rule, written before the work

1. One module says what a deadline means: `src/lib/plan/deadline.ts`, pure,
   with `daysUntil`, `formatDeadline` and `deadlineLine`, tested including
   "today", "tomorrow" and "passed".
2. The plan header shows it: "Arrive by Oct 14" in arrival mode, the range
   otherwise. Server-rendered, tested.
3. A saved trip remembers it was an arrival-date trip. Reopening it sends
   `dateMode=arrival` and the end date, so the start date is re-derived
   from the route, not frozen at save time. Old saved trips without the
   field still open exactly as before. Tested at the storage layer.
4. The today screen can be told the deadline and the destination
   (`arriveBy`, `toName`, `toLat`, `toLng`). It shows one line, "Arrive in
   Austin by Oct 14, 6 days left", on the start screen and the results, and
   offers one link, "Plan the trip to Austin from here", which opens the
   planner in arrival mode with the date set. The per-city "plan a trip
   here" links stay trips to that city and carry no date: the deadline is
   for Austin, not for Lubbock, and putting it on Lubbock would be a lie.
   (Amended from the first draft, which said every link would carry it.)
   Locating on the start screen keeps the deadline through Go. Without
   those parameters the screen is unchanged.
5. The home page accepts `dateMode=arrival` and `endDate` in the handoff,
   so a link can open the planner already in arrival mode.
6. Nothing here calls out. Cost per open stays $0 on the today screen; the
   plan page's calls are unchanged.

**Cost:** $0. Dates are arithmetic.

**Weakest part:** The today screen knows the deadline but does not yet use
it to judge the cities it lists; "six days left and Albuquerque is on the
way" is step 10, the feasibility line. Here the deadline is carried, shown
and passed on, not reasoned about. And "days left" is computed against the
server's clock in UTC, which near midnight can differ from John's day by
one; the line says the date, so the number is a convenience, not the
truth.

## Gate 1 proofs

- Rule 2: with the header's arrival branch disabled, "arrival mode: says Arrive by the date" fails. Restored.
- Rule 3: with `dateMode` removed from the saved-trip schema, both storage tests fail (the field is stripped on save, and an invalid mode is accepted). Restored. With the card's arrival branch disabled, "reopens an arrival-date trip in arrival mode" fails. Restored.
- Rule 4: the today page test asserts the deadline line, the one arrival-mode link to the destination, that per-city links carry no date, that the change link keeps the deadline, that the start screen shows it, and that a bad date or a missing destination shows nothing.
- Rule 5: the home page test opens in arrive-by mode with "Arrive by Oct 14" from the URL, and a bad date leaves the picker empty.
- 351 tests, 17 new; lint and types clean. The plan page now has a server-render test of its own, with the paid calls mocked.

## Council round 1 on #55 (CONDITIONAL, bugs 8), and what changed

- `DAY_MS` named, with why UTC midnight makes plain division exact and local midnight would not
- Answered, not changed: there are no Firestore rules to verify. Saved trips have lived in localStorage since #47; the schema is the only rule, `dateMode` is optional there, and the storage test loads a record written without it.
