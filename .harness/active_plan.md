<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u26-destination-not-a-stop`

## Ship rule (written before the work)

U25's live run found it. On Reno → Salt Lake City, after a stop in
Winnemucca, the title reads "Elko and Salt Lake City fit in day 2", with
a "+ Stop here" on Salt Lake City, the trip's own destination. The
"ahead" rule (makesProgress) passes any town closer to the destination
than the start, and the destination is as close as a town can be.
Stopping for the night at the end of the trip isn't a choice; the days
already end there.

Ships when:

- **The destination is never a town that fits.** A town within
  DESTINATION_KM (25) of the trip's end is not offered: not in the title,
  the list or the map's town dots.
- **The rest is unchanged.** A town short of the destination is still
  offered (Elko on the way to Salt Lake City is tested), and the start
  stays excluded, as now.

Also required:

- atlas-based tests
- mutation proofs
- a live run that adds Winnemucca and reads the title
- the critic's approval if the screen changes (it does: the title)

**Cost:** $0. It only shrinks the set.

**Weakest part:** 25 km is a metro's radius. A destination given as a
suburb's point could still list its central city just over 25 km away.

## Built

- `progress.ts`: `DESTINATION_KM = 25` and `isAtDestination`.
- `radial.ts`: the "ahead" filter now also excludes any town at the destination.
- `radial-graph.test.ts` is rebased on a real trip, Winnemucca → Salt Lake City. Its first test used to aim at the origin's nearest graph neighbour and expect it back, which amounted to asserting that the destination is offered as a stop.
- The ceiling and sort tests now also assert a non-empty result, so they can't pass on an empty list.

## Mutation proofs

All three are caught in the end:

- filter removed
- radius 400, which also drops Elko
- radius 0

**Radius 0 survived twice first.** The test aimed at Salt Lake City's own atlas point, which matches at 0 km. It then aimed at the airport, which is west of downtown, so the ahead rule already dropped downtown. The fix aims at an address on the east bench, so downtown is ahead and only the destination rule can drop it.

## Gates

tsc, eslint and vitest (785) are clean.

## Live

Reno → Salt Lake City, adding Winnemucca in headless Chrome: the title reads "Elko fits in day 2". Before, it was "Elko and Salt Lake City fit in day 2".

## Critic: APPROVE (round 1)

The title is accurate and the destination keeps its red marker. Its leftover goes to the next unit, U27: "1 h 34 min of driving left today" still shows after the night stop that ends day 1.
