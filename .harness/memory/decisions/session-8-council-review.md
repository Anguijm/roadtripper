# Session 8 Pre-EXECUTE Council Review

**Date:** 2026-04-26
**Workflow:** Hard pre-EXECUTE gate (Session 4.5 doctrine). **Full 4-role council per harness.yml: 3 parallel reviewers + Lead Architect resolver.** First council on record running the resolver step (S4–S7 reviews appear to have skipped it).
**Plan reviewed:** Neighborhood drill-down for a selected stop. Resolver-produced PLAN.md saved at `Plans/session-8-neighborhood-drilldown.md`.

**SUPERSEDED 2026-04-26 17:00 UTC:** This review was produced by the legacy hand-spawned-Agent council (3 reviewers + 1 resolver, all Claude-Agent-via-conversation). After user feedback that this approach was non-reproducible and Claude-only-blind-spotted, the protocol was replaced by the v2 tool-based council ported from LLMwiki-StudyGuide: 6 angles + lead-architect resolver, Gemini-backed, run via `python3 .harness/scripts/council.py --plan <file>`. **The S8 BUILD is paused until the v2 council re-reviews this plan with all 6 angles** (currently 3 of those angles — bugs, cost, accessibility — were not represented). Do NOT execute S8 against the implementation steps below until the v2 council has Proceeded.

## Verdicts

| Expert       | Verdict     | Score      |
|--------------|-------------|------------|
| Security     | CONDITIONAL | 7/10       |
| Architecture | CONDITIONAL | 6.5/10 (C+) |
| Product      | CONDITIONAL | 6/10       |
| **Resolver (Lead Architect)** | **WARN** | **6.5/10 avg** |

**Resolver outcome:** WARN — approved to proceed with all 12 blockers folded into Implementation Steps as required, not deferred. No security FAIL. The AI writing code does NOT self-approve; resolver gates EXECUTE.

12 blocker findings collectively. Strong convergence:
- **Cache-key ambiguity** flagged by both Security (SEC-1) and Architecture (ARCH-1).
- **Silent-degraded recurrence** flagged by Product (PROD-3) and addressed structurally by Architecture (ARCH-2/ARCH-3 — discriminated unions).
- **Las-vegas duplicate-neighborhood "ship as-is" decision overruled by Product (PROD-1)** — the plan's punt is a credibility hit on the most-tested city; client-side dedupe is required.

## Blocker Findings

