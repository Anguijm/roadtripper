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

- Rule 2: with the near rows left in the random pool, two tests failed on the first run ("gives all the no calls when there are fewer than twenty" and the no-score count), and the disjointness test passed by luck: a draw of ten from a hundred happened to miss all ten near rows. (Corrected after round 1: the first write-up of this proof named the wrong test.) A new test with fifteen rows below the line, where the random draw has only five to choose from, now fails deterministically under the same mutation for four seeds. Restored, `cmp` clean.
- Rule 1 and 4: the cap test takes exactly 150 of 200 eligible by probability; the determinism test gets the same random ten twice and a different ten for another seed.
- The run on the real scores: 1,074 scored of 1,074; 143 yes at 0.5; 163 rows; 47 with a short description, 42 with an opening.
- 434 tests, 4 new; lint and types clean.

## Council round 1 on #69 (BLOCK, maintainability 4, product 4), and what changed

- the four sheet constants each say why their value and what moving it costs (John's minutes, the bench's line)
- the sort comment says why the file keeps the sampler's order and where road order and blindness happen
- the corridor, scores and descriptions files are checked on read through schemas with the path named; a bad JSON file says so instead of a stack trace; the name compare tolerates a missing name
- a missing descriptions sidecar now stops the run, since the description is the point of this sheet; `--no-descriptions` says you meant it
- Corrected in the proofs above: the mutation proof named the wrong test; the new test makes it deterministic

## Council round 2 on #69 (CONDITIONAL, product 5), and what changed

- The item said `.loose()` does not exist in zod and would crash at runtime. It does: it is zod 4's name for `.passthrough()`, and the round-2 script run on the real sidecar ("163 rows from 1074 stops") went through it. Rather than argue, the schema moved next to the writer: `DescriptionsFileSchema` in `describe.ts` is what `describe-corridor.ts` writes through and `label-sample.ts` reads through, and a test parses a file with an added key (kept) and with a missing field (refused). `.optional()` was not added: the writer always emits every field, null when the source had nothing, and a reader that tolerates a missing field would hide a writer that stopped emitting it.

## Council round 3 on #69 (CONDITIONAL, product 5), and what changed

- the name tie-break uses a fixed locale, so the same scores give the same sheet on a laptop and in CI; tested with accented names
- a scores row with no `p_stop` at all reads as unscored, like a null one
