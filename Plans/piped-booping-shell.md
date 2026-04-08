# Session 7 — Recommendation Refresh After Stop Add

## Context

Session 6 closed the MVP loop but left a visible scar: the Council PROD-1 banner ("Showing stops along your original route. Replan to refresh.") sits on every multi-stop trip because the recommendation panel still reflects the *original* corridor, not the post-detour route. Session 7 makes the refresh real and removes the banner.

The architectural rules from Sessions 5/6 still apply:
- No `router.replace` / search-param navigation
- Persona swaps remain client-only with zero Firestore reads
- Trip stops are the source of truth for the trip — refreshed candidates that no longer contain an added city DO NOT remove that city from `tripStops`
- Removing the last stop reverts both `liveRoute` AND the new `liveWaypointFetch` to `null`

## Approach

Replace `recomputeRouteAction` with `recomputeAndRefreshAction(origin, destination, stops, budgetHours)` returning `{route, waypointFetch}`. One Server Action call per Add → one rate-limit charge → atomic update on the client. Internally serial: route first, then candidates from the new polyline, then waypoints. Partial degradation if the candidates pipeline fails (route still updates).

Client adds `liveWaypointFetch: WaypointFetchResult | null` slice mirroring the `liveRoute` null-fallback pattern from S6.

## Phase A — `recomputeAndRefreshAction`

**Edit:** `src/app/plan/actions.ts`

- Same gate stack as S6: burst → spacing → shape/range validation → daily quota
- After gates pass:
  1. `await computeRouteWithStops(origin, destination, cleanStops)` → `route`
  2. Inside a try/catch:
     - `findCandidateCities(route.encodedPolyline, { maxDetourMinutes: detourCapForBudget(budgetHours) })`
     - `fetchWaypointsForCandidates(validatedCandidates)`
  3. On candidates failure: return `{ok:true, route, waypointFetch: {cities:[], waypoints:[], degraded:true}}` — route still ships
- New return type:
  ```ts
  type RecomputeAndRefreshResult =
    | { ok: true; route: DirectionsResult; waypointFetch: WaypointFetchResult }
    | { ok: false; error: RecomputeErrorCode; retryAfterSeconds?: number };
  ```
- Add `budgetHours` parameter; validate it (must match the existing `validateBudget` semantics — int 1..24)
- Remove the old `recomputeRouteAction` export (nothing else imports it)

**Reuse (no edits):**
- `computeRouteWithStops` (Session 6)
- `findCandidateCities` (`src/lib/routing/candidates.ts`)
- `fetchWaypointsForCandidates` (`src/lib/routing/recommend.ts`)
- `detourCapForBudget` (`src/lib/routing/validation.ts`)
- All rate-limit functions (Session 6)

## Phase B — `liveWaypointFetch` slice

**Edit:** `src/components/PlanWorkspace.tsx`

```ts
const [liveRoute, setLiveRoute] = useState<DirectionsResult | null>(null);
// NEW:
const [liveWaypointFetch, setLiveWaypointFetch] = useState<WaypointFetchResult | null>(null);

// derived:
const effectiveWaypointFetch = liveWaypointFetch ?? props.waypointFetch;
```

The recompute effect updates BOTH slices on success. Empty-stops branch resets BOTH to `null`. Failure path leaves BOTH untouched. The `requestIdRef` guard already protects both writes.

## Phase C — Wire `effectiveWaypointFetch`

**Edit:** `src/components/PlanWorkspace.tsx`

- `RecommendationList` reads from `effectiveWaypointFetch` instead of `props.waypointFetch`
- `cityCoords` builds from `effectiveWaypointFetch.cities` (so newly-discovered cities are addable)
- `RouteMap`'s `candidates` prop derives from `effectiveWaypointFetch.cities` → derived `candidateMarkers` (replaces the pre-computed prop for the live state)
- Initial render still uses the server-rendered prop until the first refresh lands

