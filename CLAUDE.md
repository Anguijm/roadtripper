# Roadtripper — Claude instructions

## Start here

Read in this order when resuming:
1. `SESSION_HANDOFF.md` — current branch, last PR, next 1–2 actions
2. `BACKLOG.md` — Now / Next / Someday tracker
3. `.harness/learnings.md` — KEEP/IMPROVE/INSIGHT/COUNCIL log

## Commands

```bash
bun run dev          # local dev server
bun run type-check   # tsc --noEmit — run before every commit
bun run lint         # ESLint
bun run build        # production build
bun run test         # vitest run (53 unit tests, isomorphic layer)
bun run test:watch   # vitest watch mode
```

## Merging — what gates a PR, and what the council is now

**ALL changes go through a PR — no exceptions, no direct pushes to main.**
GitHub branch protection enforces this at the API level; the pre-push hook
blocks it locally.

**The council is advisory, not a gate** (operator, 2026-10-04). It still runs
in CI on every push (`.github/workflows/council.yml`) and posts one
re-edited comment. Read it, apply what is real, decline the rest in a line
on the PR with the evidence, and **never wait for a CLEAR to merge.**

Why it changed, from round 2 of the interface build (`gauntlet/round-2-report.md`):
it caught real bugs nothing else would — a fix of mine that silently broke the
towns' refresh, and a comment describing code that was never written — but it
was wrong almost as often as right (one round had five of nine items that did
not hold up), it contradicted itself round over round on the same lines, a
CLEAR flipped back to CONDITIONAL on a test-only commit, and by the time it saw
anything the diff was big enough that every round was expensive.

**Read it closely, though not as a gate, for anything touching a server action,
a Zod schema that crosses the server boundary, the saved-trip schema, or the
roadside store.** That is where its real finds were.

**What gates a merge now:**

1. **Gate 1** — `.harness/hooks/pre-push`: lint, type-check, the tests, the
   lockfile, and `.harness/active_plan.md` naming the branch with `Cost:` and
   `Weakest part:` lines.
2. **A mutation proof before pushing**, not after someone doubts the test:
   put the old code back, watch the new test go red, restore from a copy and
   `cmp` it. Three tests in round 2 certified the wrong thing, and in each case
   the mutation proof was what settled it — run only after something else had
   raised the question.
3. **For a screen: the critic's approval** against `gauntlet/quality-bar.md`,
   judged blind from a 390 px screenshot by a fresh critic each round.
4. **For anything that calls a server action: a live run**, not only the
   tests. The stale-drive-times bug in #96 passed every test because the
   suite never calls a server action; one screenshot of a real state found it.

