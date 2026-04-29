# Session 13 — Click-to-select neighborhood panel

**Branch:** `feat/click-to-select-neighborhood`
**Date:** 2026-04-29

## Goal

The NeighborhoodPanel currently always shows the last-added Itinerary stop.
The user should be able to click any stop in the Itinerary to switch the panel.

## Changes

### 1. `src/lib/routing/recommend.ts`
- Export `fetchNeighborhoods` (currently private) so `actions.ts` can call it directly.

### 2. `src/app/plan/actions.ts`
- Add `fetchNeighborhoodsAction(cityId)` — lightweight Server Action.
- Validates cityId format (`/^[a-z0-9-]{1,100}$/`).
- Calls `fetchNeighborhoods(cityId)` and returns `NeighborhoodLoadState`.
- **No rate-limit charge** — it's a Firestore read backed by the LRU cache.
- Returns a discriminated union: `{ ok: true, cityId, loadState }` | `{ ok: false, cityId }`.

### 3. `src/components/Itinerary.tsx`
- Add `onStopClick?: (cityId: string) => void` prop.
- Add `selectedCityId?: string | null` prop for visual highlight.
- Each stop row becomes a clickable button region (or wrapping button).
- Selected stop gets a visual indicator (brighter left border / background).

### 4. `src/components/PlanWorkspace.tsx`
- **New state:** `panelCityId: string | null` — replaces the `tripStops[last].cityId` derivation.
- **New state:** `localNeighborhoods: Record<string, NeighborhoodLoadState>` — cache of on-demand fetches.
- **New state:** `isPanelLoading: boolean`.
- **`effectiveNeighborhoods`** memo: `{ ...effectiveWaypointFetch.neighborhoods, ...localNeighborhoods }`.
- **useEffect (reconcile):** when `tripStops` changes, if `panelCityId` is no longer in the list, reset to last stop.
- **useEffect (fetch):** when `panelCityId` changes and its data is absent from `effectiveNeighborhoods`, call `fetchNeighborhoodsAction`, store result in `localNeighborhoods`.
- **`handleAddCity`:** after adding, sets `panelCityId` to the new stop.
- **`handleStopClick`:** sets `panelCityId` to the clicked stop.
- Panel render: gated on `panelCityId` and `panelStop`; shows loading spinner while `isPanelLoading`.
- Pass `selectedCityId={panelCityId}` and `onStopClick={handleStopClick}` to `Itinerary`.

## Architecture notes

- `localNeighborhoods` is a pure client overlay; it never writes back to `liveWaypointFetch`. This keeps the recompute path clean.
- The fetch effect is idempotent: repeated clicks on a stop that already has data are no-ops.
- Rate-limit layers are unchanged — `fetchNeighborhoodsAction` is a cache-first read, not a billable API call.
- No new multi-effect collapse — panel loading state is managed via a plain useState, not an effect.