**Note on candidateMarkers:** Today PlanWorkspace receives a pre-computed `candidateMarkers: CandidateMarker[]` prop from `/plan/page.tsx`. After Session 7, that prop is the *initial* set. We derive a `liveCandidateMarkers` from `effectiveWaypointFetch.cities` (each `CityContext` has lat/lng implicitly via the candidate pipeline — verify). If `CityContext` doesn't carry lat/lng, we fall back to looking up the city in `getAllCities()` client-side via a small lookup table OR server-side as part of the action's response. **Decision:** check `CityContext` shape during BUILD; if it lacks lat/lng, extend the action to include them in the response.

## Phase D — Remove the stale-recs banner

**Edit:** `src/components/PlanWorkspace.tsx`

Delete this block:
```jsx
{showItinerary && (
  <div className="px-3 py-2 border border-[#d29922] bg-[#161b22]">
    <p className="text-xs text-[#d29922] leading-snug">
      Showing stops along your original route. Replan to refresh.
    </p>
  </div>
)}
```

## Phase E — Off-corridor added stops survive refresh

`tripStops` is its own state, completely independent of `effectiveWaypointFetch`. The refresh never touches `tripStops`. ISC-A5 enforces this. Itinerary continues to render off-corridor stops with their numbers and Remove buttons. If we want to be polite, we mark off-corridor stops in the Itinerary with a subtle indicator — defer to S8.

## Phase F — Pending UX upgrade

**Edit:** `src/components/PlanWorkspace.tsx`

S6's pending indicators (totals spinner + dimmed polyline + disabled buttons) remain. Add a new prominent caption inside the aside header:

```jsx
{isPending && (
  <p className="text-[11px] font-mono uppercase tracking-widest text-[#d29922] animate-pulse">
    Updating route + recommendations…
  </p>
)}
```

## Phase G — Hygiene

`bun run lint` · `bun run type-check` · `bun run build` — green. Run `/simplify` on the diff.

## Phase H — Council pre-EXECUTE gate (mandatory)

3 parallel `general-purpose` agents (Security / Architecture / Product) review this plan. Capture verdicts in `.harness/memory/decisions/session-7-council-review.md`. Address any blockers before EXECUTE.

## Critical Files

| File | Change |
|---|---|
| `src/app/plan/actions.ts` | Replace `recomputeRouteAction` with `recomputeAndRefreshAction` |
| `src/components/PlanWorkspace.tsx` | New `liveWaypointFetch` slice, wire `effectiveWaypointFetch`, remove banner, prominent pending caption, action call site |
| `src/components/RecommendationList.tsx` | (likely no edit — already accepts `fetchResult`) |
| `src/components/RouteMap.tsx` | (likely no edit — already accepts `candidates` prop reactively) |

Possibly:
- `src/app/plan/page.tsx` — only if we need to thread a city lat/lng lookup through props
- `src/lib/routing/scoring.ts` — only if `CityContext` needs lat/lng added (check during BUILD)

## Verification

1. `bun run dev`, navigate to NYC → DC plan
2. Confirm initial recommendations load (Philly, Baltimore, etc.)
3. Click "Add city to trip" on Baltimore → polyline reshapes, recommendations re-fetch and reorder, banner is gone, totals update
4. Click "Add city to trip" on Philly → polyline reshapes again, recommendations refresh again
5. Remove Baltimore → polyline + recommendations both update; Philly stays added
6. Remove the last stop → both polyline AND recommendations revert to the initial server-rendered set
7. Switch persona mid-trip → polyline color changes, list re-orders, NO Firestore reads, NO Routes API calls (S5 invariant preserved)
8. `bun run lint && bun run type-check && bun run build` — green
9. Council review file exists; all blockers addressed

## Out of Scope (Session 8+)

- Marker diff (avoid full marker rebuild on every refresh) — performance polish
- Off-corridor indicator badge in the Itinerary
- "Optimize stop order" toggle (Routes API `optimizeWaypointOrder`)
- Multi-day itinerary view, save/load trips, mobile bottom sheet
