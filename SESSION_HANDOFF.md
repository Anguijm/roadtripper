# Session Handoff

## Start here next session

**Current branch on origin: `main` at `234a722`** (squashed PR #1 merge: city-atlas live-read + harness council v2 + CI workflow). Local main is in sync.

**One PR open: [#2 — S8a foundation](https://github.com/Anguijm/roadtripper/pull/2)** on branch `feat/session-8a-neighborhood-foundation`. Three council rounds run; the slicing strategy is being penalized by reviewers for *being* sliced (council grades the imagined complete feature, not the actual diff).

**Next action — bundle S8b + S8c into PR #2.** Decision made at end of last session: pull all 10 plan steps from `Plans/session-8-neighborhood-drilldown.md` into the existing branch. Larger PR but complete feature, which is what the council can actually grade. Same shape as PR #1 (huge, converged in 5 rounds).

Concretely on PR #2:
1. **Step 3** — `fetchNeighborhoods(cityId)` in `src/lib/routing/recommend.ts`. Wraps `listNeighborhoods` from `firestore.ts` with the SHA-256 cache key, dedupe (PROD-1: las-vegas duplicate-name collapse), and the `MAX_NEIGHBORHOODS_PER_CITY = 20` `.limit()`.
2. **Step 4** — Refactor `fetchWaypointsForCandidates` into a `Promise.all` orchestrator that fans out waypoints + neighborhoods. Returns the discriminated `WaypointFetchResult` from the resolver-produced PLAN.md (`{status:'fresh'|'degraded', cities, waypoints, neighborhoods, failures?}`).
3. **Step 5** — Add `neighborhood_id` to the existing `vibe_waypoints` `.select(...)` projection so the client can group locally without an extra fetch.
4. **Step 6** — `<NeighborhoodPanel>` in `src/components/`. Empty/failed/loaded states per PLAN. `useMemo` grouping. No `dangerouslySetInnerHTML`.
5. **Step 7** — Wire `plan/page.tsx` to pass the discriminated result through.
6. **Step 10** — `dangerouslySetInnerHTML` grep at lint or pre-commit (CI grep). Probably an ESLint rule scoped to `NeighborhoodPanel.tsx`.
7. **Step 9 (post-merge)** — Manual First-Add cold p50 measurement. Latency budget: ≤ S7 baseline + 200ms.

**Gating criteria for merging PR #2:** v2 council Proceed verdict, OR documented stable disagreement (per CONTRIBUTING.md kill criteria) where remaining findings are in the "council is grading the next feature, not this diff" pattern.

**Blockers / known stickies:**
- **No Vitest setup.** Bugs reviewer asks for unit tests every round; we don't have a test runner wired. Worth a separate `chore: add vitest + firestore mocks` PR before or after PR #2 — bundling it inflates this PR's scope, but skipping it leaves a recurring council blocker.
- **Product reviewer variance.** Same persona file, same plan, scores oscillating 3/4/7/8/9 across rounds. The kill criteria in `CONTRIBUTING.md` are the documented override. Will be exercised again on PR #2.
- **Post-commit hook + `gh pr merge` interaction.** The hook dirties `session_state.json` + `yolo_log.jsonl` after every commit. `gh pr merge` aborts on dirty tree. Workaround: stash before merge, drop after. Tracked in this session's learnings.md IMPROVE bullet.

**The 30-day kill-criteria check is scheduled** (`trig_01YHMwS7gNTrnNqYY7AHhrpX`, fires 2026-05-26 09:00 JST = 2026-05-26T00:00:00Z). It pulls PR cycle-time data, council compliance tally, and a cost estimate, then either opens a draft rollback PR or a "paying off" status issue.

---

## Historical log

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
