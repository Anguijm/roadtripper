# Active plan — roadtripper

## Goal

End-date-anchored trip mode: user enters only an arrival date; `plan/page.tsx`
derives the departure date from the direct route duration using overnight
quantization (`ceil(directMinutes / budgetMinutes)` days).

## Risk surface

- Files / modules touched: `src/lib/plan/types.ts`, `src/components/RouteInput.tsx`, `src/app/plan/page.tsx`
- Cross-system effects: visual + URL shape only — no new API calls, no Firestore
- Rollback: revert `dateMode` param handling in page.tsx, remove toggle from RouteInput, remove `deriveStartDate`

## Steps

1. Commit plan [skip council] ✓
2. Add `deriveStartDate` to `types.ts` + unit tests
3. Update `RouteInput.tsx` — mode toggle + arrival submit path
4. Update `plan/page.tsx` — arrival mode derivation
5. Type-check + full test run
6. Push branch, open PR, await council
