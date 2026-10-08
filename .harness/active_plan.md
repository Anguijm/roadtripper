<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u35-fold-a-short-last-day`

## Ship rule (written before the work)

The operator's choice, 2026-10-08: "Fold it in". When a stretch's last
day would be under about an hour (Kansas City → Denver at 4 h: day 3 is
37 min to Denver, with a night "near Byers" 37 min short of it), drive on
to the stretch's end the day before. That day runs up to an hour over
the budget, and the trip has one night fewer.

Ships when:

- **One helper.** A single `stretchDays(minutes, budget)` counts the days
  a stretch takes: ceil(minutes / budget), less one when the last day
  would be under FOLD_MINUTES (60). Every count uses it: the day list
  (`daysSpannedBy`), the deadline (`legsQuantizedDays`, the remaining
  drive) and the spare days, so they can never disagree.
- **Every stretch.** It applies to a stretch that ends at a stop and to
  one that ends at the destination; a 20 min overrun to a stop folds too.
- **Live.** Kansas City → Denver at 4 h shows two days, "Day 2 · near
  Hays to Denver · 4 h 37 min".

Also required:

- tests: the helper, the days, the deadline count
- the old expectations that encoded the extra night updated
- mutation proofs
- a live run
- the critic's approval

**Cost:** $0.

**Weakest part:** 60 min is a guess at what a person will push on for.
The folded day's heading shows more than the budget, and nothing says
why.

## Built

- `trip-state.ts`: `FOLD_MINUTES = 60` and `stretchDays(minutes, budget)`. All three deadline counts now use it: `legsQuantizedDays` per leg, `spareDays`'s remaining drive, and `computeDeadlinePressure`'s days late.
- `days.ts`: `daysSpannedBy` calls `stretchDays`. The cutting loop needs no change: a smaller count makes the last day drive `minutes - (count - 1) × budget`, which is the budget plus the folded remainder.

## Tests changed, and why

The days fixtures were built on a 4 h 30 min stretch on a 4 h budget, cut into 4 h and 30 min. That is exactly the case the operator chose to fold.

- **Moved the fixture to 5 h**, which cuts at 478 km and leaves an hour (not folded), and **moved Llano to 478 km** so "near Llano" still names the cut. This keeps the cut, near-naming and past-naming paths exercised instead of deleting them.
- **The 12 h 1 min fixture became 13 h.**
- **One original claim no longer holds** ("the end can name a cut": 4 h of a 4 h 5 min stretch, "near Austin"). A cut within 30 km of the end always leaves under an hour, so it always folds. That assertion is now a fold assertion.

New tests: `stretchDays` across the boundary (241, 299, 300, 517, 780). The deadline and the spare days agree with the folded count.

## Mutation proofs

All 6 are caught:

- no fold
- fold at 30
- deadline legs unfolded
- spare days unfolded
- days late unfolded
- day list unfolded

## Gates

tsc, eslint, vitest (800+) and next build are clean.

## Live (dev, 4 h and 6 h)

| trip | result |
|---|---|
| Kansas City → Denver, 4 h | **two days**: "Day 2 · near Hays to Denver · 4 h 36 min", "Two days, with a night near Hays" (was three, with a night near Byers 37 min short) |
| Amarillo → Austin, Chicago → Nashville | unchanged; their last days are over an hour |

## Critic: APPROVE (round 1)

Rule 5 is met better, and Denver reads as one clear end. Its suggestion is backlogged: say plainly when a folded day runs over the budget ("a little over your 4 h").
