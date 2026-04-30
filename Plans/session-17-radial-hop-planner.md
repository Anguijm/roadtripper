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
  — check LRU cache first (key: SHA-256({ lat: number (3dp), lng: number (3dp), maxMinutes: number, compassPoint: CompassPoint }), max-entries: 256)
  — on miss: compute Routes API matrix: origin → all 258 cities (city list
    itself is already in the 24h LRU via getAllCities(), no Firestore call)
  — filter by maxMinutes, apply semicircle filter, cache result
  — return filtered list
```

All pure functions are unit-testable without network. `findCitiesInRadius` is server-only (`import "server-only"`; must not appear in any client barrel export).

### New Zod schemas (`cityAtlas.ts` or `plan/types.ts`)
```
TripInputSchema: {
  origin: LatLngSchema,
  originName: string,
  destination: LatLngSchema,
  destinationName: string,
  startDate: z.string().date(),   // ISO YYYY-MM-DD
  endDate: z.string().date(),     // must be >= startDate (validated via .refine)
  dailyBudgetHours: z.number().min(1).max(16),
  // .refine: startDate <= endDate (prevents impossible trip durations)
}

TripLegSchema: {
  from: LatLngSchema,
  fromName: string,
  driveMinutes: number,           // actual drive time for this leg
  chosenCity: CitySchema,         // non-nullable — only completed legs enter the array
}

TripStateSchema: {
  input: TripInputSchema,
  legs: TripLegSchema[],          // grows as user picks stops
}
```

// directMinutesToDestination is only valid in the planning state — never on TripStateSchema directly.
Discriminated union for `TripStatus`:
```
| { status: "planning"; currentPosition: LatLng; candidatePool: City[]; directMinutesToDestination: number }
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
- **`recomputeAndRefreshAction` must Zod-validate all inputs at the function boundary** (specifically: the `newPosition` LatLng received from the client) before any downstream call — same invariant as all server actions in this codebase
- Unit tests: all pure functions (bearing math, snap, semicircle inclusion/exclusion, wrap-around at 0°/360°); mock for Routes API matrix required to test `findCitiesInRadius` in isolation (error handling, empty result vs API failure, cache behavior)

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
- Replace `corridorAnnouncement` with `candidatePoolAnnouncement` aria-live region: announces when the candidate pool refreshes after a leg selection ("Now showing X cities within Y hours towards the southwest")
- Budget warning banner must be announced via `aria-live="assertive"` (not polite — it's time-sensitive)
- City selection: cancels any in-flight `recomputeAndRefreshAction` call before issuing a new one (idempotency guard against double-click)
- Update Itinerary to show legs (from → to + drive time)

### PR F — Semicircle map overlay *(depends on E)*
- Effect 5 in PolylineRenderer: draws arc for current search radius + heading
- New prop to `RouteMap`: `searchArc: { center: LatLng; radiusMeters: number; headingDeg: number } | null`
- `PlanWorkspace` passes current arc data down on each leg change
- Effect cleanup: when `searchArc` is null or component unmounts, the arc object must be explicitly removed from the map (`arc.setMap(null)`) to prevent leaks
- Fit-bounds invariant: the arc does NOT trigger a map re-fit; `hasFitOnceRef` stays as-is

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

## Routes API cost and caching

The matrix call (1×258 elements, ~$1.29/call) is the dominant cost driver. Mitigation layers:

1. **LRU cache in `findCitiesInRadius`**: cache key = SHA-256({ lat, lng (both rounded to 3dp), maxMinutes, compassPoint }) — must be a hash of a structured canonical object, not string concatenation. Hard cap: max-entries = 256 to prevent memory exhaustion. A user who backtracks to the same city won't re-bill.
2. **City list already cached**: `getAllCities()` holds the 258 cities in a 24h LRU — no Firestore read on each leg.
3. **Rate limit — daily quota MUST be lowered in PR C**: current quota is 200/IP/day, set when actions cost ~$0.005. At ~$1.29/matrix call, 200 actions = ~$258/IP/day ceiling. **PR C must lower this to 20–30/IP/day** before `findCitiesInRadius` ships. Hard gate, not a nice-to-have.
4. **Double-click guard**: idempotency check in `PlanWorkspace` cancels in-flight calls before issuing a new one, preventing duplicate charges from rapid selection.

Worst-case unmitigated cost (no cache hits, 20 legs): ~$26/user/trip. With cache hits on common origins and the rate limiter, practical cost is expected to be well under $5/user/trip.

---

## Open questions (defer to implementation)

1. **Zero results**: `findCitiesInRadius` returns empty (rural origin, tight budget). Expand radius in 15-min increments, **max 2 retries**, then surface a "no cities found" message. Hard cap prevents runaway API calls. The entire sequence (initial call + up to 2 retries) must consume **exactly one** charge from the daily rate-limit quota — deduct it before the first call, not per-retry. Also: distinguish between a genuine empty result (no cities in range) and an API error (network/5xx/429/malformed response) — surface different UI states for each, never mask an error as "no cities found".
2. **Date input**: text inputs (ISO YYYY-MM-DD) for start/end date on landing page — no date picker complexity in V1.
3. **Trip state persistence**: do NOT use localStorage (PII exposure, XSS surface). If cross-refresh persistence is needed, store in Firestore with a short TTL tied to the Clerk session. Defer to post-V1.
4. **Semicircle arc rendering**: `google.maps.Circle` covers a full circle — need a custom polyline approximation of a semicircle arc (sample N points along a half-circle) or a Google Maps Data Layer polygon.
