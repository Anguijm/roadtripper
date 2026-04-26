# PLAN.md — Neighborhood Drill-Down for Selected Stop

**Session:** 8
**Date:** 2026-04-26
**Council:** session-8-council-review.md (3 reviewers + resolver)

## Verdict
**WARN** — Plan is approved to proceed with mandatory blockers below resolved before EXECUTE. No security FAIL, but Sec/Arch/Prod each raised conditional issues that must land in code, not "follow-up." Aggregated council: 6.5/10 average — ship-but-tighten.

## Summary
When a user selects a stop on `/plan`, the detail panel renders that city's neighborhoods (name, optional summary, trending_score) and groups the existing waypoint list under each parent neighborhood. Server fetches neighborhoods alongside waypoints in the same Server Action; client groups locally. No map work, no waypoint detail expansion, no live `cities` migration. Goal: give the demo city (las-vegas) visible structure beyond a flat stop list.

## Architecture Decisions

- **Two cache namespaces, not one** (resolves ARCH-1 + SEC-1 conflict). `waypointsCacheKey(sortedUniqueCityIds)` keeps current value/type unchanged. New `neighborhoodsCacheKey(cityId)` holds `NeighborhoodLite[]`. Compose at call site. Each key derived via structured-hash (`JSON.stringify` of `{kind, ...}` after sort) — no string concat. Existing S7 max-entries cap unchanged; both namespaces share one LRU but are non-collidable by design.
- **Discriminated union for fetch result** (ARCH-2, mandatory per `feedback_discriminated_unions_from_start.md`). `type WaypointFetchResult = { status: 'fresh', cities, waypoints, neighborhoods } | { status: 'degraded', cities, waypoints, neighborhoods, failures: Array<{kind:'waypoints'|'neighborhoods', cityId?:string, reason:string}> }`. The `failures` array IS the inline-status surface S7 ARCH-2 demanded — Product reuses it for PROD-3 copy.
- **Per-city neighborhood load state** (ARCH-3). `Record<cityId, {kind:'empty'|'loaded'|'failed'}>`. "Not requested" is implicit (key absent) since SEC-3 caps fetches to one city. This collapses ARCH-3's four states to three real ones, which is correct given SEC-3.
- **Client-side grouping only** (ARCH-4). Wire format stays flat `waypoints[]`. `useMemo` groups by `neighborhood_id` in `<NeighborhoodPanel>`. Original plan's server-side group is rejected.
- **`NeighborhoodLite` projection** (ARCH-5). `Pick<Neighborhood, 'id'|'name'|'summary'|'trending_score'>`, `.select('name.en','summary.en','trending_score')`, post-projection validated by `NeighborhoodLiteSchema`. Drop-on-parse-fail with `cityId`+`neighborhoodId` in log.
- **Promise.all parallelism** (PROD-4). Waypoints + neighborhoods fetch concurrently in `fetchWaypointsForCandidates`. p50 First-Add must stay ≤ S7 baseline + 200ms; gated on measurement, not vibe.
- **Client-side neighborhood dedupe** (PROD-1, OVERRIDES original plan). Las-vegas ships duplicates today; demo-first-impression risk overrides "punt to upstream." Normalize → strip city-id prefix → collapse leading `the-`. On collision: keep higher `trending_score`, tiebreak shorter id. `console.warn` so the data issue stays visible to ops.
- **Trending_score is internal**. Used for dedupe + sort only. Not rendered. (PROD non-blocker, adopted.)

**Convergence noted (extra confidence):** Sec, Arch, Prod all independently flagged the silent-degraded recurrence from S7. The DU `failures` array satisfies all three.

**Conflict resolved:** Arch said "reuse cache" + "new key" was contradictory; Sec said "structured hash, no concat." Both right — split namespaces (Arch's frame) AND structured-hash each key (Sec's frame). Adopted both.

## Implementation Steps

