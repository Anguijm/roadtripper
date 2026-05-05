# Active plan — roadtripper

# Active plan — roadtripper

## Goal

Arrival mode V2: re-derive `startDate` dynamically as stops are added.
`recomputeAndRefreshAction` returns `derivedStartDate` in arrival mode;
`PlanWorkspace` holds it as state and updates deadline pressure automatically.

## Risk surface

- Files touched: `src/app/plan/actions.ts`, `src/components/PlanWorkspace.tsx`, `src/app/plan/page.tsx`
- Cross-system effects: one cheap date calc per recompute — no new API calls
- Rollback: remove `endDate` param + `derivedStartDate` from action result, revert PlanWorkspace

## Steps

1. Commit plan [skip council] ✓
2. Update `actions.ts` — add `endDate?` param + `derivedStartDate` to result type
3. Update `PlanWorkspace.tsx` — `dateMode?` prop + `derivedStartDate` state
4. Update `plan/page.tsx` — pass `dateMode`
5. Type-check + test
6. Push branch, open PR, await council
