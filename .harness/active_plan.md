<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u38-say-the-overrun`

## Ship rule (written before the work)

U35's critic: since U35, a last day under an hour folds into the one
before ("Day 2 · near Hays to Denver · 4 h 36 min" on a 4 h budget). The
heading shows the figure, but nothing says it is over on purpose.

Ships when:

- **The line.** A day whose drive is over the daily budget carries one
  line under its heading: "36 min over your 4 h, to reach Denver", where
  the place is the day's end as the heading names it.
- **Only there.** No line on a day at or under the budget, or whose drive
  is unknown.

Also required:

- a pure function for the words, with tests
- an SSR test of where the line sits
- mutation proofs
- a live run on Kansas City → Denver at 4 h
- the critic's approval

**Cost:** $0.

**Weakest part:** a stop the person chose more than a budget away (a 5 h
leg to a stop on a 4 h budget) gets the same line. That's true, and it's
said once.

## Built

- `words.ts`: `overrunLine(day, budget)` gives "36 min over your 4 h, to reach Denver". It counts from the minutes the heading shows (whole minutes, cut), so the two agree.
- `PlanWorkspace.tsx`: the line sits under the day's heading button, only when there is an overrun.

## Mutation proofs

All 3 are caught:

- unrounded minutes
- says "0 min over"
- never shown

## Gates

tsc, eslint, vitest (805) and next build are clean.

## Live

Kansas City → Denver at 4 h, day 2: "35 min over your 4 h, to reach Denver". There is no line on day 1, which is within the budget.

## Critic: APPROVE (round 1)

Rules 1, 2 and 5 pass. Nit, noted: the line sits under the heading button, after "See it on the map". It is kept there because the button is the 44 px heading control, and the line is not part of it.
