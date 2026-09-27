<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/today-screen`

## Goal

Step 7: the today screen. Where you are, hours you can spend, what is in
range. Done when it answers "I have five hours" without you typing an origin
or a destination. This is the morning-launch use case itself, built on step
6 (where you are) and step 5 (the drive graph).

## Ship rule, written before the work

1. `/today` with location permission granted: it finds you, five hours is
   preselected, and one tap on Go lists every atlas city within five hours
   of driving, nearest first, each with its top spots for the chosen persona.
2. Without permission: one tap to locate, or type a city. Same answer.
3. The whole screen is the drive graph and the atlas. No external API call
   happens rendering it, proven by a test that fails if fetch is called.
   Cost per open: $0.
4. Drive times are one-way, "2 h 10 min", the number the graph holds. Not
   doubled, not a detour.
5. No atlas city within 40 km, or a city without graph rows: one plain line
   saying so and the way to type a city instead. Never an empty page.
6. Persona is switchable on the results without re-locating.
7. Server-render safe, tested the same way as steps 5 and 6.

**Cost:** $0. SQLite reads only. The rate limiter still applies per IP.

**Weakest part:** The list is capped at the nearest MAX_WAYPOINT_CITIES
cities (the existing waypoint pipeline's cap), so "five hours from Denver"
shows the nearest N and says how many it left out; it does not yet rank the
far ones by how good they are. Ranking across cities by persona fit rather
than distance is exactly what the Jev scores in steps 19 to 25 are for. And,
as with step 6, the phone itself is not exercised from here.

## Gate 1 proofs

- Rule 1 and 4, budget: with the hours budget ignored in `planToday`, "answers five hours from Amarillo" fails (Denver appears, times exceed 300) and "fewer hours is a subset" fails. Restored.
- Rule 4, one-way: with the page showing the pipeline's doubled detour instead of the graph's one-way minutes, the page test fails looking for "3 h 45 min". Restored.
- Rule 3, no network: the page test stubs `fetch` to throw and asserts it was never called while rendering Amarillo's answer.
- 339 tests, 11 new; lint and types clean.

## Council round 1 on #53 (CONDITIONAL, bugs 5, product 5), and what changed

- a degraded waypoint pipeline gets its own line ("the cities are right, but some spots could not be loaded") and per-city "Spots did not load." instead of "nothing here yet"; tested in its own file with the pipeline forced degraded
- `MAX_NAME_LENGTH` explained; the 3 km threshold is imported from locate.ts instead of repeated
- `DriveBudgetSelector` imports the one preset list from presets.ts, so the two screens cannot drift
- home nav contrast to #8b949e; focus rings on every button and link on the today screen
- Pushed back with evidence on three: capping `reachable` (max 56 rows per origin in the graph, pipeline already slices to 10, a cap would make the count lie); throttling `maybeSweep` (already interval-guarded at 5 min, and Node runs one request at a time); bounding `LatLngSchema` (already ±90/±180 in plan/types.ts, tested in #52)

## Council round 2 on #53 (CONDITIONAL, bugs 8, product 5), and what changed

- double-submit guard on the start screen, with a "Looking..." state
- comments: why `reachable` is uncapped (56 rows max per origin, pipeline slices to 10), and which test pins the 3 km threshold
- Pushed back on handling a `"failed"` status: `WaypointFetchResult` has two members, fresh and degraded, and degraded was handled in round 1
- **The product reviewer's real point, a dead end, fixed:** every city on the results links into the planner with both ends filled. The home page now reads a start and an end from the URL, validated with `LatLngSchema` and cut at 80 characters, and hands them to `RouteInput`. Tested on both pages.
- **Recorded for John, not decided:** the product reviewer would rather this lived inside the map workspace as pins than as its own text screen. That is the map-first question. The plan says the today screen first; a map view of it is a candidate step, not a rewrite of this one.

## Council round 3 on #53 (BLOCK, bugs 4), and what changed

- **Null Island, a real bug:** `?lat=&lng=` became (0, 0) because `Number("")` is 0, and the page said "not near a city we know" instead of asking. `pointFrom` in presets.ts treats blank, missing, nonsense, out-of-range and Infinity as "no point"; explicit zeros stay a real point. Tested at the helper and at the page.
- **The Go button recovers:** `router.push` never rejects, so a stalled navigation froze it on "Looking..."; a ten-second timer brings it back, and a second tap pushes the same URL.
- the pipeline call is wrapped: if it throws, the cities from the graph still list and the spots are reported missing. Tested with the pipeline mocked to reject. This closes the item asked three rounds running; the union has no failed member, but a throw is now survived.
- `MAX_PLACE_NAME_LENGTH`, `placeNameFrom` and `pointFrom` live in presets.ts and both pages use them, so the handoff and the today screen cannot drift.

## Council round 4 on #53 (CONDITIONAL, bugs 8), and what changed

- the equator fallback is gone: a city the plan does not know gets no "plan a trip" link, not a link to (0, 0). The lookup cannot miss, since every group comes from plan.reachable, but `?? 0` was the wrong shape of safety
- `MAX_WAYPOINT_CITIES` exported from recommend.ts; the throw fallback uses it instead of a bare 10
- the `geo:` id line on the home page points at the explanation in locate.ts
- Pushed back on logging the full error (same convention as the plan page; the security review of #52 praised exactly this) and on documenting the 10 s timeout (the comment above it already does)
