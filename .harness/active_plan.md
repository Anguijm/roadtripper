<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/between-towns

## Ship rule (written before the work)

The car session's request, 2026-11-14 (John, between cities: "no nearby
towns" and no list, though the car knows where he is and where he is
going). /api/today and /api/today/toward answer `ok` anywhere within 650 km
of an atlas town, not only within 40 km of one:

- `here` is the nearest town, `snapped: false`, `distanceKm` as now.
- Every town is measured from the car's position (straight line at the
  graph's median pace, `estimated: true`), from every atlas town today
  covers, not the graph's neighbours of the nearest town.
- The nearest town can be a row (the car is not in it); toward, only when
  it passes the cone and the cap from the real position.
- Toward: the destination's minutes are an estimate from the car, and
  being nearest the destination town is not arriving.
- `no-city` only past 650 km from every town. Within 40 km nothing changes.
- The /today web page keeps its no-city notice (not asked; `betweenTowns`
  is an option only the car endpoints pass).

Additive to version 1: `here.snapped` and the towns' `estimated` are new
fields; nothing removed or renamed.

## Done

- `planBetweenTowns` in plan.ts, behind `planToday(..., { betweenTowns })`;
  `NEAREST_TOWN_MAX_KM = 650`.
- `hereOf` and `TodayHere` shared by api.ts and toward.ts.
- Tests: near Lima, Ohio (109 km from Dayton) for both endpoints; 50 km
  north of Louisville toward Louisville is `ok`, not arrived; 600 km off
  Honolulu is `between` with no towns, 700 km is no-city; Detroit and
  Omaha unchanged (snapped, graph minutes).
- Full suite with the roadside store moved aside (as CI): 912 passed,
  1 skipped.

## Mutation proofs

Each restored and `cmp` clean; every one red.
- Never between (opts ignored): 5 red.
- No 650 km limit: 3 red.
- Here's town never a row between towns: red.
- Towns not marked estimated, in /api/today and in toward: red, each.
- Destination minutes from the nearest town's graph row: red.
- Arrived at the nearest town between towns: red.
- `snapped` always true: 3 red.
- Towns measured from the nearest town, not the car: 3 red.

Cost: None. Atlas reads only, 304 straight-line distances per call.

Weakest part: between towns every minute is a straight-line estimate, so a
town across a river with one bridge, or round a lake, is further than it
says; and at 40 km the answer switches from graph minutes to estimates, so
two calls a kilometre apart can differ by several minutes.
