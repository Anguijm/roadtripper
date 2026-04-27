# Session Handoff

## Start here next session

**Current branch on origin: `main` at `418ae53`** (squashed PR #4 merge: S8c NeighborhoodPanel + CI grep). Local main is in sync. No open PRs. Working tree clean.

**S8 neighborhood drill-down is complete.** Three PRs merged this session:
- PR #2 `5dcedc0` — S8a: `NeighborhoodLiteSchema`, `neighborhoodsCacheKey` (SHA-256), `localizedText`, `MAX_NEIGHBORHOODS_PER_CITY`
- PR #3 `1ba6fd5` — S8b: `fetchNeighborhoods`, `Promise.all` orchestrator, `WaypointFetchResult` DU, `neighborhood_id` projection
- PR #4 `418ae53` — S8c: `<NeighborhoodPanel>`, `selectedCityId` wiring through `recomputeAndRefreshAction`, `dangerouslySetInnerHTML=` CI grep

**Next 1–2 actions (in priority order):**

1. **Step 9 — latency assertion** (S8 plan, post-merge). Load the live app, add a stop (las-vegas or any city), measure First-Add cold p50 in DevTools Network. Target: ≤ S7 baseline + 200ms. If over, lazy-fetch neighborhoods on panel expand rather than server-render. Record the measurement in a commit note. Low effort, closes the only open S8 plan item.

2. **Vitest scaffolding** (`chore: add vitest + firestore mocks`). Bugs reviewer asks for unit tests every round. A Vitest setup + Firestore emulator mock would give tests a place to land and silence the recurring council finding. No behavior change; council should converge in 1 round.

**Known stickies (no blockers):**
- **Post-commit hook + `gh pr merge` interaction.** Hook dirties `session_state.json` + `yolo_log.jsonl` after every commit. Workaround: `git stash` before merge, `git stash drop` after. Tracked in `.harness/learnings.md` IMPROVE bullet (2026-04-27).
- **Upstream [Anguijm/city-atlas-service#26](https://github.com/Anguijm/city-atlas-service/pull/26)** schema-convergence PR is still open. Worth a status check before next schema work.
- **30-day kill-criteria check** is scheduled (`trig_01YHMwS7gNTrnNqYY7AHhrpX`, fires 2026-05-26T00:00:00Z = 09:00 JST). Pulls PR cycle-time, council compliance, cost estimate. Opens a draft rollback PR if any criterion tripped; otherwise a "paying off" status issue.

---

## Historical log

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
