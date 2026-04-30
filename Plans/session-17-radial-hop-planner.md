# Session 17 Plan — Radial Hop Planner

**Scope:** Replace corridor-based recommendation engine with a radial hop-by-hop trip planner.
**Status:** Planning — PR A (persona default) in flight as harness test.

---

## Problem statement

The current model computes a route polyline from origin → destination and filters cities near that line. This is wrong for road trip psychology: people who use a trip planner want to *discover*, not optimize. The corridor model silently excludes interesting cities that are reachable but slightly off the direct path.

---

## New model

### Core loop
1. User provides: origin, destination, start date, end date, daily drive budget (hours).
2. App computes a candidate pool from current position: all cities reachable within `daily_budget + 30 min` drive, filtered to a 180° semicircle aimed generally toward the destination.
3. User picks a city → it becomes the new position. A new candidate pool is computed from there.
4. Repeat until destination is selected.

### Semicircle filter
- Compute raw bearing (degrees) from current position to destination.
- Snap to nearest of 8 compass points: N (0°), NE (45°), E (90°), SE (135°), S (180°), SW (225°), W (270°), NW (315°).
- Keep only cities whose bearing from current position falls within ±90° of the snapped heading.
- This eliminates backtracking without drawing a corridor. Someone can still take Tennessee instead of going straight southwest — they just won't be offered Montreal.

### Trip-level budget
- `totalDays = endDate - startDate`
- `totalBudgetMinutes = totalDays × dailyBudgetHours × 60`
- `spentMinutes = sum of actual drive times for each selected leg`
- `remainingBudgetMinutes = totalBudgetMinutes - spentMinutes`
- `directMinutesToDestination` = live drive time from current position to destination (Routes API, computed on each selection)
- **Soft warning** when `directMinutesToDestination > remainingBudgetMinutes`. Shows estimated extra days needed. Not a blocker.

---

## What gets cut

| Current | Fate |
|---|---|
| `findCandidateCities` in `candidates.ts` | Deleted — replaced by `findCitiesInRadius` |
| Geometric buffer (120km polyline buffer) | Deleted |
| `computeRoute` call at page load | Deleted — no route until user finishes selecting |
| `offCorridorStopIds` useMemo | Deleted |
| `↗ detour` badge in Itinerary | Deleted |
| `corridorAnnouncement` aria-live | Deleted |

---

## What gets added / changed

### New pure functions (`candidates.ts` or new `routing/radial.ts`)
```
bearingDeg(from: LatLng, to: LatLng): number
  — raw compass bearing 0–360 using atan2 on Δlat/Δlng

snapToCompassPoint(bearing: number): CompassPoint
  — CompassPoint = "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW"
  — snap to nearest 45° increment

bearingFromCompassPoint(cp: CompassPoint): number
  — inverse lookup: "SW" → 225

withinSemicircle(cityLatLng: LatLng, origin: LatLng, headingDeg: number): boolean
  — true if bearing(origin → city) within ±90° of headingDeg
  — handles 0°/360° wrap

findCitiesInRadius(
  origin: LatLng,
  destination: LatLng,
  maxMinutes: number
): Promise<City[]>
  — compute Routes API matrix: origin → all 258 cities
  — filter by maxMinutes
  — apply semicircle filter (bearing origin→destination, snapped)
  — return filtered list
```

All pure functions are unit-testable without network. `findCitiesInRadius` is server-only.

### New Zod schemas (`cityAtlas.ts` or `plan/types.ts`)
```
TripInputSchema: {
  origin: LatLngSchema,
  originName: string,
  destination: LatLngSchema,
  destinationName: string,
  startDate: z.string().date(),   // ISO YYYY-MM-DD
  endDate: z.string().date(),
  dailyBudgetHours: z.number().min(1).max(16),
}

TripLegSchema: {
  from: LatLngSchema,
  fromName: string,
  driveMinutes: number,           // actual drive time for this leg
  chosenCity: CitySchema | null,  // null = leg in progress
}

TripStateSchema: {
  input: TripInputSchema,
  legs: TripLegSchema[],          // grows as user picks stops
  directMinutesToDestination: number | null,
}
```

Discriminated union for `TripStatus`:
```
| { status: "planning"; currentPosition: LatLng; candidatePool: City[] }
| { status: "complete"; legs: TripLeg[] }
```

### Updated landing page (`page.tsx` + `RouteInput.tsx`)
- Add start date and end date fields (date pickers or text inputs, ISO format).
- Keep origin, destination, daily budget.
- Derived read-only display: "X days · Y total drive hours budget."
- Pass all fields through to plan page as search params.