**Merge without asking** (operator, 2026-10-07: "stop asking me every time
you want to merge, just keep good documentation"). When 1–4 hold, merge.
The operator's look at the screenshots is no longer a per-merge gate: send
them with the PR as a record, not as a question. What carries the
accountability instead is the documentation — `.harness/active_plan.md`
with the ship rule, the mutation proofs and anything that went wrong; a
PR description that says what changed, why, and what is still weak; and
the round report.

**After merging, check production in a real browser, not with curl.**
App Hosting deploys main on its own, a few minutes after the merge. A
`curl` of the page sees only the server's first render, and much of the
sheet — the budget line, the warning box, anything that waits on the
recompute — only exists after the browser's JavaScript has run and the
recompute has answered. A curl check for U11's "Tight" box found none on
its first poll, seconds after the merge and before any new build could
have shipped: it could not have failed, because the box never appears in
the server render, old build or new. Drive the deployed page headless
(the runner's screenshot script reading `document.body.innerText`) and
make sure the check is one the *old* build would fail.

`[skip council]` in a PR title still skips the CI job, for docs and chores.

## Architecture invariants — do not violate

**Discriminated unions from the start.** When a return type has fields whose presence depends on an outcome, split into tagged arms immediately — never `field: T | null` for mutually-exclusive states. Example: `WaypointFetchResult = {status:"fresh", ...} | {status:"degraded", ..., failures}`. The TypeScript compiler is the only enforcement across the server-action boundary.

**PolylineRenderer — multi-effect split is load-bearing.** `src/components/RouteMap.tsx` has seven `useEffect` blocks and a `hasFitOnceRef`. Do not collapse them. Each split exists because a specific UX bug shipped when they were combined. The effects are: 1a (polyline geometry), 1b (polyline opacity in-place), 2a (endpoint markers), 2b (candidate bulk-cleanup on map change — declared before 2c), 2c (candidate diff — NO cleanup returned), 3 (trip-stop markers), 4 (highlight). Add a new effect rather than expanding an existing one.

**Force-dynamic + client state — never `router.replace`.** `/plan` is `export const dynamic = "force-dynamic"`. Routing state changes via `router.replace` or `router.push` re-invoke the Server Component and re-bill the Routes API. All UI state (persona, trip stops) lives in `useState` + `window.history.replaceState` only.

**Rate limit layers are all non-redundant.** `recomputeAndRefreshAction` has burst + spacing + daily quota guards. All three must stay. ONE call to the action = ONE charge across all three layers — do not add per-service charges inside the action.

**Server-only boundary.** `src/lib/firebaseAdmin.ts`, `src/lib/routing/recommend.ts`, `src/lib/routing/cache.ts`, and `src/lib/urban-explorer/cities.ts` all import `server-only`. No client component may import them directly or through a barrel. `scoring.ts` is intentionally isomorphic — keep it free of server-only imports.

**`dangerouslySetInnerHTML` is banned in `NeighborhoodPanel.tsx`.** Gemini-enriched `name.en` / `summary.en` are untrusted. Render as React children only. CI grep (`dangerouslySetInnerHTML=`) enforces this on every PR.

## Key file map

```
src/
  app/
    page.tsx                  — landing / route input
    plan/
      page.tsx                — force-dynamic plan page (server)
      actions.ts              — recomputeAndRefreshAction (server action)
  components/
    PlanWorkspace.tsx         — client root for /plan
    RouteMap.tsx              — map + PolylineRenderer (7-effect split: 1a/1b/2a/2b/2c/3/4)
    RecommendationList.tsx    — persona-ranked stop cards
    Itinerary.tsx             — ordered trip stop list
    NeighborhoodPanel.tsx     — per-stop neighborhood drill-down
    MoodChips.tsx             — the mood chips, one component for every screen (U5)
    TodayMoodChips.tsx        — the today results' wiring for them (the URL)
  lib/
    firebaseAdmin.ts          — server-only Firestore client
    urban-explorer/
      cityAtlas.ts            — canonical Zod schemas + localizedText()
      firestore.ts            — server-only typed read helpers (getCity, listCities, listNeighborhoods, listWaypoints)
      cities.ts               — server-only getAllCities() + lookupCity() with 24h LRU cache
      types.ts                — barrel re-export of cityAtlas
    routing/
      recommend.ts            — fetchWaypointsForCandidates + fetchNeighborhoods
      scoring.ts              — isomorphic scoring + WaypointFetchResult type
      cache.ts                — LRU cache + candidateCacheKey + waypointsCacheKey + neighborhoodsCacheKey (all SHA-256)
      candidates.ts           — findCandidateCities (Routes API matrix)
      directions.ts           — computeRoute / computeRouteWithStops
      rate-limit.ts           — burst / spacing / daily quota
    personas/                 — persona configs + types
.harness/
  scripts/council.py          — council runner (6 angles + resolver)
  council/                    — persona markdown files
  learnings.md                — session KEEP/IMPROVE/INSIGHT/COUNCIL log
  memory/decisions/           — per-session council review artifacts
Plans/                        — tracked plan files (required for council)
```

## New CI workflows (added 2026-04-30, harness update)

- `.github/workflows/ci.yml` — build + type-check on every push
- `.github/workflows/council.yml` — council review on every PR (split into `budget` pre-flight + `council` jobs)
- `.github/workflows/branch-guard.yml` — prevents pushing to main directly
- `.github/workflows/drift-check.yml` — flags schema drift

Session-start hook (`.claude/hooks/session-start.sh`) surfaces branch, last commit, active plan, and last council verdict at the start of every Claude Code session.

## Hooks

`.harness/hooks/` is the live hook directory (`core.hooksPath`), installed by
`.harness/scripts/install_hooks.sh`, which `npm install` runs via `prepare`.
Anything placed in `.git/hooks/` is ignored.

- `pre-push` — Gate 1: blocks pushes to main, runs lint/type-check/tests, and
  requires `.harness/active_plan.md` to name the branch and carry `Cost:` and
  `Weakest part:` lines. `SKIP_GATE1=1` bypasses it loudly.
- `post-commit` — writes `.harness/session_state.json` and
  `.harness/yolo_log.jsonl`. Both are gitignored; they used to be tracked, which
  left the tree dirty after every commit and broke `git checkout` and
  `gh pr merge`.

## Slicing strategy

Slice by coherent complete scope, not by feature fraction:
- Pure schema / type additions → one PR
- Pure server helpers → one PR  
- UI + wiring → one PR

Each slice should be completable and reviewable on its own. The council grades what's in front of it — if a slice is "half a feature," reviewers will hallucinate the missing half and grade against it.
