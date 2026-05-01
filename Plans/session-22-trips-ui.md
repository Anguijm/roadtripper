# Plan — Session 22: Save/load trips (PR B — auth UI + save button + trips list)

## Goal

Wire the PR A server actions into the UI:
- Auth header on landing page and plan page (SignInButton / UserButton)
- Save button in PlanWorkspace (gated by auth, stable UUID per mount)
- /trips list page: saved trips with Resume links and Delete

## Files touched

- `src/app/page.tsx` — auth header (SignInButton / UserButton)
- `src/components/PlanWorkspace.tsx` — save button (useAuth, saveTrip action)
- `src/app/trips/page.tsx` — new: server component, calls loadTrips(), renders list
- `src/components/TripCard.tsx` — new: client component for delete button

## Resume URL shape

`/plan?fromLat=&fromLng=&toLat=&toLng=&budget=&startDate=&endDate=&persona=&fromName=&toName=`

Stops are not encoded in URL — user re-adds stops after resuming (V1 acceptable).

## Steps

1. Commit plan [skip council]
2. Add auth UI to landing page
3. Add save button to PlanWorkspace
4. Implement /trips page + TripCard
5. type-check, open PR
