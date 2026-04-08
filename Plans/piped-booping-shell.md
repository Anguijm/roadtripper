# Session 6 — Stop Selection + Route Recalculation (MVP loop closer)

## Context

Roadtripper currently lets a user pick a start/end city, see a route on the map, and browse persona-ranked recommendations along that route — but every "Add to trip" button is disabled. This session makes the button real and closes the core MVP loop: **start → end → pick stops → see updated route**.

The architectural lesson from Session 5 must be respected: in this Next.js 16 App Router with `force-dynamic`, ANY navigation that mutates a search param re-runs the Server Component, which re-bills `computeRoute`. Stops therefore live in **client state**, and route recomputation goes through a **Server Action** that the client invokes — not through a URL-driven server re-render.

A separate Phase A first commits the uncommitted Session 5 work so Session 6's diff stays scoped.

## Phase A — Commit Session 5

One commit. All files currently uncommitted (modifications + new files + the council review note + session_state.json). Message references "Session 5: persona system" scope.

## Phase B/C — Server Action + `computeRouteWithStops`

**New file:** `src/app/plan/actions.ts`
- `"use server"`
- `recomputeRouteAction(origin, destination, stops)` returns a discriminated union `{ok:true,route} | {ok:false,error}` (never throws across the boundary)
- Reuses `validateRouteParams` from `src/lib/routing/validation.ts` for origin/destination
- Reuses `checkRateLimit` + `getClientIp` from `src/lib/routing/rate-limit.ts`
- Caps stops at 10
- Calls `computeRouteWithStops`

**Edit:** `src/lib/routing/directions.ts`
- Add `computeRouteWithStops(origin, destination, stops: {lat:number;lng:number}[])`
- Routes API request body adds `intermediates: [...]` ONLY when stops is non-empty (omit field for empty stops — Routes API rejects empty arrays)
- Does NOT pass `optimizeWaypointOrder` (preserve user-controlled order)
- Existing `computeRoute(origin, destination)` becomes a thin wrapper passing `[]`

**Move:** `formatDistance` and `formatDuration` are currently in `directions.ts` which is `"server-only"`. Extract into `src/lib/routing/format.ts` (no `"server-only"`) so the client `PlanWorkspace` can re-use them after recompute. Re-export from `directions.ts` for back-compat.

## Phase D — Trip state in `PlanWorkspace`

```ts
type TripStop = { id: string; cityId: string; cityName: string; lat: number; lng: number };
const [tripStops, setTripStops] = useState<TripStop[]>([]);
```

- `addStop(stop)` rejects duplicate cityId, rejects when length === 10
- `removeStop(cityId)` filters
- No reducer, no zustand — `useState` is sufficient

## Phase E — Add-to-trip in `RecommendationList`

**Edit:** `src/components/RecommendationList.tsx`
- New props: `addedCityIds: Set<string>`, `onAddCity(stop)`, `onRemoveCity(cityId)`
- Each city group header gets an "Add to trip" button (per-city granularity, not per-waypoint — adding a whole city is the right MVP unit because the route recomputes through the city centroid)
- Button switches to disabled "✓ Added" when in `addedCityIds`
- The candidate marker `lat`/`lng` flows from `PlanWorkspace` props (already loaded as `candidateMarkers`); we'll thread a `cityId → {lat,lng}` map from `PlanWorkspace` into the list so the button can build a complete `TripStop`

## Phase F — Server Action invocation + live polyline

**Edit:** `src/components/PlanWorkspace.tsx`
- New state: `livePolyline`, `liveBounds`, `liveDistanceMeters`, `liveDurationSeconds` (initial values come from props)
- `recomputeError` state for failures
- `useTransition()` for pending UI
- `useEffect(() => { ... }, [tripStops])` calls `recomputeRouteAction`
  - Skips when `tripStops.length === 0` AND we already have an initial polyline
  - Tracks an `inFlightRef` so rapid Adds don't overlap (latest wins, earlier results discarded)
