# Session 14 — Off-corridor indicator in Itinerary

**Branch:** `feat/off-corridor-indicator`
**Date:** 2026-04-29

## Goal

After a route recompute, a trip stop may no longer appear in the refreshed
candidate list (e.g. its detour grew too large for the new corridor). Show a
subtle badge on those stops so the user knows the stop is now off their route.

## When to show

Only when `liveWaypointFetch !== null` — i.e. at least one recompute has
happened. Before the first recompute, all stops came from the initial
candidates and are by definition on-corridor.

Definition: stop is off-corridor iff `liveWaypointFetch.cities` does not
contain that stop's `cityId`.

## Changes

### `src/components/PlanWorkspace.tsx`
- Add `offCorridorStopIds` useMemo: when `liveWaypointFetch !== null`, the
  set of `tripStop.cityId` values absent from `liveWaypointFetch.cities`.
  Empty set when `liveWaypointFetch === null`.
- Pass `offCorridorStopIds` to `<Itinerary>`.

### `src/components/Itinerary.tsx`
- Add `offCorridorStopIds?: ReadonlySet<string>` prop.
- For stops in the set: show a small `↗ detour` badge (amber, monospace)
  next to the city name — same visual language as the `⚠ failed` badge.
- Badge has `title` attribute explaining "This stop is no longer near your
  current route corridor."

## Architecture notes

- Pure UI change. No server actions, no new state, no effects.
- `liveWaypointFetch` (not `effectiveWaypointFetch`) is the right source:
  `effectiveWaypointFetch` falls back to initial on degraded — we only want
  to show the badge when we have a fresh post-recompute candidate set.
- Does not interact with `failedStopId` (route error) or `panelCityId`
  (neighborhood panel) — orthogonal concerns.
