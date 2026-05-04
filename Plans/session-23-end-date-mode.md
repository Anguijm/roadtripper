# Plan — Session 23: End-date-anchored trip mode

## Goal

Let users enter only an **arrival date** (end date) instead of a full date range.
The server derives the departure date from the direct route duration and daily
budget: `startDate = endDate − (ceil(directMinutes / budgetMinutes) − 1) days`.

This uses the overnight-quantization model shipped in session 23
(`legsQuantizedDays` / `computeDeadlinePressure`): a 6h drive on a 5h budget
costs 2 days, not 1.2.

## Scope — single PR

Three files + tests. No schema migration; derivation happens server-side after
the route is computed, so existing `TripParamsSchema` is unchanged.

### Files touched

| File | Change |
|------|--------|
| `src/lib/plan/types.ts` | Add `deriveStartDate(endDate, durationSeconds, budgetHours)` helper |
| `src/components/RouteInput.tsx` | Add `dateMode` state + mode toggle UI; end-date-only submit path |
| `src/app/plan/page.tsx` | Add `dateMode` to `PlanSearchParams`; derive `startDate` from route in arrival mode |
| `src/lib/plan/types.test.ts` (new) | Unit tests for `deriveStartDate` |

### Out of scope

- Dynamic `startDate` update in PlanWorkspace as stops are added (V2 — deadline
  pressure already signals if you're falling behind)
- Persisting `dateMode` in saved trips (V2 — save/load stores both dates after
  derivation, which is correct)

## Data flow

```
RouteInput (arrival mode)
  └─ URL: endDate=2026-06-07&dateMode=arrival (no startDate)

plan/page.tsx
  1. Parse dateMode from searchParams
  2. Validate endDate is a valid ISO date (arrival mode)
  3. computeRoute + findCitiesInRadius in parallel (unchanged)
  4. After route: startDate = deriveStartDate(endDate, route.totalDurationSeconds, budgetHours)
  5. Pass startDate + endDate to PlanWorkspace (identical interface, no downstream changes)
```

## Key function

```typescript
// src/lib/plan/types.ts
export function deriveStartDate(
  endDate: string,
  directDurationSeconds: number,
  dailyBudgetHours: number
): string {
  const daysNeeded = Math.ceil(directDurationSeconds / 60 / (dailyBudgetHours * 60));
  const d = new Date(endDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (daysNeeded - 1));
  return d.toISOString().split("T")[0];
}
```

## RouteInput UI

- Date dialog gets a two-option toggle: **Date range** / **Arrival date**
- In arrival mode: only "Arrive by" date field shown; "From" field hidden
- `canSubmit` in arrival mode: `from && to && endDate && !submitting`
- URL submission: `dateMode=arrival&endDate=...` (no `startDate` param)
- Label changes: "Select dates" → arrival mode shows "Arrive by [date]"

## plan/page.tsx

- `PlanSearchParams` gains optional `dateMode?: string`
- Arrival mode path: validate `endDate` is non-empty ISO date; skip `TripParamsSchema`
  (start date unknown until route is computed)
- After route computation: call `deriveStartDate`; pass both dates to PlanWorkspace
- If route fails in arrival mode: `startDate` stays `undefined`; no deadline
  pressure shown (same as today when route fails)

## Risk surface

- Files / modules touched: `types.ts`, `RouteInput.tsx`, `plan/page.tsx`
- Cross-system effects: visual + URL shape only — no new API calls, no Firestore
- Rollback: revert `dateMode` URL param handling in page.tsx, remove mode toggle
  from RouteInput, remove `deriveStartDate` helper

## Steps

1. Commit this plan [skip council]
2. Add `deriveStartDate` to `types.ts` + unit tests
3. Update `RouteInput.tsx` with mode toggle + arrival submit path
4. Update `plan/page.tsx` with arrival mode derivation
5. Type-check + test
6. Push branch, open PR, await council