- On success: update live state slices
- On failure: set `recomputeError`, leave previous polyline in place

## Phase G — RouteMap dynamic polyline + stop markers

**Edit:** `src/components/RouteMap.tsx`
- The `PolylineRenderer` `useEffect` already includes `encodedPolyline` in its dep list — confirmed it tears down the polyline + markers and rebuilds. Good.
- Add a `tripStops` prop and render numbered ▪ markers (square + label "1","2",...) visually distinct from the round candidate markers
- **Bounds change:** refit only on initial render (i.e., when polyline changes from undefined → set OR on explicit user action). Track via a `hasFitOnceRef` so subsequent recomputes redraw the line WITHOUT zoom/pan churn.

## Phase H — Itinerary component

**New file:** `src/components/Itinerary.tsx`
- Renders ordered list: **Start** → Stop 1 → Stop 2 → … → **End**
- Each stop has a "Remove" button wired to `removeStop`
- Empty state: "Add stops from the recommendations panel."
- Lives in `PlanWorkspace` below the recommendations list (same left aside)

## Phase I — Live totals

**Edit:** `src/components/PlanWorkspace.tsx`
- `totalDistanceText`, `totalDurationText`, `totalDays` recomputed from live state via the new client-safe `format.ts`
- Initial values match props (so first paint is correct)

## Phase J — Hygiene

`bun run lint` · `bun run type-check` (or `tsc --noEmit`) · `bun run build` — all green.

## Phase K — Pre-EXECUTE Council Gate (mandatory per Session 4.5)

Before any Phase B–J code change is written, run a council review of this plan: 3 parallel `general-purpose` agents acting as Security / Architecture / Product personas. Capture verdicts + scores in `.harness/memory/decisions/session-6-council-review.md`. Address any FAIL verdicts before proceeding.

## Critical Files to Modify

| File | Change |
|---|---|
| `src/app/plan/actions.ts` | NEW — `recomputeRouteAction` server action |
| `src/lib/routing/directions.ts` | Add `computeRouteWithStops`; refactor `computeRoute` to wrap it |
| `src/lib/routing/format.ts` | NEW — extract `formatDistance` / `formatDuration` (client-safe) |
| `src/components/PlanWorkspace.tsx` | Trip state, recompute effect, live totals, Itinerary mount |
| `src/components/RecommendationList.tsx` | Add-to-trip buttons + props |
| `src/components/RouteMap.tsx` | Numbered stop markers + bounds-fit-once |
| `src/components/Itinerary.tsx` | NEW |

## Files to Reuse (no edits needed)

- `src/lib/routing/validation.ts` — `validateRouteParams`, `InvalidRouteParamsError`
- `src/lib/routing/rate-limit.ts` — `checkRateLimit`, `getClientIp`, `maybeSweep`
- `src/lib/personas/index.ts` — `PERSONAS`, accent colors

## Verification

1. Run dev server, navigate to a known-good corridor (e.g., NYC → DC).
2. Confirm initial route renders + recommendations appear.
3. Click "Add to trip" on a city → polyline reshapes through that city, button flips to "✓ Added", Itinerary shows it, totals update.
4. Add a second city → second recompute, polyline still correct.
5. Remove a stop from Itinerary → polyline reverts, button re-enables.
6. Try to add 11 stops → 11th rejected.
7. Switch personas mid-trip → polyline color changes, candidate markers re-color, NO Firestore reads (Session 5 invariant), NO new computeRoute calls.
8. `bun run lint && bun run build` — green.
9. Council review file exists with all verdicts and any blocker findings addressed.

## Out of Scope (Session 7+)

- Refreshing candidate cities / waypoint recommendations after a stop is added (recommendations stay frozen to the original corridor)
- Drag-to-reorder Itinerary stops (Remove + re-add is acceptable for MVP)
- "Replan recommendations" button
- Save/load trips, share links, export
- Mobile bottom-sheet itinerary
