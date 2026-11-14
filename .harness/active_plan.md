<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/longer-days

## Ship rule (written before the work)

The car session's request, 2026-11-14 (John: driving 10 to 12 hours today,
and cannot choose that, nor "however long it takes"). On the car endpoints
only, /api/today and /api/today/toward take hours 10, 12 and `any`:

- `hours=any` is no limit, echoed as `hours: null` on that answer only.
  Blank, 0 and anything else still fall back to 5: a word, not 0, because a
  blank value is 0 to Number().
- Towns more than 650 km from here's town (past the drive graph) are
  added with a straight-line estimate from the car, `estimated: true`.
  Inside 650 km the graph's minutes stand.
- Toward on `any`: no hours test; withinToday true; the destination town
  always a row; the cone and the 40-minute cap bound the list to the trip.
- The /today page's chips and answers are unchanged (`beyondGraph` is an
  option only the car endpoints pass).

## Done

- `CAR_HOURS`, `NO_LIMIT` and `carHoursFrom` in api.ts.
- `GRAPH_NEIGHBOURHOOD_KM` and `beyondTheGraph` in plan.ts, behind
  `planToday(..., { beyondGraph })`. `planToday` takes Infinity for no
  limit. Each candidate carries its own `estimated`.
- A test reads scripts/build-drive-graph.mjs so the 650 km cannot drift.
- Roadside read for Detroit to Los Angeles with no limit: 16k survivors,
  179 ms on the MS-S1; the whole answer 183 ms.

## Mutation proofs

Each restored and `cmp` clean; every one red.
- `any` not recognised: 2 red. No 10 and 12: red.
- Past-the-graph towns not added: 3 red. Added but not marked estimated:
  3 red. Added inside 650 km too: 4 red.
- withinToday ignoring no limit: red.
- Toward rows' estimated by mode instead of per town: red.
- Infinity rejected: 4 red.
- Roadside reach 0 on no limit: red where the real store is (not in CI).
- Infinity not reaching SQLite as a bound: red. (An earlier guard that
  turned Infinity into a finite number survived, so it was removed: SQLite
  takes Infinity.)

Cost: None. Atlas and store reads; a no-limit cross-country call is about
0.2 s of CPU.

Weakest part: on `any` the eight towns are the most on-the-way of the
whole trip, so on a long trip they spread across it (Detroit to Los
Angeles: Ann Arbor to Colorado Springs) rather than crowding the next few
hours; the car re-asks as it goes, so the near ones change, but a town 2
hours ahead can lose its row to one 20 hours ahead that is straighter.
