<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/label-sample`

## Goal

Step 20's tooling: pick the 100 stops John labels, and get them in front of
him in a form he can label on a phone. The corridor is still pulling under
the second tag list, so this is the sampler and the writer, tested on
synthetic stops, ready to run the moment the corridor is in. The labels
themselves are his hour, not mine, and nothing downstream is trustworthy
without them.

## Ship rule, written before the work

1. The sample is deterministic: same stops, same seed, same 100, so the
   set can be regenerated and reviewed. Seeded shuffle, no Math.random.
2. It is stratified by kind with a cap per kind, so no kind can be more
   than a quarter of the sheet and every kind with at least one stop gets
   at least one row. A kind with fewer stops than its share gives all it
   has. The remainder is shared round-robin, so the big kinds end up
   within one of each other: the flood of 300 historic entries gets no
   more rows than the 25 museums. (Amended: the first draft said "filled
   by the largest kinds", and the test written to that showed the
   round-robin gives the better sheet.) Tested: caps hold, every kind
   present, big kinds balanced, exactly 100 when there are at least 100,
   all of them when there are fewer, no duplicates.
3. Each row carries what a person needs to judge it from a phone in ten
   seconds: the name, the kind, how far along the corridor it is, a map
   link at its coordinates, and the OpenStreetMap link. Nothing else.
4. The sample is written to `data/labels/<corridor>.sample.json` and is
   committed; the labels come back into `data/labels/<corridor>.labels.json`
   by a second script in a later PR, once the sheet exists to read from.
5. No network. The sampler reads the corridor file; the doc is built from
   the sample by hand through the Docs tools, with a dropdown per row.

**Cost:** $0.

**Weakest part:** A stratified sample of 100 from a corridor of a few
hundred is a sample of one corridor. The Noul bench in step 21 measures
agreement with John on Amarillo to Austin, not on the country; that is
what the plan says and it is the honest scope. The map link uses the
stop's coordinates, which for a park is its centre and may be well off the
road.

## Gate 1 proofs

- Rule 2: with the per-kind cap removed, "fills a sheet even when the caps would leave it short" fails. Restored. The balance assertion (big kinds within one of each other) and the one-of-each assertion pin the round-robin.
- Rule 1: the determinism test asserts the same ids for the same seed and different ids for another.
- 413 tests, 5 new; lint and types clean. The script is not run in this PR; the corridor is still pulling under the second tag list.
