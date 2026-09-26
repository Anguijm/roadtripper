<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/gate1-deletes-and-google-pacing`

## Goal

Two things the #45 and #46 merges exposed. Gate 1 refused to delete a merged
branch from main because the active plan named the merged branch, so a
deletion-only push now skips the gate (deleting main is still blocked). And
the Google matrix pause was sized for one-element calibration calls; a full
build in 60-element batches would have run at 30,000 elements a minute against
a 3,000 a minute quota. It is now 1.5 s, 2,400 a minute.

**Cost:** $0 for this change. The build it enables sends 5,132 elements under
the Essentials SKU, which has 10,000 free a month; worst case if the allowance
is spent is $25.66.

**Weakest part:** The hook has no automated test. The proof is a simulated
deletion on stdin, refused before the change and accepted after, recorded in
the PR. A push mixing a deletion with an update still runs the full gate,
which is correct but untested.
