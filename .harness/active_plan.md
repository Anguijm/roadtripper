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
