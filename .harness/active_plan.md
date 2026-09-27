<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/overpass-timeout-per-try`

## Goal

The corridor pull's retries on a timeout never happened. The timeout
signal was created once per tile, outside the retry loop, so after it
fired on the first try every retry started already aborted and failed at
once: the log shows "timed out after 90000 ms, 4 tries" arriving 2 minutes
18 seconds after the run began, when four real tries and the pauses would
take over seven. Every earlier "4 tries" on this corridor was one try.

## Ship rule, written before the work

1. Every try gets its own timeout signal. Tested: a fetch that fails twice
   then succeeds sees three different signals, none already aborted.
2. Proven against the old code: the new test fails on main's overpass.ts.
3. Nothing else changes.

**Cost:** $0.

**Weakest part:** This is the third fix to the same client in an evening.
Each was found by a real run against a loaded free service, which is the
only place these show up; the tests now pin all three. The watcher on the
corridor picks this up on its next run without restarting anything.

## Council round 1 on #65 (CONDITIONAL, bugs 8), and what changed

- the timeout's value, reason and how to tune it are stated where it is used, pointing at the constant's own comment and at the tests that inspect the signal without waiting it out