### Security (3)
- **SEC-1 (cache key collision):** Cache key must be a structured tuple, not string-concat. Hash `{kind:"vibe+nb", wp:sortedCityIds, nb:selectedCityId}` — separate namespaces; assert max-entries cap unchanged from S7.
- **SEC-2 (XSS via Gemini-enriched copy):** `name.en` and `summary.en` come from a non-Roadtripper-owned enrichment pipeline. Render as plain text children only. Code-comment forbidding `dangerouslySetInnerHTML` for these fields; CI grep to fail if it ever appears in `NeighborhoodPanel`.
- **SEC-3 (fan-out cap):** Single quota charge ≠ free server fan-out. Cap neighborhood fetches per action at `MAX_NEIGHBORHOOD_CITIES = 1` (only the *selected* stop's city). Make the cap explicit in code with a guard that logs+drops extras.

### Architecture (5)
- **ARCH-1 (cache namespace split):** Plan contradicts itself ("reuse key" + "new key"). Resolve: split into two namespaces — `waypointsCacheKey(uniqueCityIds)` unchanged, new `neighborhoodsCacheKey(cityId)` holding `NeighborhoodLite[]`. Compose at call site. Do not co-mingle TTLs or LRU slots.
- **ARCH-2 (discriminated union for fetch result):** Per `feedback_discriminated_unions_from_start.md` — encode invariants in two-arm DUs from the start. Rewrite `WaypointFetchResult` as `{ status: 'fresh', cities, waypoints, neighborhoods } | { status: 'degraded', cities, waypoints, neighborhoods, failures: Array<{kind:'waypoints'|'neighborhoods', cityId?:string, reason:string}> }`. The `failures` array IS the inline-status surface required by S7 ARCH-2 carry-forward.
- **ARCH-3 (three-state per-city neighborhood load):** "Not requested" vs "zero neighborhoods" vs "fetch failed" must be three distinct states; a flat `[]` collapses them. Either per-stop discriminated union `{kind:'not_requested'|'empty'|'loaded'|'failed', ...}` or `Record<cityId, NeighborhoodLoadState>` keyed by id where absence ≡ not requested.
- **ARCH-4 (group client-side):** Server-side grouping breaks the existing flat `waypoints` consumer (route map, candidate filter). Keep wire format flat; `neighborhood_id` already added to projection; group with `useMemo(() => groupBy(waypoints, 'neighborhood_id'), [waypoints])` in the panel only.
- **ARCH-5 (projection symmetry):** Define `NeighborhoodLite = Pick<Neighborhood, 'id'|'name'|'summary'|'trending_score'>`; project `.select('name.en', 'summary.en', 'trending_score')`. Match the waypoint projection style. Validate post-projection with `NeighborhoodLiteSchema`.

### Product (4)
- **PROD-1 (las-vegas dupes — overrules plan):** Client-side dedupe required, NOT defer-to-upstream. Normalize name (lowercase, strip city prefix, collapse "the-"); on collision keep higher `trending_score` or shorter id as tiebreak; `console.warn` so the data-quality issue stays visible. ~15 lines. The credibility cost of shipping dupes on the demo city is greater than the engineering cost of hiding them.
- **PROD-2 (empty-state copy):** "No neighborhoods cataloged yet" promises a roadmap deliverable we haven't committed to. Reframe as feature ("Showing all stops in {city}.") or omit the panel entirely when zero neighborhoods exist. Don't draw attention to absence.
- **PROD-3 (silent-degraded recurrence):** S7 council flagged hiding partial failures erases trust. If `listNeighborhoods` fails but waypoints succeed, plan-as-written shows an empty panel indistinguishable from "no data exists." Render: "Couldn't load neighborhoods — showing stops directly." Distinct from empty state. Tie to ARCH-2's `failures` array.
- **PROD-4 (latency budget):** S7 PROD-3 flagged ~2s First-Add already. Plan adds another round-trip to the same path. Mandatory: fetch neighborhoods in parallel with waypoints via `Promise.all`. Latency assertion in plan: cold First-Add p50 stays within S7 baseline + 200ms. If it doesn't, lazy-fetch on panel expand instead of server-render.

## Non-Blocker Observations (adopted)

### Security
- `neighborhood_id` added to `vibe_waypoints` projection is fine; confirm `NeighborhoodSchema` requires `id` matches `^[a-z0-9-]+$` so React keys can never carry HTML.
- Use neighborhood id as Map key with last-write-wins semantics so future UE backfill dupes can't break render.
- Drop-on-parse-fail logs must include `cityId` + `neighborhoodId` for data-drift signal outside las-vegas.
- Server-render piggybacking is the right call security-wise — no new client-initiated fetch endpoint = no new auth surface.
- `server-only` import already on `firestore.ts`; verify no client-component barrel re-exports `urbanExplorerDb` indirectly.

### Architecture
- Localization helper now: single `localizedText(loc, 'en')` function so eventual i18n is one-file. Don't inline `n.name.en`.
- Server Action union must serialize cleanly: plain objects, no `Error` instances, no `Date` (ISO strings).
- Map work correctly out of scope; PolylineRenderer 4-effect split untouched.
- Neighborhood `trending_score` separate TTL from waypoints — flag for S9 refresh-button work, not a blocker.
- Watch `fetchWaypointsForCandidates` size; if >80 lines after this, split into `fetchWaypoints` + `fetchNeighborhoods` + thin orchestrator.

### Product
- Information hierarchy threshold: only render grouping when ≥1 neighborhood has 3+ waypoints; below that, flat list with neighborhood tag/chip per item.
- Map silence on hover: subtle row highlight so the lack of map response feels intentional, not broken. Centroid pin out of scope.
- Persona swap mid-fetch: confirm in-flight cancellation does NOT cancel neighborhood fetch (persona-independent); only ranking re-runs.
- Don't expose raw `trending_score`. Bucket to High/Med or use as sort-only hidden field.
- `neighborhood_id` projection addition: cheap, correct, future-proofs.

## Process Notes

- Three reviewers in parallel, ~37s total.
- All three CONDITIONAL with mid-band scores (6–7) — ties for the lowest single score with S7. Reflects that this plan was higher-level than S6/S7 plans and under-specified at type and partial-failure boundaries.
- 12 blockers, all addressable in-plan without re-scoping.
- Council overruled my "ship las-vegas dupes as-is" call (PROD-1). Filing the upstream data-quality issue still appropriate, but it's not the user-facing fix.
- Strong continuity from S6/S7 patterns: silent-failure trust loss, discriminated unions over booleans, latency budgets on user-perceived hot paths.
