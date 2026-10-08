<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u27-no-time-left-after-the-night`

## Ship rule (written before the work)

U26's critic: on Reno → Salt Lake City with a night in Winnemucca, the
sheet says "1 h 34 min of driving left today" under the title "Elko fits
in day 2". Day 1 already ends in Winnemucca, so "left today" reads as
driving still to do today, and a reader can't tell which day "today" is.
The figure, the day's hours less day 1's drive (U11), is right; the words
aren't.

Ships when an undated trip's line reads:

- **"4 h of driving left today"** with no stop yet, as now.
- **"1 h 34 min to spare on day 1"** once day 1's drive is known, which
  means a stop ends it.
- **"No time to spare on day 1"** when day 1 drives the whole budget.

A dated trip's line is unchanged: it is the whole trip's budget ("over 5
days").

Also required:

- the budget-words tests updated
- mutation proofs
- a live run adding Winnemucca
- the critic's approval

**Cost:** $0.

**Weakest part:** "to spare" invites pushing on further on day 1, which
the sheet can't offer once a stop is set except by removing it.

## Built

In `words.ts`, `budgetWords` for an undated trip now says one of three things:

- no stop yet: "X of driving left today", as before
- a stop ends day 1: "X to spare on day 1"
- day 1 drives the whole budget: "No time to spare on day 1"

Three budget-words tests were updated (the old "left today" wording after a stop, and "0 min of driving left today"). The days SSR test's colour check now also matches "to spare on day", and it asserts that "of driving left today" is gone once a stop exists.

## Mutation proofs

All 3 are caught:

- the old words back
- no zero case
- empty treated as planned

## Gates

tsc, eslint, vitest (785) and next build are clean.

## Live

Reno → Salt Lake City, adding Winnemucca in headless Chrome: the line reads "1 h 34 min to spare on day 1", under "Elko fits in day 2".

## Critic: APPROVE (round 1), and one fix applied

It caught that 4 h minus "2 h 25 min" (day 1's heading) is 1 h 35 min, but the line said 1 h 34 min. The heading cuts to whole minutes (145.6 → 2 h 25 min), while the line rounded the remainder (94.4 → 1 h 34 min).

The line now subtracts day 1's minutes as the heading shows them. A test pins both lines together, and the mutation back to the unrounded subtraction is caught.

Out of scope, noted:

- "one on the road" in the trip shape doesn't name where
- the title is centred while the rest is left-aligned
