<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/api-today

## Ship rule (written before the work)

GET /api/today for the car app, the contract in docs/car-api.md (agreed with
the roadtripper-car session 2026-11-10, relayed from John by ops): today's
towns and places from lat, lng, hours and up to two moods, computed as the
/today page computes them, plus each place's coordinates. Discriminated on
`status`; `generatedAt` on every 200; 400 on an unknown mood or more than
two; 429 with Retry-After from the /today page's per-IP burst limit.

The rule: on production, `/api/today?lat=41.2565&lng=-95.9345&hours=4`
answers 200 with status "ok", here "Omaha", and Lincoln (51 min) first.
The old build answers 404 there.

`rowBadges` moved from RecommendationList.tsx ("use client") to
src/lib/plan/badges.ts: a function exported from a client module reaches
server code as a client reference, so the route could not have called it.

**Cost:** None per call beyond atlas reads; no Routes API call.

**Weakest part:** The daily quota is not charged (by design, the call is
free), so the burst limit (20 a minute per IP) is the only bound. A
scripted client could read the atlas at that rate; it costs CPU, not money.
