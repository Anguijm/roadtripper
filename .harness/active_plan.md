<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/detour-cap

## Ship rule (written before the work)

John chose (2026-11-11) "Cap at 40 min" for /api/today/toward: a town or
roadside stop that adds more than 40 estimated minutes against heading
straight to the destination is left out, the same minutes the row shows as
detourMinutes. The cone alone offered a monument near Cleveland 65 minutes
off a Detroit to Louisville drive (the car session's find).

## Done

- `MAX_DETOUR_MINUTES = 40` in toward.ts, applied to towns and stops.
- Tests: every row within the cap; Columbus (about 43 min, toward Louisville)
  left out. Lists on the three test trips: 13, 14 and 15 rows.

## Mutation proofs

Each was restored and `cmp` clean.
- No cap: red.
- Cap on towns only: red where the real roadside store is, not in CI, which
  has none, as with the other real-store check.

Cost: None.

Weakest part: the detour is a straight-line estimate, so a place 35 minutes
off by straight line can be more by road, and the reverse.
