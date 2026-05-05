# Plan — Session 24: Arrival mode V2 — dynamic startDate re-derivation

## Goal

In arrival mode, the displayed trip start date should stay accurate as the
user adds or removes stops. Currently `startDate` is derived once in
`plan/page.tsx` from the direct origin → destination route, then frozen as a
prop. Adding stops changes the total drive time, which changes the overnight
count, which changes the departure date — but the UI never reflects this.

## Scope — single PR

Three files. No new API calls; `deriveStartDate` already exists in `types.ts`.

### Files touched

| File | Change |
|------|--------|
| `src/app/plan/actions.ts` | Accept optional `endDate?: string`; derive and return `derivedStartDate` on `ok: true` arms when in arrival mode |
| `src/components/PlanWorkspace.tsx` | Add `dateMode?` prop; convert `startDate` to `useState`; update from `derivedStartDate` after each successful recompute |
| `src/app/plan/page.tsx` | Pass `dateMode` prop to `PlanWorkspace` |

### Out of scope

- Showing startDate in the RouteInput after return to home (it's not persisted to URL in arrival mode)
- Re-deriving startDate when stops are *removed* without a recompute (recompute fires on every stop change already)

## Data flow

```
User adds stop (arrival mode)
  → PlanWorkspace calls recomputeAndRefreshAction(..., endDate)
  → action: computeRouteWithStops → totalDurationSeconds
  → action: deriveStartDate(endDate, totalDurationSeconds, budgetHours)
  → returns { ok: true, ..., derivedStartDate: "2026-05-31" }
  → PlanWorkspace: setDerivedStartDate("2026-05-31")
  → tripDays re-derived → deadline pressure updates automatically
```

## Key changes

### `RecomputeAndRefreshResult` (actions.ts)

Add optional `derivedStartDate?: string` to both `ok: true` arms. Optional
because it is only populated in arrival mode; range-mode callers ignore it.

### `recomputeAndRefreshAction` (actions.ts)

```typescript
// New param (validated with Zod string().date() before use)
endDate?: string
```

After route computation succeeds:
```typescript
let derivedStartDate: string | undefined;
if (endDate) {
  const endParsed = z.string().date().safeParse(endDate);
  if (endParsed.success && Number.isFinite(route.totalDurationSeconds)) {
    derivedStartDate = deriveStartDate(endParsed.data, route.totalDurationSeconds, budgetHours);
  }
}
// include derivedStartDate in both ok: true arms
```

### `PlanWorkspace` (PlanWorkspace.tsx)

```typescript
// New prop
dateMode?: string;

// startDate becomes mutable state (initialized from server-derived prop)
const [derivedStartDate, setDerivedStartDate] = useState<string | undefined>(startDate);

// tripDays uses derivedStartDate
const tripDays = derivedStartDate && endDate
  ? dateTotalDays({ startDate: derivedStartDate, endDate })
  : 1;

// After each successful recompute:
if (result.derivedStartDate) setDerivedStartDate(result.derivedStartDate);
```

## Risk surface

- Files / modules touched: `actions.ts`, `PlanWorkspace.tsx`, `plan/page.tsx`
- Cross-system effects: one additional cheap date derivation per recompute in
  arrival mode — no new API calls, no Firestore reads
- Rollback: remove `endDate` param from action, remove `derivedStartDate`
  from result type, revert PlanWorkspace to prop-based `startDate`

## Steps

1. Commit this plan [skip council]
2. Update `RecomputeAndRefreshResult` + `recomputeAndRefreshAction` in `actions.ts`
3. Update `PlanWorkspace.tsx` with `dateMode` prop + `derivedStartDate` state
4. Update `plan/page.tsx` to pass `dateMode`
5. Type-check + test
6. Push branch, open PR, await council
