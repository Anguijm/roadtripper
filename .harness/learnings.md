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

## 2026-04-28 — Session 10: housekeeping + infra (PRs #5, #6, #7 in flight)

### KEEP
- **Chore PRs with no behavior change converge in 1–2 council rounds.** PR #5 (Vitest) hit 1 round, PR #6 (SHA-256) hit 2. Clean diffs with well-named tests read quickly for all 6 angles.
- **Always use CI diff-review path for council — never the local `--plan` runner.** `GEMINI_API_KEY` lives in GitHub Actions secrets. Create branch → implement → open PR → wait for CI. The committed plan file satisfies the tracked-plan requirement. Locked in memory: `feedback_council_local_key.md`.
- **`server-only` imports invisible in diff → hallucinated as missing.** PR #6 R1 Revise was caused by the council's diff view not including unchanged line 1 (`import "server-only"`). Fix: touch the line with a comment to force it into the diff context. Saves a round.
- **Keep `geometricFilter` synchronous even when its data source becomes async.** `findCandidateCities` (already async) fetches `await getAllCities()` once and passes via `options.cities`. `geometricFilter` stays a pure function — testable without Firestore, no signature change.
- **Update docs at each merge, not at session end.** Caught stale BACKLOG + SESSION_HANDOFF at closeout; should update after each merge so the next session picks up clean state.

### IMPROVE
- **`actions.ts` ISC anchor comment is still stale** — lists `S7-SEC-4 catch... returns ONLY {degraded:true}` but `WaypointFetchResult.degraded` was replaced by the DU in S8b. Update on next `actions.ts` touch.
- **`geometricFilter` docstring still says "For each of the 102 UE cities"** — hardcoded city count will drift as Urban Explorer grows. Update when next touching that function.

### INSIGHT
- **Deleting a 1650-line JSON snapshot and replacing it with two functions (listCities + getAllCities) is a net improvement in maintainability.** The JSON had no validation, no partial-failure surface, and silently served stale data. The live path has all three via `LoadResult<City>` and the `parseDocs` pattern already established in `firestore.ts`.
- **Council CI runs on PRs only; `workflow_dispatch` skips the PR comment step.** There is no "manual trigger with output" shortcut — you must have an open PR for the council comment to land.

### COUNCIL
- **PR #5 (Vitest scaffold):** 1 round, immediate Proceed. All 6 angles scored 9–10. Cost: ~7 calls. Fast because the diff was pure additive dev tooling.
- **PR #6 (SHA-256 cache keys):** 2 rounds. R1 Revise: (1) `server-only` import not visible in diff (unchanged line), (2) edge case tests missing. R2 Proceed after touching the import line + adding 5 edge case tests (empty input, comma IDs, Unicode). Cost: ~14 calls.
- **PR #7 (live city read):** open as of 2026-04-28 closeout. Council pending.

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

## 2026-04-29 — Session 12: PolylineRenderer marker diff (PR #8, in flight)

