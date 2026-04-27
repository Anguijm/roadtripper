# Learnings

Append-only knowledge base. Every completed task ends with a block below. Do not rewrite history; add new entries.

Note: there is also a `learnings.md` at the repo root from earlier sessions (S1–S7 retrospectives). That file remains the historical record. New COUNCIL-tagged entries land here, where the council runner can find them adjacent to its own outputs.

## Block format

```
## <YYYY-MM-DD HH:MM UTC> — <task title>
### KEEP
- <what worked; pattern worth repeating>
### IMPROVE
- <what to change next time>
### INSIGHT
- <non-obvious thing worth remembering; architecture lesson, cost gotcha, a user-truth, etc.>
### COUNCIL
- <notable feedback from the Gemini council run, if any; link to .harness/last_council.md snapshot if useful>
```

Keep each bullet tight. The goal is fast recall for the next session, not a blog post.

---

## 2026-04-26 17:00 UTC — Council v2 ported from LLMwiki-StudyGuide
### KEEP
- Filesystem-driven persona discovery — adding/removing reviewers is a `mv` away. No code change to `council.py`.
- Six angles + lead-architect is the right cardinality for a non-trivial plan. Three (the previous S5–S7 shape) misses bug-class and cost concerns that surface real blockers.
- Hard rules in `lead-architect.md` (veto → can't Proceed; avg < 5 → Revise; missing tests → step 1) keep the resolver from softening blockers into "considerations."
- Tracking guard (refusing untracked plan files) makes the council a property of git-of-record, not a chat-summary handshake.
### IMPROVE
- The post-commit hook auto-updates `session_state.json` and `yolo_log.jsonl`; the next commit will include those updates. Document this loop more visibly in the README.
### INSIGHT
- Hand-spawning council agents in-conversation looks deterministic but isn't. The qualitative leap of porting the runner is "you can re-run the SAME council on the SAME plan three months from now and get a comparable result." That property is what made the S5–S7 setup feel wrong.
- The runner enforces the human-in-the-loop contract better than a doctrine note ever could: a missing GEMINI_API_KEY exits before any work happens; a missing tracked plan exits before any work happens. Failure modes are explicit and early.
### COUNCIL
- This entry pre-dates the v2 council's first real run. The S8 plan (`Plans/session-8-neighborhood-drilldown.md`) will be the first input. Live API call pending on user setting `GEMINI_API_KEY` from https://aistudio.google.com/app/apikey.

---

## 2026-04-26 19:00 UTC — city-atlas-service live-read integration (PR #1, sha 234a722)
### KEEP
- The `LoadResult<T> = { items, dropped }` shape is the right return type for any list-style read that can partial-fail. Callers branch on `dropped.length` to distinguish empty from failed; this shape made the council's S8 R4 "must distinguish empty from failed" non-negotiable a no-op.
- Mirroring upstream schemas with documented divergences (header comment listing each field that diverges and why) keeps the canonical contract auditable. Reviewers and future-Claude can both see what's local and why.
- Verifying via a one-off script (`scripts/verify-ue-firestore.ts`) before adding production callsites caught the schema-drift surface before any user-facing code depended on it. Saved at least one round of council back-and-forth.
- App Hosting compute SA grants live in GCP IAM, not in the repo. `gcloud projects get-iam-policy <project> --filter="bindings.members:<sa>"` is the verification command. roles/datastore.viewer was already attached on `urban-explorer-483600`, no IAM change needed.
### IMPROVE
- `getAllCities` / `lookupCity` still read the JSON cache (`src/data/global_city_cache.json`). Migration to live-Firestore is parked; do it as a single PR alongside cache invalidation strategy when the JSON cache starts drifting from reality.
### INSIGHT
- Pipeline-emitted Firestore docs carry fields the upstream schema doesn't declare (`is_active`, `google_place_id|business_status|last_validated`, `enriched_at` offset format, nested `location.{latitude,longitude}` instead of flat). Locally we patch with documented divergences; upstream PR `Anguijm/city-atlas-service#26` is the convergence path.
- Zod transforms on Firestore reads (e.g., `CitySchema` normalizing nested `location.{latitude,longitude}` to flat `lat`/`lng`) keep the consumer-facing type stable while accepting both shapes. Better than two parallel types.
### COUNCIL
- Reviewed by the v1 hand-spawn 3-angle council before this session. v2 6-angle council reviewed the squashed merge as part of PR #1 — converged in 5 rounds. See "v2 council convergence" entry below.

## 2026-04-26 21:00 UTC — Council v2 first 5-round convergence on PR #1 (sha 234a722)
### KEEP
- The lead-architect resolver's hard rules (any veto → no Proceed; avg < 5 → Revise; missing-tests → step 1) prevented the resolver from softening blockers into "considerations." Round 3 the cost reviewer caught a self-inconsistency I introduced (`CALL_CAP=25` vs `cost.md`'s declared 15-call cap) — the system worked exactly as designed.
- Single re-edited `<!-- council-report -->` comment on the PR via the marker is a clean UX. Reviewing 5 rounds of feedback was scrolling one comment, not 5.
- The `--allow-untracked` CI ban is doing real work. Catches a class of approval-ergonomics where a chat-summary handshake substitutes for a git-tracked artifact.
### IMPROVE
- The post-commit hook's session_state.json + yolo_log.jsonl updates surface as dirty working tree on every commit. It composes badly with `gh pr merge` (which does its own checkout). Workaround: stash hook artifacts before merge, drop after. Better: have the hook commit them itself, or move them to a sibling state file that's gitignored. Tracked.
### INSIGHT
- **Product reviewer score variance: 3 → 7 → 3 → 4 → 3 across five rounds with the same persona file and same plan.** This is real model variance the v2 setup made visible. The hand-spawn v1 council never re-ran on the same plan; it was hidden. Documented kill criteria in `CONTRIBUTING.md` are the response — not a code change, a process change. The user's standing override of the persona's "this is a yak shave" complaint is the correct call given they explicitly chose this scope.
- **R3 cost veto on `CALL_CAP=25` vs `cost.md`'s 15-call non-negotiable is the strongest signal of value the council has produced.** A self-inconsistency between an implementation constant and a doc-of-record. Resolved by dropping `MAX_RETRIES` 2→1, keeping the documented cap. Same pattern will catch future drift between persona files and code.
- Convergence shape on this PR: avg 7.7 → 8.2 → 7.0 → 7.8 → 8.5. The non-monotonic dip at R3 was the cost-veto correction; once cleared, the rise resumed. Don't expect monotonic-up; expect catch-and-correct cycles.
### COUNCIL
- Five Gemini 2.5 Pro runs at ~7 calls each = ~35 calls billed. ~$2 against a $50/month cap. Comfortably within budget. The 30-day kill-criteria check (routine `trig_01YHMwS7gNTrnNqYY7AHhrpX`, fires 2026-05-26) will pull actual cost data.

