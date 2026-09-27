<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/feasibility-line`

## Goal

Step 10: the feasibility line. "Two nights here and you still make Austin
by Oct 14." On the today screen, when a deadline and its destination are
known, every city in range gets one sentence saying how long you can stay
there and still arrive on time, or that you cannot. Done when it is right
on five hand-checked cases, including one where the answer is no.

## Ship rule, written before the work

1. The arithmetic is one pure function, `maxNights`, with the same
   overnight quantization the plan page already uses (a six-hour leg on a
   five-hour budget is two days): days to reach the city beyond today, plus
   nights there, plus driving days from the city to the destination, must
   land on or before the deadline. Tested on its own.
2. Three answers, each one sentence: "Two nights here and you still make
   Austin by Oct 14." "Pass through today and you still make Austin by
   Oct 14." "Stop here and you miss Austin: one day late even driving
   straight on." Numbers up to ten are words, spoken.
3. Minutes from a city to the destination come from the drive graph when
   the pair exists. When it does not (the destination is more than 650 km
   from that city), the sentence uses an estimate from the graph's own
   median pace per straight-line kilometre and starts with "Roughly".
   Never silent, never a guess presented as exact.
4. Five hand-checked cases against the real graph, the expected sentence
   written out in full in the test, the arithmetic shown in the test from
   the graph's minutes: two "nights" cases, one "pass through", one
   "roughly", and one "no".
5. Without a deadline the today screen is unchanged. Nothing calls out.

**Cost:** $0. Two more SQLite reads per city shown, at most ten cities.

**Weakest part:** The plan page's candidate list does not get the line
yet. Its numbers come from the Routes API per leg, a different data path,
and the sentence there would need candidate-to-destination minutes the
page does not have. The today screen is where the morning decision is
made, so it goes first; the plan page is a follow-up. And the deadline day
is counted from the server's UTC date, as in step 9.

## Gate 1 proofs

- Rule 1: with floor instead of ceil in the driving-day count (half a night on the road), six tests fail, including hand-checked cases 1, 2 and 3. Restored.
- Rule 3: with the estimate no longer saying "Roughly", the sentence test, hand-checked case 4 and the page test fail. Restored.
- Rule 4: the five cases pass against the real graph on the first run; the expected sentences are literal in the test, and the arithmetic is written beside each from the graph's minutes (Lubbock to Austin 321.5, Oklahoma City to Austin 312.3, Albuquerque to Austin absent, estimated at about 728).
- Rule 5: the page test renders without a deadline and finds no such line.
- 366 tests, 15 new; lint and types clean.

## Council round 1 on #56 (CONDITIONAL, bugs 6), and what changed

- the 650 km neighbourhood names `NEIGHBOUR_RADIUS_KM` in scripts/build-drive-graph.mjs; the two `Math.max(0, ...)` guards are explained; the ten-word boundary says which tests pin it
- Pushed back on a module-level prepared statement (no query in the file caches one; this is the least-called) and on validating `hours` and the coordinates (already done by `hoursFrom` and `pointFrom`, both tested)

## Council round 2 on #56 (CONDITIONAL, bugs 6), and what changed

- **A real catch:** the estimate marker was a prefix on every sentence, giving "Roughly stop here and you miss Austin". It now sits on the number when there is one ("roughly one day late", "roughly two nights") and on the verdict when there is not ("probably still make"). Tested, including that no sentence starts "Roughly stop" or "Roughly pass".
- a small statement cache in queries.ts, keyed by SQL, used by the pair lookup that runs once per city shown; the comment says which queries should and should not use it
- an empty graph no longer throws from the pace function; the last measured pace stands in and the log says so
- the budget's sign is checked where the budget is used, with a comment that `hoursFrom` already guarantees it
- Items 1 and 2 were pushed back on in round 1 and asked for again. Applied this round because both are harmless and a third round on them would cost more than the change.