### KEEP
- **`onCandidateClickRef` pattern for stable event handlers.** Assign `ref.current = prop` in render (not in an effect) so the ref is always current. Listener closures delegate through the ref — created once per marker, never stale. Avoids the stale-closure bug where survivor markers keep an old callback without re-attaching.
- **SVG data URI for 44px touch targets.** `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}` with `anchor: new google.maps.Point(22,22)` and `scaledSize: new google.maps.Size(44,44)` gives a 44×44 transparent hit area with a small visible circle centered inside. Mobile-primary apps need this; WCAG 2.5.5 is the citation.
- **`aria-live="polite"` from inside GMap children works.** `PolylineRenderer` returned `null` before; it now returns a `sr-only` div with the live region. Works because GMap renders React children normally — the div lands in the map container's DOM, invisible to sighted users, readable by screen readers.
- **Effect 2b/2c order is load-bearing.** Effect 2b is cleanup-only (`[map]` dep, returns teardown). Effect 2c is diff-only (`[map, candidates, routeColor]` deps, NO return cleanup). 2b must be declared before 2c so React runs 2b's cleanup before 2c's body on a map change. This prevents double-creation of markers.
- **Mobile is primary, not secondary.** "Mobile deferred" in the backlog = bottom sheet layout (the aside panel doesn't fit phones). It does NOT mean touch targets are optional. When the council flags 44px touch targets, that's a legitimate blocker for a mobile-primary app.

### IMPROVE
- **Use `[skip council]` earlier when a11y invents new blockers each round.** PR #8 went 3 rounds: R1 caught real bugs (stale handler, missing live region — fixed). R2 introduced touch targets (legitimate for mobile-primary — fixed) + theme stroke + i18n (scope-creep). R3 introduced `prefers-reduced-motion` (new scope-creep) + still blocked on theme stroke + i18n. A11y score went 4 → 5 (getting worse despite fixes). The signal to skip is: all non-a11y angles ≥8, a11y keeps adding new requirements it didn't flag previously, and the requirements are outside the PR's scope (no theme system, no i18n layer, motion preference outside this diff).
- **End every response with "what we're waiting on next" — not what just happened.** User had to scroll up to find the council status. The last line should always be the blocking action: "council is running, check with X command" or "waiting for your go-ahead on Y."

### INSIGHT
- **A11y reviewers fabricate new requirements each round in a way that semantic reviewers don't.** Security, architecture, and bugs reviewers converge (their non-negotiables get addressed and they move on). The a11y angle keeps introducing new scope each round: first it was "no live region," then "theme-adaptive stroke + i18n + touch targets," then "prefers-reduced-motion + i18n + theme stroke (again)." This is a property of how accessibility is graded against an evolving checklist, not a specific failing of the council. The response is to fix legitimate items in scope (live region, touch targets) and use `[skip council]` for scope-creep items (theme switching that doesn't exist, i18n that doesn't exist, motion preference for a camera animation outside the PR's diff).
- **The 4-effect split is now a 7-effect split.** PR #8 expanded Effect 2 (previously "all markers") into three sub-effects: 2a (endpoint markers, `[map, origin, destination]`), 2b (candidate cleanup, `[map]`, cleanup-only), 2c (candidate diff, `[map, candidates, routeColor]`, no cleanup). Total effects in `PolylineRenderer`: 1a, 1b, 2a, 2b, 2c, 3, 4 = 7.

### COUNCIL
- **PR #8 (polyline marker diff):** 3 rounds as of 2026-04-29 closeout. R1 Revise: stale click handler + missing a11y live region (both legitimate, both fixed, commits `06325d5`). R2 Revise: touch targets (fixed, commit `bc39e3f`) + theme-adaptive stroke + i18n (scope-creep, not fixed). R3 Revise: a11y score 5/10 (all others 8–10). A11y introduced `prefers-reduced-motion` as new blocker; theme stroke and i18n repeated. PR is blocked on fabricated a11y requirements. Resolution: `[skip council]` merge approved by user — pending next session.

---

## 2026-04-29 — Session 13: click-to-select neighborhood panel (PR #9, merged e9fc041)

### KEEP
- **Remove boolean loading state; derive from data presence.** `isPanelLoading: boolean` caused a true→false→true flicker when users switched between uncached stops (cleanup set it false, new effect set it true). Replacing with `effectiveNeighborhoods[panelCityId] == null` as the loading condition is race-free: the data record is the source of truth.
- **`[skip council]` at R4 when all angles ≥8 and remaining non-negotiables are fabricated.** R1: security/bugs both 5 (real issues — rate limit, Zod, flicker, `.catch()`). R2: a11y 3 (keyboard a11y, aria-live — real). R3: bugs 5 (cleanup flicker — real). R4: all ≥8, remaining non-negotiables = "no client barrel to check" + "NeighborhoodPanel XSS already protected" + "i18n doesn't exist". Pattern matches the `[skip council]` criterion.
- **Per-feature spacing limiter** (`checkNeighborhoodSpacing`, 300ms, own storage map) prevents a neighborhood fetch from sharing the recompute spacing tracker — these are different operations with different cadences.
- **`aria-live` + `panelAnnouncement` state** is the cleanest way to drive screen-reader updates from async fetches: flip the state string in `.then()` / `.catch()`, render in a `sr-only` div. No extra ref or effect needed.

### IMPROVE
- **A11y i18n non-negotiable is fabricated every session.** PR #7, PR #8, PR #9 all had the council demand i18n for UI strings when the project has no i18n system. Pattern: the a11y angle grabs any new hardcoded string and declares it a non-negotiable. The correct response is `[skip council]` once all other angles are ≥8, not building a phantom i18n layer. Track this as a known fabrication pattern.
- **WCAG 1.4.10 Reflow blocker was a pre-existing issue.** The 360px `<aside>` has been non-reflow-compliant since Session 5. Council kept raising it as new on this PR. Added to BACKLOG as part of the mobile bottom sheet item.

### INSIGHT
- **`localNeighborhoods` overlay pattern is reusable.** When a component already has a server-provided `Record<id, State>` (here: `effectiveWaypointFetch.neighborhoods`), adding on-demand loading for additional keys is cleanly done with a `localOverlay: Record<id, State>` merged via spread. The live data stays clean; the overlay is pure client state. No need to mutate or re-fetch the live result.
- **`<li>` with onClick is not keyboard-accessible.** The council caught this at R2. The fix is always: button inside the `<li>` for the main action, sibling button for Remove, `e.stopPropagation()` not needed since they're siblings.

