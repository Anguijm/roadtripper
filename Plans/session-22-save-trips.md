# Plan — Session 22: Save/load trips (PR A — types + server actions)

## Goal

Add `SavedTrip` type + Zod schema and three server actions (`saveTrip`, `loadTrips`,
`deleteTrip`) so the plan page can persist trips to Firestore and the trips list page
can fetch them. No UI in this PR — pure server layer.

## Architecture

- Firestore path: `users/{userId}/saved_trips/{tripId}` (Admin SDK, auth enforced in action via Clerk `auth()`)
- Firestore security rules (`firestore.rules`) provide a defense-in-depth layer — all primary enforcement is server-side but rules prevent direct client access if credentials are ever compromised
- Types live in `src/lib/trips/types.ts` (isomorphic, no server-only imports)
- Actions live in `src/app/trips/actions.ts` ("use server" + server-only)

## Files touched

- `src/lib/trips/types.ts` — new: `SavedTripStop`, `SaveTripInput`, `SavedTrip`, Zod schemas
- `src/app/trips/actions.ts` — new: `saveTrip`, `loadTrips`, `deleteTrip`
- `src/lib/trips/types.test.ts` — new: Zod schema validation tests

## Steps

1. Commit plan [skip council]
2. Implement `src/lib/trips/types.ts`
3. Implement `src/app/trips/actions.ts`
4. Add tests for schema validation
5. type-check + test, open PR
