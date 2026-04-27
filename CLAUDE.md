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
bun run test         # vitest run (41 unit tests, isomorphic layer)
bun run test:watch   # vitest watch mode
```

## Council — mandatory pre-EXECUTE gate

Standard flow — **always use CI diff review, not the local runner**:

```bash
# 1. Save plan to Plans/session-N-<slug>.md and commit it
git add Plans/... && git commit -m "docs: session N plan [skip council]"

# 2. Create feature branch, implement, open PR
gh pr create ...

# 3. CI runs the council automatically on push (council.yml).
#    Check the <!-- council-report --> comment on the PR.
#    Proceed → merge. Revise → fix, push, wait for next run.
```

`GEMINI_API_KEY` lives in GitHub Actions secrets. Never ask to set it locally — always use the CI path above.

The CI workflow (`.github/workflows/council.yml`) re-runs automatically on every PR push and posts a single re-edited comment. Add `[skip council]` to the PR title to skip on trivial/docs-only pushes.

**The AI writing code cannot self-approve.** Proceed from the council runner is the gate, not a judgment call in conversation.

## Architecture invariants — do not violate

**Discriminated unions from the start.** When a return type has fields whose presence depends on an outcome, split into tagged arms immediately — never `field: T | null` for mutually-exclusive states. Example: `WaypointFetchResult = {status:"fresh", ...} | {status:"degraded", ..., failures}`. The TypeScript compiler is the only enforcement across the server-action boundary.

**PolylineRenderer — 4-effect split is load-bearing.** `src/components/RouteMap.tsx` intentionally has four `useEffect` blocks and a `hasFitOnceRef`. Do not collapse them. Each split exists because a specific UX bug shipped when they were combined (camera refit on every add, lost click-highlight state, opacity flicker). Add a new effect rather than expanding an existing one.

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
    RouteMap.tsx              — map + PolylineRenderer (4-effect split!)
    RecommendationList.tsx    — persona-ranked stop cards
    Itinerary.tsx             — ordered trip stop list
    NeighborhoodPanel.tsx     — per-stop neighborhood drill-down
    PersonaSelector.tsx
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

## Known gotcha — post-commit hook

The post-commit hook writes `.harness/session_state.json` and `.harness/yolo_log.jsonl` after every commit, leaving the working tree dirty. This causes `gh pr merge` to abort. Workaround:

```bash
git stash && gh pr merge <N> --squash && git stash drop
```

## Slicing strategy

Slice by coherent complete scope, not by feature fraction:
- Pure schema / type additions → one PR
- Pure server helpers → one PR  
- UI + wiring → one PR

Each slice should be completable and reviewable on its own. The council grades what's in front of it — if a slice is "half a feature," reviewers will hallucinate the missing half and grade against it.
