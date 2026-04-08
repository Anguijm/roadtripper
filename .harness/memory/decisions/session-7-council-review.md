# Session 7 Pre-EXECUTE Council Review

**Date:** 2026-04-09
**Workflow:** Hard pre-EXECUTE gate (Session 4.5). 3 parallel general-purpose agents.
**Plan reviewed:** `Plans/piped-booping-shell.md` (Session 7 — recommendation refresh)

## Verdicts

| Expert | Verdict | Score |
|--------|---------|-------|
| Security | CONDITIONAL | 8/10 |
| Architecture | CONDITIONAL | 7.5/10 (B) |
| Product | CONDITIONAL | 6/10 |

All three CONDITIONAL → 11 blocker findings collectively. Strong convergence: BOTH Architecture (ARCH-2) and Product (PROD-1) independently flagged the same load-bearing issue — `degraded:true` clobbering the recommendation slice with empty data is strictly WORSE than the S6 banner state.

## Blocker Findings (folded into PRD ISC)

### Security (4)
- **SEC-1:** `budgetHours` validation runs in the same shape/range block as origin/destination/stops, BEFORE the daily quota gate. Reject non-finite, non-integer, out-of-range. `Number.isInteger && >=1 && <=24`.
- **SEC-2:** Daily quota charges ONCE per action invocation regardless of how many backend services fan out. Documented in code comment so future refactors don't double-charge.
- **SEC-3:** `findCandidateCities` LRU cache must hash the encoded polyline (not store raw string) AND the LRU must have an explicit max-entries cap. Same applies to `fetchWaypointsForCandidates` if needed.
- **SEC-4:** Catch block around the candidates pipeline swallows error details — no message/stack/upstream string in the returned object. Server-side log only. `degraded:true` is the only signal returned on partial failure.

### Architecture (3)
- **ARCH-1 (lat/lng gap):** Extend `CityContext` with `lat: number; lng: number`. Cleanest of the three options — `recommend.ts` already has `cand.city` (Urban Explorer city doc with coords) in scope, so the patch is ~4 lines. Avoids a duplicate type AND a client-side adapter. Also survives the existing patched-cities cache hit branch (just spreads).
- **ARCH-2 (degraded atomicity / PROD regression):** ON `degraded:true` partial failure: STILL update `liveRoute` (route succeeded) but DO NOT clear `liveWaypointFetch` — keep prior recs visible AND surface a small inline notice. Return shape should make this explicit (e.g., top-level `waypointStatus: 'fresh' | 'degraded'`) so the client branches without inspecting `.degraded`.
- **ARCH-3 (atomic state update):** React 19 batches across awaits only when both setStates fire in the same microtask continuation with NO intervening `await`. Place `setLiveRoute` and `setLiveWaypointFetch` on adjacent lines after the final `await`. The `requestIdRef` bail check must wrap BOTH setters (not just one) so a stale response can't half-update.

### Product (4)
- **PROD-1 (mirrors ARCH-2):** `degraded:true` MUST NOT clobber the recommendation slice. Inline warning copy: "Couldn't refresh recommendations — showing previous." Strictly worse than the S6 banner if implemented as proposed.
- **PROD-2:** Removing the banner requires positive proof of refresh. Minimum: recommendation panel briefly highlights/pulses on each successful refresh. Without it, silent failure is indistinguishable from success and we lose the credibility the banner was buying.
- **PROD-3:** First-Add loading state at ~2s needs more than one caption: (a) aside header caption, (b) recommendation list dimmed/skeleton, (c) verified Itinerary Remove buttons disabled during pending (S6 claim must be tested in the new code path).
- **PROD-4:** "Added" city transition must not flicker out and back during refresh. An added city that exists in BOTH old and new candidate lists must stay mounted and its button label must transition IN PLACE. The marker rebuild on every refresh (S8 work) is a separate concern but the LIST rendering must not regress.

## Non-Blocker Observations (adopted)

- Daily quota of 200/IP is acceptable as-is — natural latency throttle, do NOT reduce, do NOT increment-by-N.
- Single action = single rate-limit charge — confirmed correct, splitting would have been worse.
- `serverActions.allowedOrigins` from S6 covers the new action.
- Marker flicker on every refresh — defer to S8 with TODO comment in PolylineRenderer Effect 2.
- JSON-safety of the new 3-field OK branch — carry S6 ARCH-4 forward, add a runtime round-trip assertion if we have a test path.
- Persona swap during in-flight refresh: scoring re-runs against whichever `effectiveWaypointFetch` is current when swap resolves. Add invariant to plan, no code change.
- Empty-corridor case (remote stop) — S5 empty state still applies, intentional, unchanged.
- requestIdRef stale-bail must run BEFORE the increment — verify guard order.
- `recomputeRouteAction` references confirmed: only `actions.ts` (def), `PlanWorkspace.tsx` (caller), `rate-limit.ts` (comment), session_state.json/Plans (docs). Rename is safe.

## Process Notes

- Three reviewers in parallel, ~50s total. Two reviewers independently flagged the SAME load-bearing issue (degraded clobbering) — high confidence signal.
- Security score is the highest yet (8/10) because S7 inherits S6 hardening. Architecture is mid (7.5 B) due to ARCH-2 + lat/lng gap that the plan punted on. Product is the lowest (6/10) — the banner removal trades a working warning for a silent failure mode.
- All blockers are small scope additions, not redesigns. Same shape as S6 council outcome.
