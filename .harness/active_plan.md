<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: data/bracketed-duplicates

## Ship rule (written before the work)

The car session found Grand Rapids' Calder listed twice, as "La Grande
Vitesse (The Calder)" and "La Grande Vitesse": two of the five places the
car shows. The export merged only identical names within 2 km. John chose
(2026-11-10) a second pass: the same name but for a bracketed aside, same
town, within 300 m, keeping the richest row as the first pass does. He read
the 80 merges first and kept one apart (Little Rock's Quapaw Quarter, Scott
St and Cumberland St: two streets). 79 merges, 80 rows.

## Done

- `dedupeBracketed`, `bracketKey`, `BRACKETED_RADIUS_KM` and `KEEP_APART`
  in `scripts/lib/dedupe.mjs`; both passes share one `collapse`, so the
  keeper rule is the same. The export runs the second pass after the first
  and logs its count.
- Export diffed row by row against a copy taken first: 80 waypoint rows
  gone, all from the reviewed list; nothing new or changed; cities,
  neighbourhoods and drive pairs identical. Saved trips hold towns, not
  place ids, so none is affected.
- Tests: the rule (merge within 300 m, apart beyond, brackets only, never
  across towns, the kept-apart group) and the real atlas (no bracketed
  duplicate left, one Calder, two Quapaw rows).

## Mutation proofs

- `bracketKey` not dropping brackets: 3 red. Restored, `cmp` clean.
- Radius 2 km instead of 300 m: 1 red. Restored.
- Empty `KEEP_APART`: 1 red. Restored.
- `bracketKey` also dropping a leading "The": 1 red. Restored.
- The previous atlas swapped in: the real-atlas test red. Restored, `cmp` clean.

Cost: None. One re-export.

Weakest part: the rule trusts a bracket to be an aside. A future pair whose
brackets name two different places within 300 m (as Little Rock's did) is
merged until someone reads the export's count and adds it to KEEP_APART.
