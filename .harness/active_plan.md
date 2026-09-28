<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/sample-carries-detail`

## Goal

The follow-up #70 named: the sample rows carry the record's new `detail`
field next to the encyclopedia fields, so the sheet builder and the bench
can use it. The corridor was re-pulled under the new shape (32 tiles,
sixteen minutes, free) and 758 of 1,074 stops have a detail; on John's
sheet, 85 of 163 rows do, and 50 of those had nothing before.

## Ship rule, written before the work

1. Every sample row carries `detail` (null when the record has none). One
   pass-through line in the script; the sampler is unchanged.
2. The sample is regenerated from the same scores and seed, so the 163
   rows and their order are identical and only the new field differs.
   Checked by diff: no row added, removed or moved.
3. The sheet John has is updated in place in its About column for the 50
   rows that gained a line and had none, and nowhere else; his dropdowns
   are not touched. Done by hand through the Docs tools, cell by cell,
   under a revision guard, so a tap of his that lands first wins.

**Cost:** $0.

**Weakest part:** The details are uneven: Spirit Rock's is a sentence,
many artworks' is one word ("installation", "statue"), some museums' is
"local". One word is still more than the kind alone said, and it is what
the mapper wrote. There is no test for a one-line pass-through in a
script; the proof is the count and the diff below.

## Gate 1 proofs

- Rule 2: the regenerated sample has the same 163 ids in the same order; the only fields that differ from main's file are `detail` and `sampledAt`.
- Rule 1: 85 of 163 rows carry a detail; 50 of them had no encyclopedia line.
- Suite, lint and types unchanged and green.
