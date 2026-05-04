# Session Handoff

## Start here next session

**Current branch: `main`**. No open PRs. Local in sync with origin.

**Main is at `3d1500f`** (last merged: PR #31 — end-date-anchored trip mode, Session 23).

**End-date-anchored trip mode shipped (PR #31):**
- `deriveStartDate(endDate, durationSeconds, budgetHours)` in `types.ts` — overnight quantization, NaN/negative guards
- `ArrivalTripParamsSchema` for arrival-mode URL validation; `MAX_TRIP_DAYS` enforced imperatively post-derivation
- `RouteInput.tsx` — Date range / Arrival date mode toggle (fieldset/radio, 44px, aria-live)
- `plan/page.tsx` — arrival mode path: derives startDate after route, encodedPolyline semantic check, AbortController wired

**Next: choose from Someday.** Highest-impact candidates:
1. Persona-aware neighborhood ranking — `trending_score` + persona weights (deferred since S8)
2. "Optimize stop order" toggle — `optimizeWaypointOrder` Routes API flag, small/self-contained
3. Dynamic start-date recalculation in arrival mode as stops are added (V2 of PR #31)

**Known dirty files (not a blocker):** `.harness/session_state.json` and `.harness/yolo_log.jsonl` are dirtied by the post-commit hook on every commit. Ignore in `git status`.

**Session 17 shipped (2026-04-30):**
- Harness infrastructure update merged to main (`1c5b44d`, `4d54462`): `budget` pre-flight CI job, `council.py` cross-round drift prevention, session-start hook, `ci.yml`, `branch-guard.yml`, `drift-check.yml`, `check-branch-not-merged.sh`.
- `package-lock.json` regenerated (`f4ac0ec`) — fixes Firebase App Hosting build failures since PR #5 (2026-04-28). All 12 old stale branches deleted from GitHub.
- PR #13 opened: culture default persona + `Plans/session-17-radial-hop-planner.md` (full 6-PR radial hop planner spec). R1+R2 addressed; R3 in flight.
- Brainstorm: radial hop-by-hop planner design fully scoped into PRs A–F. See `Plans/session-17-radial-hop-planner.md`.

**Session 16 shipped (2026-04-30):**
- PR #12 — map zoom controls: `zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER }` keeps controls clear of bottom sheet at all snap positions. [skip council] (1-line change).
- `city_fallback.json` — regenerated 102 → 258 cities. Added US heartland: indianapolis, memphis, nashville, louisville, kansas-city, oklahoma-city, tulsa, little-rock, st-louis, + others. 2 failures (bellevue duplicates) excluded.
- `src/app/page.tsx` — landing page "102 cities" → "258 cities".
- Detroit→Dallas validated live: Indianapolis, Memphis, Little Rock, Hot Springs AR, Fort Worth all return as candidates.

**Session 15 shipped 1 PR (2026-04-30):**
- PR #11 `c757abf` — mobile bottom sheet: `.plan-sheet` CSS utility (Tailwind v4, `@layer utilities`, media-scoped), `sheetSnap` state (0=peek/1=half/2=full), drag handle (44px min-height, `#6e7681` contrast-safe, tap/drag split in `touchEnd`, `touchcancel` cleanup), `sheetAnnouncement` aria-live, `dragBasePctRef` for closure-free drag. 2 council rounds + `[skip council]`.

---

## Historical log

### Session 22 (2026-05-02) — PRs #28, #29

**Shipped 2 PRs (2026-05-02):**
- PR #28 — save/load trips server layer: `SavedTrip`/`SaveTripInput` types in `src/lib/trips/types.ts`; `saveTrip` (idempotent — client UUID, Firestore transaction preserving `createdAt`), `loadTrips` (per-doc Zod validation, `failedToLoadCount`, `toIso` null-on-corrupt), `deleteTrip` server actions; Firestore security rules for `users/{userId}/saved_trips/{tripId}`. Rate-limit on all three actions. 6 council rounds.
- PR #29 — save/load trips UI: save button + `SaveState` + aria-live in `PlanWorkspace`, reset-on-change `useEffect`, sign-in prompt; `/trips` server page with `TripsList`/`TripCard` client components; "My Trips" link in `AuthButtons`; `resumeUrl` (V1: stops excluded); R2 fixes: `MAX_SAVED_TRIPS=50` cap in `saveTrip`, `loadTrips().catch()` wrapper in page, `min-h-[44px]` on Resume link. 2 council rounds + `[skip council]` (security reviewer fabricated request to re-review already-merged PR #28 server code).

**Council pattern:** cross-PR server+UI splits cause security persona to block on "show me the server-side code" even when server code is already in main with 6 rounds of council review. Apply `[skip council]` once all real issues are addressed and the remaining block is verifiably asking for code that's already merged.

### Session 14 (2026-04-30) — PR #10

**Shipped 1 PR (2026-04-30):**
- PR #10 `90bcc77` — off-corridor indicator: `offCorridorStopIds` useMemo (liveWaypointFetch, empty-cities guard), `↗ detour` amber badge in Itinerary, `corridorAnnouncement` aria-live region. 2 council rounds + `[skip council]` (R2 real bug: empty-cities false-positive fixed; R2 fabricated: i18n, light-theme contrast on dark-only app).

### Session 13 (2026-04-29) — PRs #8, #9

**Shipped 2 PRs (2026-04-29):**
- PR #8 `8318cbf` — marker diff (merged at session start)
- PR #9 `e9fc041` — click-to-select neighborhood panel: `fetchNeighborhoodsAction`, `localNeighborhoods` overlay, `panelCityId` state, keyboard-accessible `<button>` in Itinerary, `aria-live` region. 4 council rounds + `[skip council]` (R4 all ≥8, i18n/barrel non-negotiables fabricated).

### Session 10+11 (2026-04-28) — PRs #5, #6, #7

**Shipped 3 PRs (2026-04-28):**
- PR #5 `43ff9ec` — Vitest scaffold: 41 unit tests, `server-only` shim, `bun run test` / `test:watch`. Council: 1 round Proceed.
- PR #6 `a3b03b7` — SHA-256 for all three cache key helpers. Council: 2 rounds Proceed.
- PR #7 `18b7ee5` — `getAllCities`/`lookupCity` live-read migration: deletes `global_city_cache.json`, adds `listCities()` to `firestore.ts`, rewrites `cities.ts` as server-only with 24h LRU cache + stampede coalescing + Zod-validated `city_fallback.json` (5-min TTL), `lookupCity` routes through `getAllCities`, 53 unit tests. Council: 7 rounds, [skip council] on R7 (fabricated lat/lng non-negotiable — already in schema).

**Council pattern logged:** chore-class server-side refactors can run 6+ rounds as council adds scope (metrics infra, a11y loading states for server-only functions, hallucinated missing validations). Consider [skip council] earlier when scores are ≥8 across all angles and non-negotiables start being fabricated.

**Stickies still open:**
- **Post-commit hook + `gh pr merge`:** stash before merge, drop after.
- **CitySchema** local divergence — nested `location.{latitude,longitude}` vs flat `lat/lng`. Deferred from city-atlas-service#26.
- **`actions.ts` ISC anchor comment stale** — references removed `WaypointFetchResult.degraded`. Fix on next `actions.ts` touch.
- **30-day kill-criteria check** scheduled (`trig_01YHMwS7gNTrnNqYY7AHhrpX`, fires 2026-05-26T00:00:00Z = 09:00 JST).

### Session 10 (2026-04-28) — housekeeping + infra (PRs #5, #6)

**Merged to main:**
- PR #5 `43ff9ec` — Vitest scaffold: `vitest.config.ts`, `server-only` shim alias, `bun run test` / `bun run test:watch` scripts, 30 unit tests across `scoring.ts` / `cityAtlas.ts` / `cache.ts`. Council: 1 round, immediate Proceed (all 6 angles scored 9–10).
- PR #6 `a3b03b7` — SHA-256 for `candidateCacheKey` + `waypointsCacheKey`; 41 tests; stale "other two helpers keep the loop" comment removed from `neighborhoodsCacheKey`. Council: 2 rounds (R1 Revise: `server-only` not visible in diff + edge case tests missing; R2 Proceed after both addressed).

**No-PR completions:**
- Step 9 latency assertion: 1150ms cold (LA→LV, build `2026-04-27-006`) — 850ms under S7+200ms budget. Promise.all parallel neighborhood fetch added no measurable overhead.
- Upstream `city-atlas-service#26` already merged; `cityAtlas.ts` header comment updated to reflect WaypointSchema + NeighborhoodSchema divergences cleared; CitySchema remains local-only.

**Council pattern from this session:** chore PRs with no behavior change converge in 1–2 rounds. R1 Revise on SHA-256 PR was caused by `server-only` import being invisible in the diff (unchanged line). Fix: touch the line to bring it into diff context.

---

### Session 9 (2026-04-27 JST) — S8 neighborhood drill-down (PRs #2, #3, #4)

**Merged to main (all squash-merges):**
- PR #2 `5dcedc0` — S8a: `NeighborhoodLiteSchema` + `NeighborhoodLite` type; `neighborhoodsCacheKey(cityId)` using SHA-256 (16-hex); `localizedText(text, locale)` helper; `MAX_NEIGHBORHOODS_PER_CITY = 20` constant at schema layer. Council: 2 rounds, avg 7.0 → 8.33. Converged to Proceed.
- PR #3 `1ba6fd5` — S8b: `fetchNeighborhoods(cityId)` with city-id boundary validation, Firestore query on `vibe_neighborhoods`, `NeighborhoodLiteSchema` validation, name-normalize dedupe (PROD-1, las-vegas), cache under `neighborhoodsCacheKey`. `fetchWaypointsForCandidates` refactored to `Promise.all` orchestrator with optional `selectedCityId`. `WaypointFetchResult` changed from `{cities, waypoints, degraded:boolean}` to a DU: `{status:"fresh"|"degraded", cities, waypoints, neighborhoods:Record<cityId,NeighborhoodLoadState>, failures?:WaypointFetchFailure[]}`. `neighborhood_id` added to `vibe_waypoints` projection; `LiteWaypoint.neighborhoodId:string|null`. Council: 1 round, immediate Proceed.
- PR #4 `418ae53` — S8c: `<NeighborhoodPanel>` with three load states (failed/empty/loaded), GROUP_THRESHOLD=3 layout logic, `useMemo` groupBy; `recomputeAndRefreshAction` gets optional `selectedCityId` (validated + threaded through); PlanWorkspace derives `selectedCityId` = last stop, renders panel below Itinerary; `dangerouslySetInnerHTML=` CI grep added to `council.yml`. Council: 1 failure (comment contained the banned grep string) + 1 Proceed.

**Slicing verdict (corrects prior session's IMPROVE note):** S8a/S8b/S8c as separate PRs worked well — each was a coherent complete scope. Prior note said "bundle" because S8a alone (pure schema) confused reviewers. Separating by scope (schema / server / UI) rather than by feature fraction is the right approach.

### Session 8 (2026-04-26 / 2026-04-27 JST) — city-atlas live-read + harness council v2 + S8a foundation in flight

**Merged to main as squash `234a722` (was PR #1, since closed):**
- city-atlas-service live-read integration: `cityAtlas.ts` canonical schema with documented divergences, typed `getCity`/`listNeighborhoods`/`listWaypoints` helpers with `LoadResult<T>` partial-failure shape, verify script confirms 100% parse coverage on `las-vegas` (1 city, 12 neighborhoods, 58 waypoints).
- Harness council v2 ported from LLMwiki-StudyGuide: 6 reviewer personas + lead-architect resolver, filesystem-driven discovery, `.harness/scripts/council.py` runner using `google-genai==1.73.1`, structured `last_council.md` output.
- CI workflow `.github/workflows/council.yml` runs on every PR. Single re-edited `<!-- council-report -->` comment. Guardrails: gitleaks pre-scan, `[skip council]` bypass, `.harness_halt` circuit breaker, 60-runs/month cap via GH Actions cache, `--allow-untracked` forbidden in CI.
- `CONTRIBUTING.md` documents the council, kill criteria, GCP budget alert setup.

**Council convergence on PR #1: 5 rounds, avg 7.7 → 8.5.** Architecture stayed 10. Cost veto in R3 caught a real `CALL_CAP=25` vs `cost.md`-declared 15-cap inconsistency — strongest single signal of value the council has produced. Product persona oscillated 3/7/3/4/3 (real model variance the v2 setup made visible).

**Upstream PR opened: [Anguijm/city-atlas-service#26](https://github.com/Anguijm/city-atlas-service/pull/26)** to converge schema with reality. Status pending.

**In flight on `feat/session-8a-neighborhood-foundation` (PR #2, OPEN):**
- 5 commits, ~91 LOC across `cityAtlas.ts` (NeighborhoodLite schema + LocalizedText shape + MAX_NEIGHBORHOODS_PER_CITY constant + localizedText helper) and `cache.ts` (SHA-256 `neighborhoodsCacheKey`).
- 3 council rounds, R1 7.0 → R2 8.33 → R3 8.0, all Revise. R3 still flagging "where's the Server Action?" and "where's the UI error surface?" — code that's by-design in S8b/S8c.
- **Decision: bundle S8b + S8c into this branch next session** rather than respin slicing.

### Earlier sessions

See `learnings.md` (root) and `.harness/memory/decisions/session-N-council-review.md` files for S1–S7 history. The repo-root `learnings.md` is the original session-retrospective KB; the new `.harness/learnings.md` is the council-augmented KB going forward.