### COUNCIL
- **PR #9 (click-to-select panel):** 4 rounds + `[skip council]`. R1 Revise (sec/bugs 5/5): rate limit, Zod, stuck loading, flicker, .catch(). R2 Revise (a11y 3): keyboard a11y, aria-live, motion-safe, spacing. R3 Revise (bugs 5): cleanup flicker (isPanelLoading boolean). R4 Revise (all ≥8): fabricated non-negotiables — no barrel to check, XSS already protected by CI grep, i18n doesn't exist. `[skip council]` approved.

---

## 2026-04-30 — Session 14: off-corridor indicator (PR #10, merged 90bcc77)

### KEEP
- **Empty-array guard is required alongside null guard.** `liveWaypointFetch?.cities?.length === 0` must return an empty set, same as `null`. A degraded/failed recompute can return an empty array — without the guard, every stop gets a false `↗ detour` badge. The pattern: `const cities = liveWaypointFetch?.cities; if (!cities || cities.length === 0) return new Set();`.
- **`[skip council]` at R2 when the one real bug is fixed.** R1 caught a real edge case (empty cities array). R2 still Revise on: stale closure (deps array was already correct), light-theme contrast (app is dark-only), i18n (no i18n system). Once the real concern is addressed, `[skip council]` is the right call.
- **Council process is working — noise is concentrated in a11y + bugs at round N+1.** Security/architecture/cost/product converge quickly with real findings. A11y and bugs keep generating fabricated non-negotiables in later rounds. This is a known pattern; the response is not to fix phantom issues but to apply `[skip council]` once all real findings are addressed.

### IMPROVE
- **A11y reviewer hardcodes "light theme" contrast concerns even on dark-only apps.** `#d29922` on `#0d1117` is ~7.7:1 contrast, well above the 4.5:1 AA threshold. The reviewer still flagged it as a failure against an imagined light background. Resolution: verify contrast manually before treating it as a real blocker.

### INSIGHT
- **The council catches ~1 real bug per PR in the bugs angle, wrapped in 2–3 hallucinated ones.** It's worth doing for that one real catch (empty cities here, cleanup flicker in PR #9, stale handler in PR #8). The cost is parsing out fabrications — which is manageable once you know the pattern.

### COUNCIL
- **PR #10 (off-corridor indicator):** 2 rounds + `[skip council]`. R1: real bug — empty cities array treated as valid (fixed: `cities.length === 0` guard). R2: fabricated — stale closure (deps correct), light-theme contrast (dark-only app), i18n. All angles ≥8 (avg 8.5). `[skip council]` applied.

---

## 2026-04-30 — Session 15: mobile bottom sheet (PR #11, merged c757abf)

### KEEP
- **CSS custom property + `@layer utilities` is the right pattern for media-conditional JS-driven animation.** `.plan-sheet` scopes `position: fixed` + `transform: translateY(var(--sheet-y))` to `@media (max-width: 767px)` only. React sets `--sheet-y` via the `style` prop for snapped positions; touch handlers mutate it directly via `style.setProperty` during drag (no React re-renders per pixel). Desktop is untouched — the media query simply doesn't fire.
- **`dragBasePctRef` eliminates closure staleness in `handleSheetTouchMove`.** Read the current CSS var value at `touchStart` and store it in a ref. `handleSheetTouchMove` then has zero state dependencies and never needs to be in a `useCallback` dep array. Cleaner than including `sheetSnap` in deps and re-creating the callback each snap.
- **Tap vs drag split belongs in `touchEnd`, not as a parallel `onClick`.** `onClick` fires after `touchEnd` — having both causes double state updates on fast taps. Detect tap (`Math.abs(rawDelta) < 5px`) at the top of `handleSheetTouchEnd` and return early with `cycleSnap`. Remove `onClick` entirely.
- **`touchcancel` handler is non-negotiable for bottom sheets.** iOS fires `touchcancel` on system gestures (home indicator swipe, incoming call). Without a handler, `--sheet-duration: 0ms` stays set and all future transitions are disabled until remount. One-liner: restore duration + set `--sheet-y` back to the current snap value.
- **Council caught real a11y bugs in R1 on this PR.** Touch target (16px → 44px), contrast (`#30363d` → `#6e7681`), double-fire, missing aria-live — all legitimate. This is the council working as designed: R1 catches the real issues, R2+ is where fabrications appear.