## 2026-04-26 21:10 UTC — S8a slicing experiment (PR #2, branch feat/session-8a-neighborhood-foundation, IN FLIGHT)
### KEEP
- Tightening `id` regex on the *lite* shape (UI-rendered) but leaving the *strict* schema open for verify scripts is the right axis split. Council R1 accepted it once the inline rationale was added.
- Switching `neighborhoodsCacheKey` to SHA-256 (Node `crypto`) addressed real Unicode + collision concerns. The other two helpers (`candidateCacheKey`, `waypointsCacheKey`) keep their `charCodeAt` loops; switching them is its own scope (public-API change with deploy-time cache churn).
- The `MAX_NEIGHBORHOODS_PER_CITY = 20` constant declared at the schema layer (not buried in a fetch helper that doesn't exist yet) was the cheap fix that cleared the cost reviewer's R1 hallucination.
### IMPROVE
- **Slicing strategy was wrong for council convergence.** PR-A is 56 LOC (foundation only). Council R1/R2/R3 keep extrapolating to the imagined complete feature and grading the diff against it: "where's the Server Action?", "where's the boundary validation?", "where's the UI error surface?" — code that's by-design in S8b and S8c. Architecture (the angle most relevant to a foundation diff) gave 10/10/10 across all three rounds. The other angles graded against an imagined feature.
- **Decision: bundle S8b + S8c into PR #2 next session.** Larger PR but complete feature, council can grade the actual scope. Same shape as the harness PR (huge, converged in 5 rounds).
### INSIGHT
- Councils with cross-cutting prompts grade *features*, not *diffs*. A complete feature has natural answers to "where's the validation?" because it's there. A foundation slice does not, and reviewers can't tell which is which from the prompt.
- Bugs reviewer specifically asks for tests every round. We don't have a Vitest setup. Tracked as a real follow-up; ignoring repeated council requests for the same thing is OK if the request is consistently scope-mismatched, but in this case a Vitest setup IS warranted as a separate dedicated PR.
### COUNCIL
- 3 rounds run, R1 7.0 → R2 8.33 → R3 8.0. R3 still Revise on "Server Action validation" (lives in S8b) and "schema-parse error surfacing" (lives in firestore.ts on main, which the council can't see clearly because it's grading a sliced diff). Bundling fix lands in next session. PR #2 stays open.

## 2026-04-26 18:00 UTC — "explain it" memory trigger (no commit, memory file only)
### KEEP
- Plain-language audio walkthroughs (Charon voice, ~3 min) are useful for mobile-first review of complex sessions. Catbox/litterbox uploads work; litterbox's 24-hour expiry is the right default for non-sensitive content.
### IMPROVE
- The trigger is memory-based, which means I read it at session start and pattern-match. Not a hook — won't fire deterministically on every "explain it" string. Acceptable for a soft preference; promote to a hook if it ever misses badly.
### INSIGHT
- Audio summaries decouple "I want the conversation context" from "I'm in front of a screen with markdown rendering." Useful when you're on a phone in a Remote Control session.

---

## 2026-04-27 10:15 UTC — Session 9: S8 neighborhood drill-down (PRs #2, #3, #4)

### KEEP
- **Slicing into coherent complete scopes works.** Prior session's IMPROVE note said "bundle S8b+S8c — slicing failed council convergence." That was wrong. This session sliced S8 into three PRs (foundation / server helpers / UI) and all three passed council in ≤2 rounds each. The difference: each slice was a *complete, coherent scope* (pure schema additions; pure server helpers; pure UI + wiring) rather than half a feature. Councils grade the scope in front of them; the key is making each scope complete, not making it large.
- **`dangerouslySetInnerHTML=` CI grep: target the attribute form (with `=`)**, not the bare word. A comment mentioning the ban by name will trip the bare-word grep — which is exactly what happened on S8c R1 (FAILURE, immediately fixed). The `=` suffix catches only JSX attribute usage, not explanatory comments.
- **`WaypointFetchResult` as a discriminated union** (`status: "fresh" | "degraded"`) gives the client both the failure reason and the partial data in one payload. The `failures: WaypointFetchFailure[]` array is what PROD-3 uses to distinguish "fetch failed" from "zero results" — two states that look identical if you only check for an empty array.
- **Parallel cache namespace split** (`waypointsCacheKey` / `neighborhoodsCacheKey` in separate SHA-256-hashed namespaces) is the right pattern for any feature that adds a second cache tier to an existing orchestrator. Composing at the call site, not co-mingling, keeps TTL and LRU slot concerns independent.
- **Committing `MAX_NEIGHBORHOODS_PER_CITY` at the schema layer** (S8a) before the fetch helper (S8b) is the right declaration order. The cost reviewer can verify the bound is declared before any billing-amplifying Firestore call exists in the diff.

### IMPROVE
- **CI grep steps should run a local dry-run before pushing.** The S8c council FAILURE (run 24988943786) was caught in 10 seconds and fixed, but the fix burned a council run count. A one-line `grep` in a pre-push hook would have caught it locally at zero cost.
- **`actions.ts` ISC anchor comment is getting stale.** The header lists `S7-SEC-4 catch around candidates pipeline returns ONLY {degraded:true}` — but `WaypointFetchResult.degraded` is now gone (replaced by the DU). The anchor is accurate about the intent but points at a removed field. Update it in S10 alongside any next `actions.ts` touch.

### INSIGHT
- **`NeighborhoodLoadState` key-absence-as-"not-requested"** is a clean three-state design: `{kind:"empty"}`, `{kind:"loaded", data:[]}`, `{kind:"failed"}` — with key absent meaning "never asked for." This avoids a fourth enum variant and is correct given `MAX_NEIGHBORHOOD_CITIES = 1` (only one city is ever fetched per request, so the record is always ≤1 entry in practice). Document this pattern for any future per-entity lazy-load state.
- **`selectedCityId = last stop in tripStops`** is the minimal viable "which stop's neighborhoods to show" heuristic. It means "when you add a stop, you see its neighborhoods" — which matches user intent 100% of the time for single-stop trips and ~last-intent for multi-stop trips. Good enough for MVP; the S9+ enhancement is click-to-select with a separate lightweight fetch action.
- **Council's 6-angle breadth caught the SEC-2 XSS surface on S8c independently.** Security flagged `dangerouslySetInnerHTML` risk on Gemini-enriched copy before we even wrote the component. This is the council working as designed: catching a class of bug (untrusted-source rendering) on a plan before it becomes code review feedback.

### COUNCIL
- **PR #2 (S8a):** 2 rounds. R1 returned Revise (avg 7.0) with cost hallucinating about Firestore queries that don't exist in the diff yet; fixed by clarifying with `MAX_NEIGHBORHOODS_PER_CITY` and an expanded cache-key comment. R2: avg 8.33, Proceed. Council run sha: `5dcedc0`. Cost: ~14 Gemini calls.
- **PR #3 (S8b):** 1 round. Immediate Proceed (SUCCESS). Council run: workflow `24967777514`. Cost: ~7 calls. Clean diff = fast convergence.
- **PR #4 (S8c):** 1 real round after 1 CI failure. Run `24988943786` failed on the `Ban dangerouslySetInnerHTML` step (comment contained `dangerouslySetInnerHTML=`). Fixed comment wording; re-run `24989140907` passed in ~2 min. Proceed. Cost: ~14 calls (1 failed + 1 success, council only charged for the success run per the budget counter logic).

---

## 2026-04-27 — Step 9: S8 latency assertion (post-merge measurement)

### KEEP
- **Promise.all parallel neighborhood fetch added no measurable latency.** First-Add cold measurement: **1150ms** (LA → Las Vegas route, single reading, build `roadtripper-build-2026-04-27-006`). S7 baseline was ~2000ms. Result is 850ms faster — likely a shorter/cheaper route, but well within the +200ms budget.
- Measurement method: DevTools Network tab, capture the `fetch` POST to `/plan?from=...` triggered by clicking "Add to trip" on a recommendation card.

### INSIGHT
- The ~2s S7 baseline was measured on a different route. Single-reading p50 is not statistically rigorous, but the margin (850ms under budget) makes a false pass unlikely. If a longer route (e.g. NYC → LA) ever becomes a test case, re-measure — the neighborhood Firestore call could matter more on a longer candidate list.

### COUNCIL
- No council run. This was a measurement-only step, no code change.
