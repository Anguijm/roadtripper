# Session 20 plan — semicircle map overlay (PR F)

## Goal

Visualise the radial hop search area as a 180° arc on the map. The arc is centered
on the frontier stop (the last trip stop, or origin if none) and opens forward toward
the destination, showing the user "this is where we're looking for your next stop."

## Scope

**One PR: `feat/map-arc`**

This is a pure visual addition — no API calls, no new server state, no new tests
required beyond type-check and the existing 175-test suite.

## Implementation

### RouteMap.tsx

1. Export `SearchArc` interface: `{ center: LatLngLiteral; radiusMeters: number; headingDeg: number }`
2. Add `searchArc?: SearchArc | null` to `RouteMapProps` and thread to `PolylineRenderer`
3. Add `buildSemicirclePoints(center, radiusMeters, headingDeg, steps=32)` — uses
   `google.maps.geometry.spherical.computeOffset` to build a 33-point polyline arc
   spanning `[headingDeg − 90°, headingDeg + 90°]`
4. Inside `PolylineRenderer`: add `arcRef` + Effect 5
   - Deps: `[map, searchArc, routeColor]`
   - Tears down previous arc, builds new one, returns cleanup
   - `hasFitOnceRef` NOT touched (invariant from CLAUDE.md)

### PlanWorkspace.tsx

1. Import `SearchArc` from RouteMap
2. Add module-level `computeBearing(from, to)` — standard spherical bearing formula
3. Add `searchArc` useMemo: center = last stop or origin, radius = `maxDetourMinutes * 1333` m,
   heading = `computeBearing(center, destination)`
4. Pass `searchArc={searchArc}` to `<RouteMap>`

## Non-goals / constraints

- Do NOT touch `hasFitOnceRef` — fit-bounds-once invariant (CLAUDE.md)
- Do NOT collapse effects — 7-effect split is load-bearing (CLAUDE.md)
- No new API calls
- Arc is decorative; no aria-label needed (it conveys no information not already in the text UI)