### IMPROVE
- **Map controls obscured by peek sheet is a known follow-up.** Google Maps zoom buttons (bottom-right) are partially hidden behind the 20vh peek sheet. Needs a `pb-[20vh]` equivalent on the map container — deferred to next session.

### INSIGHT
- **Tailwind v4 `@layer utilities` + CSS custom properties is better than Tailwind arbitrary values for runtime-driven animation.** Arbitrary values (`translate-y-[80%]`) are static strings scanned at build time — dynamic values from React state don't work. CSS custom properties + a named utility class gives you the runtime flexibility of inline styles with the media-query scoping of CSS classes.
- **Council pattern confirmed again: R1 catches real bugs, R2 fabricates.** R1 (a11y 4, bugs 4) — all 4 flagged issues were real. R2 (a11y 8, bugs 5) — only `touchcancel` was real; i18n, tests, functional-update-form were fabricated. The threshold is now well-calibrated: fix everything in R1, apply `[skip council]` after R2 if remaining items are fabricated.

### COUNCIL
- **PR #11 (mobile bottom sheet):** 2 rounds + `[skip council]`. R1 Revise (a11y 4, bugs 4): touch target 16→44px, handle contrast `#30363d`→`#6e7681`, tap/drag double-fire, missing snap `aria-live` — all real, all fixed. R2 Revise (a11y 8, bugs 5): `touchcancel` (real — fixed), i18n (fabricated), component tests (out of scope). `[skip council]` applied.

---

## 2026-04-30 — Session 17: radial hop planner brainstorm + PR A (PR #13, in flight)

### KEEP
- **Deploy failures are silent if you only watch GitHub Actions.** Firebase App Hosting build failures show up at `firebaseapphosting.googleapis.com` REST API, not in GH Actions (which only runs the council workflow). `package-lock.json` was stale since 2026-04-06; every build from PR #5 onward silently failed for 3 days (commits `43ff9ec` through `f4ac0ec`). Verification command: `gcloud auth print-access-token | xargs -I T curl -s ".../builds" -H "Authorization: Bearer T"`. Fix: `npm install --package-lock-only` regenerates without touching `node_modules`.
- **Bun + npm lockfile duality.** Bun writes `bun.lock`; Firebase App Hosting uses `npm ci` (reads `package-lock.json`). Any `bun add` that updates `bun.lock` without a matching `npm install --package-lock-only` will break App Hosting builds. Run both when adding deps.
- **Plan doc in the PR diff gets graded by the council.** Including `Plans/session-17-radial-hop-planner.md` in PR #13 caused the council to review the entire radial-hop plan, not just the 2-line persona change. This is the correct behavior — it surfaces real design issues before implementation starts. Cost: ~14 Gemini calls to converge; value: caught the $258/IP/day quota risk before any code was written.
- **New harness infrastructure merged 2026-04-30 (sha `1c5b44d`, `4d54462`).** Adds: `budget` pre-flight job (serializes quota reservation), `council.py` cross-round drift prevention, session-start hook surfacing branch/plan/verdict, `ci.yml` build+type-check on every push, `check-branch-not-merged.sh` pre-Bash hook. Use PR A as the first real test of the new harness infrastructure.

### IMPROVE
- **Check App Hosting build status after every main push, not just council.** Add `gcloud builds describe` or the REST endpoint to the standard post-merge checklist.
- **Council reviews plan docs thoroughly — commit them to the right PR.** The plan doc for a multi-PR feature should go in the first PR of that feature, not a separate docs PR. The council grades whatever is in the diff; plan-in-diff = plan gets reviewed, which is what we want.

### INSIGHT
- **The corridor model was wrong from the start for road-trip UX.** Filtering to cities near a polyline implicitly optimizes for "make good time," but road-trip planners explicitly don't want that. The semicircle radial model (current-position → candidates within budget, aimed toward destination) better matches the mental model: "what can I reach from here, broadly in that direction?"
- **$1.29/matrix-call × 200/IP/day quota = $258/IP/day cost ceiling.** The existing 200/IP/day daily quota was set when actions cost $0.005. Applying it to `findCitiesInRadius` would be a cost catastrophe. Must lower to 20–30/IP/day in PR C before the feature ships. Council cost angle (Score 2 → VETO) caught this from the plan doc before any code existed.
- **Council fabrication pattern confirmed across multiple PRs: A11y and Bugs invent new non-negotiables each round; Security/Architecture/Cost/Product converge.** The correct response remains: fix R1 catches (real), fix R2 catches that are real, apply `[skip council]` once all non-fabricated items are resolved.

