<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/direction-progress`

## Goal

Step 8: fix the direction filter. Today a candidate city is "ahead" if its
bearing is within 90 degrees of the heading, and the heading is first
snapped to one of eight compass points. That is a 180-degree fan that can
swing 22.5 degrees off the true line, so a city at right angles to the
trip, or a little behind it, is offered as a stop. Replace it with actual
progress toward the destination. Done when nothing behind you is ever
offered.

## Ship rule, written before the work

1. A city is offered only if it makes progress: its along-track distance
   toward the destination is positive and no more than the distance from
   origin to destination. Nothing behind, nothing sideways, nothing past
   the destination.
2. Proven on the real atlas, not on three points: for a few hundred random
   city pairs, every city the filter keeps is closer to the destination
   than the origin is, and every city it drops is either behind, sideways
   or past.
3. A concrete case people can check: Amarillo to Austin no longer offers a
   city the old fan offered and a driver would call behind them, and still
   offers Lubbock. The old rule is computed in the test so the difference
   is shown, not asserted.
4. The cache key carries the destination, not an eight-way heading, so two
   trips from one origin to different destinations never share a candidate
   list.
5. The graph path still makes zero API calls (existing tests), and the API
   fallback is unchanged apart from which cities it asks about.

**Cost:** $0. The filter is arithmetic on the city list before the graph
read. On the API fallback path it asks about fewer cities, not more.

**Weakest part:** "Progress" is straight-line, not road. A city that is
ahead as the crow flies but reached by a road that first doubles back is
still offered; the drive-time budget bounds how bad that can be, and the
graph's minutes are road minutes, but the direction test itself is
geometry. Also the "no sideways" cut is a straight positive along-track
test; a stop 2 km forward and 80 km to the side passes it. A minimum
progress fraction would fix that and is not in this step, because the
step's done condition is about behind, and every extra rule needs its own
evidence.

## Gate 1 proofs

- Rule 1: with the old fan put back inside `makesProgress`, the geometry tests fail (right angles, past the destination, sideways, coincident) and the Amarillo-to-Austin cases fail. Restored.
- Rule 4: with the destination zeroed out of the cache key, "produces distinct keys for different destinations" fails. Restored.
- Rule 2: 300 seeded random atlas pairs, every kept city closer to the destination, within 90 degrees of the true line, and not past it. Over a thousand kept cities checked.
- Rule 3: Amarillo to Austin keeps Lubbock and drops Wichita; the test computes the old fan and shows it kept Wichita.
- 334 tests (22 fan tests removed, 10 progress tests added); lint and types clean.
- Not changed, noted: `RouteMap` still draws a 180-degree arc as the visual hint of the search area. It is decoration, not the filter, and it now over-promises at the edges. Worth a follow-up when the map gets its next pass.

## Council round 1 on #54 (CONDITIONAL, bugs 7), and what changed

- comments: the `+540 % 360 -180` fold explained; the destination's 3-decimal rounding explained next to the line; the test's 1,000 floor explained; the cache header no longer says "snapped compass heading"
- Answered, not changed: the LRU has a hard cap, `MAX_ENTRIES = 256`, oldest evicted, one-hour TTL, in cache.ts
- Pushed back on null guards for `destination` in `radialCacheKey`: the parameter is typed, both callers pass a typed LatLng, and none of the function's other parameters carry runtime guards either
