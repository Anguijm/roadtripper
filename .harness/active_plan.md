<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/round-1-u5-closeout`

## Ship rule (written before the work)

Ships when: the round-1 report has U5's section and a closing section that
counts the critic and council rounds per component and lists what is left
for the operator.

**Cost:** $0. Docs only; no council (skip marker).

**Weakest part:** The closing section's counts are from this session's
notes and the PRs, not from a script over the workflow journals.

## Gate 1 proofs

Docs only: no test to mutate. Lint, type-check and the suite run on push.
