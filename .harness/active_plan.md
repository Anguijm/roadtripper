<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u13-one-day-fallback`

## Ship rule (written before the work)

The audit U11 left open: undated trips are treated as one day long
underneath (`tripDays = 1` without dates, "so a non-zero budget is always
available on legacy URLs"). Ships when an undated trip no longer has a
budget status computed against one day, in a form the compiler enforces —
so the next reader of the trip status cannot fall into the trap U11's
"Tight" box fell into — with no change to what any screen shows, Gate 1
green, and mutation proofs run before the push.

**Cost:** $0. No screen changes, so no critic round and no live run of a
new state; the existing screens are re-checked to show nothing moved.

**Weakest part:** The audit's finding is a negative — "nothing else reads
it wrongly today" — and a negative is only as good as the search. I
searched `src/` for every reader of `tripDays`, `totalBudgetMins`,
`totalBudgetMinutes`, `tripState.status` and the status's fields. Anything
that reads the same idea under another name would not have been found.

## The audit

Readers of the one-day fallback, all in `PlanWorkspace.tsx`:

1. `buildTripState(..., totalBudgetMins, ...)` at three call sites, which
   feeds `computeTripStatus`, whose result is `tripState.status`.
2. `computeDeadlinePressure(..., tripDays, ...)` — returns early without
   dates, so it never sees the fallback. Safe.
3. `budgetWords({ tripDays, status })` — reads `tripDays` only when dated,
   and since U11 ignores the status for an undated trip. Safe.

And `tripState.status` has exactly one reader: `budgetWords`. So nothing
on any screen is wrong today. What is wrong is that an undated trip still
*has* a status computed against a one-day budget — "warning", "over
budget" — which means nothing and looks exactly like a real one. U11's box
was that trap sprung. The next reader springs it again.

## What changed

`TripBudget` is a union — `{ kind: "dated"; totalMinutes }` or
`{ kind: "undated" }` — and `TripStatus` gains an `undated` kind. An
undated trip is never tight or over budget; it has no total to be either
against. `tripBudgetFor(dayCount, hours)` is the one place the two are told
apart, and the sheet builds its budget from it. `budgetWords` takes the
trip as a union too, so an undated trip has no day count to read by
mistake. The home form already modelled an undated trip as `null`; only
the plan sheet invented a day.

The compiler named every reader the moment the type changed: four in the
sheet, eighteen in the tests. That is the point of a union here.

## Mutation proofs, before the push

1. An undated trip scored against one day again, inside
   `computeTripStatus`: 2 fail.
2. **The sheet inventing one day again — `(tripDayCount ?? 1)` — passed
   every test the first time.** Since U11 nothing on screen reads an
   undated trip's status, so the trap re-arms invisibly; that is the exact
   failure this unit exists to stop. The budget's construction moved into
   `tripBudgetFor`, tested, and the sheet's use of it is guarded by reading
   its source, as U12 guards the map effect. The mutation now fails.
3. `tripBudgetFor` itself inventing a day: 1 fails.

## No screen moved, checked live

The undated trip (The Big Texan, then Lubbock) still shows no box and
"1 h 56 min of driving left today" — U11 showed 2 h; the difference is the
live route's timing, not the code. A dated two-day trip of the same stops
still warns: "5 h 56 min of driving left over 2 days", Tight shown, which
is right for eight hours of budget and about eight of driving.

Gates: 710 green across 67 files; `tsc --noEmit` clean; `eslint` 0 errors; `next build` succeeds.
