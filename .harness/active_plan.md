<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/round-1-u3-u4`

## Ship rule (written before the work)

Ships when: the round-1 report has U3's and U4's sections with what happened,
the council's rounds and what was routed on; `gauntlet/round-1.md` declares
U5's ship rule before U5's builder runs, and records that U4's was declared
late.

**Cost:** $0. Docs only; no council (skip marker).

**Weakest part:** U4's ship rule is written after its merge. The report says
so rather than backdating it.

## Gate 1 proofs

Docs only: no test to mutate. Lint, type-check and the suite run on push.
