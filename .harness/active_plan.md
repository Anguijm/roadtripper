# Active plan — roadtripper

## Goal

PR F — Semicircle map overlay: visualise the radial hop search area as a 180° arc
on the map, pointing from the frontier stop (or origin) toward the destination.
Effect 5 in PolylineRenderer; `searchArc` prop on RouteMap; arc cleanup on unmount.

## Risk surface

- Files / modules touched: `src/components/RouteMap.tsx`, `src/components/PlanWorkspace.tsx`
- Cross-system effects: visual only — no API calls, no new state beyond `searchArc` useMemo
- Rollback plan: revert `searchArc` prop + Effect 5 in RouteMap, remove computeBearing + useMemo + prop in PlanWorkspace

## Steps

1. Update active_plan.md + Plans/session-20-map-arc.md, commit [skip council]
2. Create branch `feat/map-arc`
3. Add `SearchArc` interface + `buildSemicirclePoints` + `searchArc` prop + `arcRef` + Effect 5 to RouteMap.tsx
4. Add `computeBearing` helper + `searchArc` useMemo to PlanWorkspace.tsx, pass to RouteMap
5. Type-check + test + commit + push + PR

## Success criteria

- Test: `bun run type-check` passes; `bun run test` green
- Observable signal: arc visible on map centered on last trip stop (or origin), pointing toward destination; repaints on each stop add/remove
- Council verdict expected: 🟢
