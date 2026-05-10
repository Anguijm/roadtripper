# Active plan — roadtripper

# Active plan — roadtripper

## Goal

Persona-aware neighborhood ranking: sort neighborhoods in the drill-down panel
by `trending_score × bestTypeWeight(persona)` instead of raw `trending_score`.

## Risk surface

- Files touched: `src/lib/routing/scoring.ts`, `src/components/NeighborhoodPanel.tsx`, `src/components/PlanWorkspace.tsx`
- Cross-system effects: visual order only — no API calls, no Firestore changes
- Rollback: remove `personaId` prop from NeighborhoodPanel, revert to `trending_score` sort

## Steps

1. Commit plan [skip council] ✓
2. Add `scoreNeighborhood` to `scoring.ts` + unit tests
3. Update `NeighborhoodPanel.tsx` with `personaId` prop + new sort
4. Update `PlanWorkspace.tsx` to pass `activePersonaId`
5. Type-check + test
6. Push branch, open PR, await council
