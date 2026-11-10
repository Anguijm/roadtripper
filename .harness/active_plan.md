<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/today-toward

## Ship rule (written before the work)

John (via ops, 2026-11-10): "we are roadtripping and generally have a
destination": places in the general direction, roadside stops among the
towns in the order of time to reach them, a description for each, and add
to route. His choices that night: the destination typed on the phone (plus
the town list in the car), a rough cone with no Routes call, navigate one
stop at a time. Contract agreed with roadtripper-car-a3 by message and
written in docs/car-api.md:

- GET /api/today/towns: the pick list, with US states, cached a day, ETag.
- GET /api/today/toward: towns (drive graph) and roadside stops (estimates)
  in the cone, nearest first, at most 15, the destination town as a row
  when today reaches it; arrived, unknown-destination and the /api/today
  statuses. No paid call. Under /api/today so the log exclusion covers it.

The add-this-town button's POST is a separate PR.

## Done

- `src/lib/today/cone.ts`: the ellipse at 1.25, plus forward progress (an
  ellipse alone took Flint, behind Detroit, heading south).
- `src/lib/today/toward.ts`: towns chosen by least detour (choosing the
  nearest let Cleveland and Akron crowd out Cincinnati and Lexington), stops
  by `pickStops` (mood filter, strength, no repeat of a town's place).
- `survivorsInCone` / `roadsideToward` in the roadside store, sharing the row
  parser with the route query. `rankedPlaces` and `waypointsOrDegraded`
  pulled out of /api/today so both answers build places one way.
- `ROADSIDE_KIND_WORDS` moved from PlanWorkspace.tsx (a "use client" file)
  to `src/lib/plan/words.ts`.
- `src/lib/today/towns.ts`: states from the US places list; all 124 towns
  with a state in their id agree with it.

## Mutation proofs

Each was restored and checked with `cmp`.
- No forward progress: 1 red (after a synthetic behind-the-start test was
  added; the first run survived it).
- Nearest towns instead of least detour: 1 red (after the Mammoth Cave test
  named Lexington, Cleveland and Akron; it survived first).
- No stop-versus-place dedupe, and no same-name dedupe: red (after pickStops
  was pulled out and tested on made-up stops; real data never collided).
- No mood filter: red (same; the strongest stops all answered the mood).
- No destination row: red. No arrived check: red. No state suffix fallback: 2 red.

Cost: None at run time: atlas and roadside store reads only.

Weakest part: the cone is straight lines, so its minutes for roadside stops
are estimates and a bending road can pass a place it leaves out. With
"history" chosen, the strongest roadside stops near Detroit are war
memorials: the existing mood ranking, which the web shares, not retuned here.