1. **Schema + types** — Add `NeighborhoodLiteSchema` and exported `NeighborhoodLite` type alongside the existing `NeighborhoodSchema` in `src/lib/urban-explorer/cityAtlas.ts`. Verify `id` regex `^[a-z0-9-]+$` is enforced.
2. **Cache split** — In `src/lib/routing/cache.ts`, add `neighborhoodsCacheKey(cityId)` returning structured-hashed key. Existing waypoint cache key already named appropriately. Both namespaces share one LRU; max-entries cap untouched.
3. **Fetch helper** — In `src/lib/routing/recommend.ts`, extract `fetchNeighborhoods(cityId)` (single call, SEC-3 cap of 1). Wraps `listNeighborhoods` + `NeighborhoodLiteSchema` validation + dedupe (PROD-1) + cache.
4. **Orchestrator refactor** — `fetchWaypointsForCandidates` becomes orchestrator: `Promise.all([fetchWaypoints(...), fetchNeighborhoods(selectedCityId)])`. Returns `WaypointFetchResult` DU. If file >80 lines, split per ARCH non-blocker.
5. **Projection update** — Add `neighborhood_id` to existing `vibe_waypoints` `.select(...)` projection.
6. **`<NeighborhoodPanel>` component** — New file at `src/components/NeighborhoodPanel.tsx`. Props: `{ neighborhoods: NeighborhoodLite[], waypoints, loadState, failures }`. Renders neighborhoods sorted by trending_score (score itself hidden). Empty state per PROD-2: render `"Showing all stops in {cityName}."` and skip the panel header. Failed state per PROD-3: render `"Couldn't load neighborhoods — showing stops directly."` derived from `failures` array. `useMemo` grouping. Code-comment ban on `dangerouslySetInnerHTML`.
7. **Wire through `plan/page.tsx`** — Pass DU result through; client component reads `failures`/`neighborhoods`. Plain objects + ISO strings only across the Server Action boundary.
8. **`localizedText(loc, 'en')` helper** — Create now (ARCH non-blocker, cheap, prevents repeat). Apply to `name.en`/`summary.en`.
9. **Latency assertion** — Manual measurement First-Add cold p50, recorded in session notes. If >S7+200ms, fall back to lazy-fetch on panel expand before merging.
10. **CI grep** — Add to existing lint or pre-commit: `dangerouslySetInnerHTML` in `NeighborhoodPanel.tsx` fails build.

## Security Requirements

- **SEC-1 (blocker):** Structured-hash cache keys. No string concat. Enforced by helper API — caller passes object, helper hashes.
- **SEC-2 (blocker):** All `name.en`/`summary.en` rendered as plain text. `dangerouslySetInnerHTML` banned in `NeighborhoodPanel`; CI grep enforces.
- **SEC-3 (blocker):** `MAX_NEIGHBORHOOD_CITIES = 1` constant. Only the selected stop's city. Extras logged + dropped.
- Neighborhood `id` regex validated (`^[a-z0-9-]+$`) — React-key safety. Last-write-wins on collision (post-dedupe this should not fire, but defense-in-depth).
- Drop-on-parse-fail logs include `cityId` + `neighborhoodId`.
- No client-component barrel re-exports `urbanExplorerDb`. Verify in PR review.

## Edge Cases

- **Las-vegas duplicate neighborhoods** — Dedupe handles. `console.warn` keeps data issue visible.
- **Zero neighborhoods for a city** — `loadState='empty'`. Panel renders "Showing all stops in {city}." (PROD-2). No "coming soon" copy.
- **Neighborhoods fetch fails, waypoints succeed** — `status:'degraded'`, `failures` populated. Copy: "Couldn't load neighborhoods — showing stops directly." (PROD-3).
- **Waypoint with `neighborhood_id` not in fetched neighborhoods list** — Group under "Other stops" bucket. Don't drop the waypoint.
- **Persona swap mid-fetch** — Don't cancel neighborhood fetch; persona-independent (Prod non-blocker).
- **Hover from map → row** — Subtle row highlight only (Prod non-blocker, defer styling polish).
- **Information hierarchy** — Only show grouped UI when ≥1 neighborhood has 3+ waypoints; otherwise flat list (Prod non-blocker, adopted as cheap UX win).

## Out of Scope (Future)

- Full waypoint detail expansion.
- Live `cities` collection migration.
- Map polygon rendering for neighborhoods.
- Locales beyond `.en`.
- Upstream Urban Explorer fix for las-vegas duplicate IDs (file issue; client dedupe is shim).
- Server-driven feature flag for grouping threshold.
- Persona-aware neighborhood ranking.

## Council Scores

| Expert | Verdict | Score | Key Concern |
|---|---|---|---|
| Security | CONDITIONAL | 7/10 | Cache key collision, XSS via Gemini copy, fan-out cap |
| Architecture | CONDITIONAL | 6.5/10 | Cache namespace contradiction, missing DU, server-side grouping |
| Product | CONDITIONAL | 6/10 | Las-vegas dupes, empty-state copy promise, silent-degraded recurrence |
| **Resolver** | **WARN** | **6.5/10** | **Approved with all 12 blockers above merged into Implementation Steps. No security FAIL.** |
