<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/label-sheet-from-scores`

## Goal

The second sheet. John said a name and a kind are not enough to judge a
place by and that most of the judging is automatable. So the model judged
first: Jev scored all 1,074 stops with the description in front of it
(jev-lab, J9, two cents), and the sheet is now its yes list with twenty of
its no calls mixed in blind, each row with the description and a map link,
in road order. He taps the ones he would really pull over for. His taps
are the labels the bench joins back to the scores.

## Ship rule, written before the work

1. `label:sample --scores=<file>` builds the sheet from a scores file (rows
   of id and probability) instead of the stratified hundred. Yes is p at
   or above 0.5; the yes list is cut at 150 by probability.
2. Twenty of the model's no calls ride along: the ten just under the line
   (where it was unsure; reported, never scored) and ten at random from the
   rest below the line with the fixed seed (the thin net for a buried gem;
   scored). No stop is in two groups. Stops without a score are left out.
3. Each row carries its group and probability for the bench, and the
   description from the corridor's sidecar (short description, opening,
   URL) for the person. The sheet itself shows neither the group nor the
   probability: the check is blind.
4. Deterministic: same scores, same seed, same sheet. The sample file is
   committed as before; the import script needs no change, since it checks
   ids against whatever sample file is there.
5. The first sheet's mode stays available without `--scores`, untouched.

**Cost:** $0 in this repo. The scores it reads cost $0.0204 in jev-lab,
declared and capped there.

**Weakest part:** 116 of the 163 rows have no encyclopedia entry, so on
the sheet they are still a name, a kind and a map pin. The model's yes
calls are mostly murals and small museums, which is exactly the set
Wikipedia does not cover. The OpenStreetMap record has more (a
`description` tag, `artwork_type`, an inscription) and the pull drops it;
keeping those tags is the next improvement to the record, and it costs a
free 16-minute re-pull.

## Gate 1 proofs

- Rule 2: with the near rows left in the random pool, "puts every yes first by probability, then the ten just under the line, then ten at random, none twice" fails on the disjointness check. Restored, `cmp` clean.
- Rule 1 and 4: the cap test takes exactly 150 of 200 eligible by probability; the determinism test gets the same random ten twice and a different ten for another seed.
- The run on the real scores: 1,074 scored of 1,074; 143 yes at 0.5; 163 rows; 47 with a short description, 42 with an opening.
- 434 tests, 4 new; lint and types clean.
