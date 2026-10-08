<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u39-off-the-road-is-out-of-the-way`

## Ship rule (written before the work)

Several critics (U20 to U38) read the purple dots near Omaha, Lincoln and
Wichita on Kansas City → Denver as noise off the route (rule 6). U17's
"on the way" test is straight-line: the town search runs before the route
is known, and Omaha passes at 1.16, though it is about 200 km off I-70. The
sheet does know each town's distance from the real road (`nearestOnRoad`).

Ships when:

- **Out of the way.** A town more than OFF_ROAD_OUT_KM (60, tuned from 50 on the measured routes; see below) from the
  route's road counts as out of the way, as a detour does in U21. It is
  offered only to a dated trip with a day to spare, after every town on
  the way, marked "out of the way", and left out of the title's count.
- **Example.** Undated Kansas City → Denver at 4 h offers only the
  I-70 towns (Lawrence, Topeka, Salina, Hays). With spare days,
  Wichita, Lincoln and Omaha come back last.
- **The road it measures against.** The road is the direct route the
  days are cut on (the same frame).

Also required:

- a pure function, with tests
- an SSR test of the sheet
- mutation proofs
- a live run
- the critic's approval

**Cost:** $0.

**Weakest part:** 60 km is a tuning number. A town 55 km off a fast
interstate is offered as on the way.

## Built

- `detours.ts`: `OFF_ROAD_OUT_KM = 60` and `markOffRoad(fetch, road, ends)`.
  - It measures to the road's segments (`projectOntoPolyline`), not its nearest vertex.
  - A road that doesn't join the trip's ends (within the limit) marks nothing.
- `PlanWorkspace.tsx`: the `road` memo moved up, and the offered set is now `offeredTowns(markOffRoad(raw, road, ends), room)`.

## Tuned on real routes (decoded from the page's own polyline)

Measured distance off the road:

- Lubbock 1 km, Sweetwater 2, Brownwood 2.
- **Abilene 54.** The route cuts Sweetwater → Brownwood, south of I-20.
- San Angelo 66.
- Omaha, Lincoln and Wichita 130+ off I-70.

At 50 km, Amarillo → Austin offered only Lubbock. At **60**, it offers Lubbock and Abilene, and San Angelo is out of the way.

## Tests changed, and why

- **Fredericksburg** (fixture) moved from 200 km to 40 km off the test road. It is still too far to name a cut (15 km), but it is on the way.
- **Fort Worth** (fixture) moved from 350 km to 28 km.
- Eight suites render a sample California polyline unrelated to their trips. The ends guard leaves those alone, by design.

## Mutation proofs

All 4 are caught:

- nearest vertex instead of segments
- no ends guard
- limit 200
- the sheet does not mark

## Gates

eslint, vitest (808) and next build are clean.

## Live (dev, 4 h)

| trip | towns |
|---|---|
| Kansas City → Denver, undated | Lawrence, Topeka, Salina, Hays |
| Kansas City → Denver, dated with spare days | + Wichita, Omaha, Lincoln, Tulsa, last, out of the way |
| Amarillo → Austin, undated | Lubbock, Abilene |

## Critic: APPROVE (round 1)

The map now shows the I-70 line, and the headline matches the dots. Next, flagged repeatedly: "39 min away" does not say from where.
