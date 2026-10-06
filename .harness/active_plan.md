<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u11-tight-box`

## Ship rule — written after the build began, which is a miss

The bar says ship rules come before the build. This one did not: I went
from the operator's "tackle the next thing" straight to reading the code
and writing the fix, and wrote this once the fix was in. Recorded here in
the same way round 1 recorded U4's, rather than back-dated.

U11 ships when an undated trip shows no budget warning and no warning
colour, and says what is left of day 1's hours rather than one day's hours
less every leg; when a dated trip keeps its warning, worded so its two
figures say what each covers; when the mutation proofs ran before the
push; when the critic approves; and when the operator has looked.

**Cost:** $0 beyond one recompute for the live run.

**Weakest part:** The fault was that an undated trip was treated as one day
long, and that one-day fallback is still there — `tripDays` is still 1
without dates, because other things read it. U11 stops the budget wording
from believing it. Anything else that reads `tripDays` or
`totalBudgetMinutes` on an undated trip is reading a number that means
"one day" when the trip is not one day, and I have not audited them all.

## The fault

`tripDays` falls back to 1 with no dates — "ensures a non-zero budget is
always available on legacy URLs" — so an undated trip's whole budget was
one day's hours. `computeTripStatus` then compared one day's leftover
against the drive still to go and called every multi-day trip tight or
over: "Tight: 5 h 57 min straight on to Austin, with 2 h of driving left"
on a three-day trip that was fine. The line above it, in warning gold, was
one day's hours less *every* leg, right only by coincidence with a single
overnight.

## A test that had the bug written into it

A days test required the trip-shape line to sit "before the budget's
alert" on an undated three-day trip — so it required the false alert to
exist. It now asserts there is none.

## Mutation proofs, before the push

1. Undated trips warn again: 5 fail. 2. "Left today" back to one day less
every leg: 2 fail. 3. The sheet passing `dated: true`: 1 fails.
4. **The line's colour back on the raw status: 0 failed** the first time
— nothing tested the colour, which was half of the screenshot's fault. A
days test now reads the line's class; the mutation turns it red.