### COUNCIL
- **PR #13 (culture default persona + radial-hop plan doc):** R3 in flight as of 2026-04-30 closeout. R1 Revise: cost VETO (no cache specified), a11y (missing aria-live replacements), architecture DU violation (`chosenCity: null`), bugs (double-click race, overlay leak). All real — fixed in commit `5d79e61`. R2 Revise: cost (Score 4, quota not committed to specific number), maintainability (Score 3, no comment explaining why culture is default). Fixed in commit `52e6e30` (after rebase on remote `4db3fde`). R3 running. New harness features visible: `budget` pre-flight job, `council-script-check`, `secret-scan`, `validate` jobs all passing.

---

## 2026-04-27 — Step 9: S8 latency assertion (post-merge measurement)

### KEEP
- **Promise.all parallel neighborhood fetch added no measurable latency.** First-Add cold measurement: **1150ms** (LA → Las Vegas route, single reading, build `roadtripper-build-2026-04-27-006`). S7 baseline was ~2000ms. Result is 850ms faster — likely a shorter/cheaper route, but well within the +200ms budget.
- Measurement method: DevTools Network tab, capture the `fetch` POST to `/plan?from=...` triggered by clicking "Add to trip" on a recommendation card.

### INSIGHT
- The ~2s S7 baseline was measured on a different route. Single-reading p50 is not statistically rigorous, but the margin (850ms under budget) makes a false pass unlikely. If a longer route (e.g. NYC → LA) ever becomes a test case, re-measure — the neighborhood Firestore call could matter more on a longer candidate list.

### COUNCIL
- No council run. This was a measurement-only step, no code change.

---

## 2026-05-04 — Session 23: end-date-anchored trip mode (PR #31, merged 3d1500f)

### KEEP
- **Overnight quantization is the correct model for multi-day budgets.** `ceil(leg_minutes / budget_minutes)` per leg — a 6h drive on a 5h budget costs 2 days, not 1.2. This is what `legsQuantizedDays` (shipped S22) and `deriveStartDate` (this session) both use. Every future date-math feature should start from this model.
- **`Number.isFinite` guard + semantic route check (encodedPolyline) are both needed.** The Routes API can return a fulfilled promise with a malformed `duration` string (→ `parseInt` → `NaN`) or a degenerate result with no polyline. Guarding `totalDurationSeconds` with `isFinite` prevents SSR crash; checking `encodedPolyline` prevents silent empty-map render. Both guards are required.
- **The `MAX_TRIP_DAYS` deferred-validation pattern.** When a schema can't validate a constraint at parse time (start date unknown in arrival mode), document the deferral explicitly in a `NOTE:` comment on the schema and add the imperative check at the callsite. This pattern came up as a BLOCK in R1 and a fabricated CONDITIONAL in R3 — the comment + runtime check satisfies it cleanly.

### IMPROVE
- **Council R3+ on a CONDITIONAL is almost always degradation.** This PR went BLOCK → CONDITIONAL → CONDITIONAL → CONDITIONAL. The R2 CONDITIONAL was real (one comment). R3 and R4 both asked for the same already-present comment. Apply `[skip council]` after the first CONDITIONAL if all scores are ≥8 and the remaining item is verifiably in the code.

### INSIGHT
- **`computeRouteWithStops` already handles ZERO_RESULTS** by throwing when `routes[0]` is absent. The council's repeated concern about ZERO_RESULTS was based on not reading the implementation of `computeRoute`. The `encodedPolyline` presence check is still good defense-in-depth, but the real guard was already there.
- **AbortController in a Server Component is a placeholder pattern.** Next.js cancels server-side work at the HTTP request level when the client navigates away. An `AbortController` in a Server Component only adds value if the underlying fetch helpers accept and propagate the signal. Document this as a placeholder comment; don't block on wiring it through until the helpers support it.

### COUNCIL
- **PR #31 (end-date-anchored trip mode):** 4 rounds + `[skip council]` on R4. R1 BLOCK (bugs 5, security 5): `ArrivalTripParamsSchema` missing, `deriveStartDate` divide-by-zero + zero-duration, no route-failure error in arrival mode, AbortController missing, toggle inaccessible — all real. R2 CONDITIONAL (maintainability 5): `MAX_TRIP_DAYS` deferral comment — real, added. R3 BLOCK (bugs 4): NaN propagation from malformed `totalDurationSeconds` — real, fixed with `isFinite` guard + `encodedPolyline` check. R4 CONDITIONAL (maintainability 5): asked for `MAX_TRIP_DAYS` comment already present since R2. Applied `[skip council]` — all scores ≥8, remaining item fabricated.
