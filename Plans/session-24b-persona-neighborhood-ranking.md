# Plan — Session 24b: Persona-aware neighborhood ranking

## Goal

Neighborhoods in the drill-down panel are currently sorted by raw
`trending_score` — the active persona has no influence. A Foodie clicking a
stop should see food-rich neighborhoods first; an Outdoorsman should see
nature-heavy neighborhoods first.

## Scope — single PR

Three files. No new API calls, no Firestore changes. Pure client-side
re-sort using existing `typeWeight` infrastructure.

### Files touched

| File | Change |
|------|--------|
| `src/lib/routing/scoring.ts` | Add `scoreNeighborhood(trendingScore, waypoints, persona)` |
| `src/components/NeighborhoodPanel.tsx` | Add `personaId` prop; use `scoreNeighborhood` in sort |
| `src/components/PlanWorkspace.tsx` | Pass `activePersonaId` to `NeighborhoodPanel` |

## Scoring function

```typescript
// trending_score × max(typeWeight of waypoints in this neighborhood)
// Falls back to the "other" weight (0.2) when the neighborhood has no
// waypoints (not yet fetched or genuinely empty).
export function scoreNeighborhood(
  trendingScore: number,        // neighborhood.trending_score, pre-extracted
  waypoints: LiteWaypoint[],   // already filtered to this neighborhood
  persona: PersonaConfig
): number {
  const bestWeight = waypoints.reduce((best, w) => {
    const tier = tierForType(w.type, persona);
    return Math.max(best, typeWeight(tier));
  }, typeWeight("other"));  // floor = 0.2
  return trendingScore * bestWeight;
}
```

## Why this formula

- `trending_score` anchors to UE pipeline quality signal (keeps high-signal
  neighborhoods visible even with low persona match)
- `bestWeight` (not sum) avoids bias toward neighborhoods with many waypoints
  vs. one perfect-match waypoint; max captures "does this neighborhood have
  what this persona cares about?"
- Falls back to 0.2× rather than 0 to keep all neighborhoods visible — a
  Foodie still sees nature neighborhoods, just lower

## Risk surface

- Files touched: `scoring.ts`, `NeighborhoodPanel.tsx`, `PlanWorkspace.tsx`
- Cross-system effects: visual order only — no data changes, no API calls
- Rollback: remove `personaId` prop, revert to `trending_score` sort

## Steps

1. Commit plan [skip council]
2. Add `scoreNeighborhood` to `scoring.ts` + unit tests
3. Update `NeighborhoodPanel.tsx` with `personaId` prop + new sort
4. Update `PlanWorkspace.tsx` to pass `activePersonaId`
5. Type-check + test
6. Push branch, open PR, await council
