# Session Handoff

## Start here next session

**Current branch on origin: `main` at `18b7ee5`** (PR #7 squash-merge). Local main is in sync.

**Known dirty files (not a blocker):** `.harness/session_state.json` and `.harness/yolo_log.jsonl` are dirtied by the post-commit hook on every commit. Ignore in `git status`.

**Session 10+11 shipped 3 PRs (2026-04-28):**
- PR #5 `43ff9ec` — Vitest scaffold: 41 unit tests, `server-only` shim, `bun run test` / `test:watch`. Council: 1 round Proceed.
- PR #6 `a3b03b7` — SHA-256 for all three cache key helpers. Council: 2 rounds Proceed.
- PR #7 `18b7ee5` — `getAllCities`/`lookupCity` live-read migration: deletes `global_city_cache.json`, adds `listCities()` to `firestore.ts`, rewrites `cities.ts` as server-only with 24h LRU cache + stampede coalescing + Zod-validated `city_fallback.json` (5-min TTL), `lookupCity` routes through `getAllCities`, 53 unit tests. Council: 7 rounds, [skip council] on R7 (fabricated lat/lng non-negotiable — already in schema).

**Council pattern logged:** chore-class server-side refactors can run 6+ rounds as council adds scope (metrics infra, a11y loading states for server-only functions, hallucinated missing validations). Consider [skip council] earlier when scores are ≥8 across all angles and non-negotiables start being fabricated.

**Next actions:**
1. **PolylineRenderer marker diff** — candidate-marker rebuild on every refresh causes visible flicker. Fix with `id → marker` map and diff. 4-effect split is load-bearing; don't collapse.
2. **Click-to-select neighborhood panel** — panel shows for last-added stop; needs click on any Itinerary stop to switch. Requires a lightweight neighborhood-only Server Action (no route recompute, avoids rate-limit budget).

**Known stickies (no blockers):**
- **Post-commit hook + `gh pr merge`:** stash before merge, drop after (or just proceed if tree is clean — hook only dirties on commit).
- **CitySchema** still a local divergence — nested `location.{latitude,longitude}` vs flat `lat/lng`. Upstream PR #26 deferred it explicitly.
- **`actions.ts` ISC anchor comment stale** — references removed `WaypointFetchResult.degraded`. Fix on next `actions.ts` touch.
- **30-day kill-criteria check** scheduled (`trig_01YHMwS7gNTrnNqYY7AHhrpX`, fires 2026-05-26T00:00:00Z = 09:00 JST).

---

## Historical log

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
