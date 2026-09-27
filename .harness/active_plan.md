<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/corridor-pull-resumes`

## Goal

Step 19 ran twice and died both times on a 504 from the public Overpass
instance, once on tile 2 and once on tile 4 of 32, after one retry. Two
other public instances were probed and were worse (one timed out at 75 s,
one answered 504 after 70 s). The instance is under load; the script has
to live with that. Make the pull resumable per tile and more patient, so a
corridor finishes across reruns instead of restarting from tile 1 and
re-spending the tiles it already had.

## Ship rule, written before the work

1. Every tile's answer is written to a per-corridor progress file the
   moment it arrives; a rerun skips tiles it already holds and starts at the
   first missing one. Tested with a fake fetch that fails on tile 3: after
   a rerun, tiles 1 and 2 were not fetched again.
2. Patience grows: three retries at 10, 30 and 60 seconds on 429 or 504,
   never more, then the run stops and says which tile. Still one request
   at a time; the total wait for one bad tile is under two minutes. Tested.
3. The instance can be pointed elsewhere with `OVERPASS_URL` in the
   environment, for a quieter mirror or a self-hosted one; the default is
   unchanged.
4. Nothing else changes: same tags, same buffer, same record.

**Cost:** $0.

**Weakest part:** Patience is not availability. If the public instance is
down for the evening, three retries a tile will not finish the corridor
tonight either; the progress file means the next run picks up where this
one stopped, which is the honest best a shared free service allows.

## Gate 1 proofs

- Rule 1: with the rerun ignoring the tiles it already holds, "resumes: tiles already held are not fetched again" fails. Restored. The script's progress file is exercised by the real run of step 19, which was started against this branch's code the moment the tests passed.
- Rule 2: the retry test asserts the exact pause series 10, 30, 60 s and that a fourth failure stops with the status; "can be pointed at another instance" asserts the URL override.
- 402 tests, 2 new; lint and types clean.