### Updated plan page (`plan/page.tsx`, `actions.ts`)
- `PlanSearchParams` gains `startDate`, `endDate`.
- Drop the initial `computeRoute` call.
- First server render: call `findCitiesInRadius(origin, destination, dailyBudget + 30min)`.
- Pass `TripState` (initial leg, candidate pool) as initial prop to `PlanWorkspace`.

### Updated `PlanWorkspace.tsx`
- State: `TripState` (replaces current route-centric state).
- On city selection: append leg, call `recomputeAndRefreshAction` with new position + remaining budget.
- Budget counter displayed: "X hrs direct to destination · Y hrs remaining · Z days left."
- Soft warning: amber banner when `directMinutes > remainingBudget`.
- Remove: `offCorridorStopIds`, detour badge wiring, `corridorAnnouncement`.

### Map overlay — Effect 5 in PolylineRenderer
- Draw the semicircle arc showing current search radius + heading.
- Uses `google.maps.Circle` or a custom polyline approximation.
- Updates on each leg selection.
- Controlled by a new prop: `{ center: LatLng; radiusMeters: number; headingDeg: number } | null`.

---

## PR slices

### PR A — Culture default persona *(in flight)*
- `DEFAULT_PERSONA_ID = "culture"` in `personas/index.ts`
- Reorder `PERSONA_ORDER`: culture, foodie, nerd, gearhead, outdoorsman
- **Harness test PR.**

### PR B — Trip input model
- New `TripInputSchema` (Zod) with startDate, endDate, dailyBudgetHours
- Updated `RouteInput.tsx` form (date fields + derived day/hour display)
- Updated `PlanSearchParams` + plan page param parsing
- No recommendation changes — data just flows through
- Unit tests: schema validation, date math (totalDays, totalBudgetMinutes)

### PR C — Radial candidate engine
- New file `src/lib/routing/radial.ts`: `bearingDeg`, `snapToCompassPoint`, `bearingFromCompassPoint`, `withinSemicircle`, `findCitiesInRadius`
- Delete `findCandidateCities` and geometric buffer from `candidates.ts`
- Update `recomputeAndRefreshAction` in `actions.ts` to call `findCitiesInRadius`
- Unit tests: all pure functions (bearing math, snap, semicircle inclusion/exclusion, wrap-around at 0°/360°)

### PR D — Trip state + budget tracking
- `TripLeg`, `TripState`, `TripStatus` discriminated union
- `remainingBudgetMinutes`, `directMinutesToDestination` derived values
- Budget warning threshold logic
- Unit tests: budget math, warning trigger, leg accumulation

### PR E — Hop-by-hop plan page UX *(depends on C + D)*
- `PlanWorkspace` rewritten around `TripState`
- City selection → append leg → next candidate fetch
- Budget counter display + soft warning banner
- Remove: `offCorridorStopIds`, detour badge, `corridorAnnouncement`
- Update Itinerary to show legs (from → to + drive time)

### PR F — Semicircle map overlay *(depends on E)*
- Effect 5 in PolylineRenderer: draws arc for current search radius + heading
- New prop to `RouteMap`: `searchArc: { center: LatLng; radiusMeters: number; headingDeg: number } | null`
- `PlanWorkspace` passes current arc data down on each leg change

---

## Dependency graph

```
PR A (persona)     — no deps, ship first
PR B (input)       — no deps
PR C (engine)      — no deps on B/D
PR D (state)       — no deps on B/C
PR E (UX)          — needs C + D
PR F (map arc)     — needs E
```

B, C, D can land in any order or in parallel. E gates on C+D. F gates on E.

---

## What does NOT change

- `scoring.ts` — persona weighting, `buildRankedGroups`, `tierForType`
- Firestore data layer — `firestore.ts`, `cities.ts`, `cityAtlas.ts`
- `fetchNeighborhoods` + `NeighborhoodPanel`
- Rate limiting layers (burst + spacing + daily quota)
- All 53 existing unit tests remain valid

---

## Routes API budget note

The new model makes a matrix call per leg selection (current position → all 258 cities). This replaces the single matrix call per full route load. Cost per call is the same; frequency depends on how many legs the user makes. Rate limit layers already protect against abuse. Daily quota guard covers the burst case.

---

## Open questions (defer to implementation)

1. How to handle the case where `findCitiesInRadius` returns zero cities (very rural origin, very tight budget)? Probably expand radius in 15-min increments up to 2× budget.
2. Date pickers vs free-text input for start/end date on landing page.
3. Whether to persist `TripState` in localStorage so a browser refresh doesn't reset the trip in progress.
4. Semicircle arc on map: `google.maps.Circle` covers full circle — will need a custom polyline arc or SVG overlay for a true semicircle.
