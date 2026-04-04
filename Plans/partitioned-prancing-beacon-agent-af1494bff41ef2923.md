# Roadtripper Implementation Plan: Scaffold to MVP

## Table of Contents
1. [MVP Definition](#mvp-definition)
2. [Dependency Graph](#dependency-graph)
3. [Critical Algorithm: Stop Recommendation Engine](#critical-algorithm-stop-recommendation-engine)
4. [Persona-to-Data Mapping](#persona-to-data-mapping)
5. [Session-by-Session Plan](#session-by-session-plan)
6. [Risk Register](#risk-register)

---

## MVP Definition

**MVP = the core loop is demonstrable end-to-end:**
A user enters start city (e.g., "New York City") and end city (e.g., "Miami"), sets a daily drive time budget (e.g., 6 hours), and sees:
1. A route drawn on the map
2. Candidate Urban Explorer cities along that route highlighted
3. Waypoints from those cities recommended in a sidebar, filterable by one persona
4. Adding a stop recalculates the route

**MVP includes:** Sessions 1-10 (Foundation + Core + basic Persona filtering)
**MVP excludes:** Multi-day itinerary splitting, trip save/load, export, drag-to-reorder, mobile bottom sheet polish

---

## Dependency Graph

```
Session 1: Next.js scaffold + Tailwind + dark theme
    │
    ├── Session 2: Firebase/Firestore connection (read urbanexplorer)
    │       │
    │       └── Session 5: City data API + autocomplete
    │               │
    │               └── Session 7: Route calculation (Directions API)
    │                       │
    │                       ├── Session 8: Stop recommendation engine ★ CORE IP
    │                       │       │
    │                       │       └── Session 9: Dynamic route recalculation
    │                       │
    │                       └── Session 10: Persona filtering
    │
    ├── Session 3: Clerk auth integration
    │
    ├── Session 4: Google Maps setup + route display
    │       │
    │       └── Session 7 (depends on map being renderable)
    │
    └── Session 6: Drive time budget selector UI
            │
            └── Session 8 (budget constrains recommendations)
```

Sessions 1-4 are foundation and can be built strictly in order.
Sessions 5-6 are independent of each other.
Sessions 7-10 are sequential with hard dependencies.

---

## Critical Algorithm: Stop Recommendation Engine

This is the hardest technical problem and the core IP. The challenge: given a driving route from A to B, find Urban Explorer cities whose waypoints are reachable within a +/- 60 minute detour from the optimal route.

### Why This Is Hard

The naive approach ("find cities within X km of the route line") fails because:
- Straight-line distance does not equal drive time (mountains, water, missing highways)
- A city 30km from the route might be 90 minutes by road (no direct highway)
- A city 80km from the route might be 40 minutes (interstate exit)

### The Algorithm (Three-Phase Pipeline)

#### Phase 1: Geometric Pre-filter (Cheap, Client-Side)

Reduce 102 cities to ~10-20 candidates using only math (no API calls).

1. **Decode the route polyline** from the Directions API response. The response includes `overview_polyline` (encoded) which gives the route shape.
2. **Sample the polyline** at regular intervals (every ~50km) to get route sample points.
3. **For each of the 102 cities**, compute the minimum Haversine distance to any route sample point. Use the existing `haversineKm()` function from Urban Explorer's `vibeCacheRetrieval.ts`.
4. **Apply a generous geographic buffer**: keep cities within 120km of the route line. This is deliberately larger than 60 minutes of driving to avoid false negatives (a city 100km away on an interstate might be reachable in 50 minutes).
5. **Exclude start and end cities** from candidates (they are already on the route).

This phase costs zero API calls and runs in <10ms for 102 cities.

```typescript
// Pseudocode
function getCandidateCities(
  routePolyline: google.maps.LatLng[],
  allCities: CityEntry[],
  startCityId: string,
  endCityId: string,
  bufferKm: number = 120
): CityEntry[] {
  // Sample polyline every ~50km
  const samplePoints = samplePolylineEveryNKm(routePolyline, 50);
  
  return allCities.filter(city => {
    if (city.id === startCityId || city.id === endCityId) return false;
    if (!city.lat || !city.lng || city.isArchived) return false;
    
    // Find minimum distance to any sample point
    const minDist = Math.min(
      ...samplePoints.map(pt => haversineKm(city.lat, city.lng, pt.lat, pt.lng))
    );
    return minDist <= bufferKm;
  });
}
```

#### Phase 2: Drive-Time Validation (Expensive, Batched API Calls)

For each candidate city from Phase 1, determine the actual detour cost.

**Key insight:** The detour cost is NOT the distance from the route to the city. It is: `(drive_time_A_to_City + drive_time_City_to_B) - drive_time_A_to_B_direct`. But this is expensive (requires Distance Matrix calls for each candidate).

**Optimized approach using route legs:**

1. Find the **nearest route leg waypoint** to each candidate city. The Directions API response includes `legs[].steps[].start_location` — use the sample point nearest to the candidate.
2. Compute detour time as: `distance_matrix(nearest_route_point, candidate_city)` round-trip time. This is: `drive_to_city + drive_from_city_back_to_route ≈ 2 × drive_to_city`.
3. **Batch Distance Matrix calls**: The Distance Matrix API supports up to 25 origins × 25 destinations per request. With ~10-20 candidates, this is 1-2 API calls.

```typescript
// For each candidate city, find nearest route sample point
// Then batch: origins = [nearest_sample_points], destinations = [candidate_cities]
// Detour ≈ 2 × one-way drive time (out and back to route)
// Keep candidates where detour ≤ 120 minutes (60 min each way)
```

**API cost optimization:**
- Cache Distance Matrix results in a server-side Map keyed by `${origin_lat},${origin_lng}→${dest_lat},${dest_lng}` (rounded to 2 decimal places)
- TTL: 1 hour (routing data changes rarely)
- Estimated cost: 1-2 Distance Matrix API calls per route calculation (~$0.005-$0.01)

#### Phase 3: Waypoint Retrieval and Scoring (Firestore Reads)

For validated candidate cities (those within the 60-minute detour budget):

1. **Query waypoints** using `getCachedWaypoints(cityId)` from the Urban Explorer pattern. This returns waypoints sorted by `trending_score DESC`, limited to 100 per city.
2. **Apply persona filter** (see Persona-to-Data Mapping below) to select relevant waypoint types.
3. **Score and rank** remaining waypoints by:
   - `trending_score` (from Urban Explorer data, 0-100)
   - Detour efficiency: `trending_score / detour_minutes` (prefer high-value stops that are easy to reach)
   - Persona relevance weight (primary type match = 1.0, secondary = 0.5)
4. **Return top N** (e.g., 3-5 per candidate city, 15-20 total recommendations).

**Firestore cost:** ~2-8 reads per candidate city (cached after first load). With 5-10 validated cities, that is 10-80 reads per route, well within free tier.

### Data Flow Summary

```
User Input (start, end, budget)
    │
    ▼
Google Directions API → route polyline + total drive time
    │
    ▼
Phase 1: Geometric filter (102 cities → ~10-20 candidates)  [0 API calls, <10ms]
    │
    ▼
Phase 2: Distance Matrix validation (10-20 → 5-10 within budget)  [1-2 API calls]
    │
    ▼
Phase 3: Waypoint retrieval + persona filter + scoring  [Firestore cached reads]
    │
    ▼
Ranked recommendations displayed on map + sidebar
```

---

## Persona-to-Data Mapping

### Mapping Strategy

Each persona maps to:
1. **Primary waypoint types** (strong match, weight 1.0)
2. **Secondary waypoint types** (moderate match, weight 0.5)
3. **VibeClass affinity** (bonus points for matching city vibe)

### Persona Definitions

```typescript
interface PersonaConfig {
  id: string;
  label: string;
  icon: string;           // Lucide icon name
  accentColor: string;    // From design.md
  primaryTypes: WaypointType[];
  secondaryTypes: WaypointType[];
  vibeAffinities: VibeClass[];  // Cities with these vibes get bonus
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    icon: 'Compass',
    accentColor: '#58a6ff',
    primaryTypes: ['landmark', 'viewpoint', 'hidden_gem'],
    secondaryTypes: ['nature', 'culture'],
    vibeAffinities: [],  // No preference — default persona
  },
  {
    id: 'outdoorsman',
    label: 'Outdoorsman',
    icon: 'Mountain',
    accentColor: '#3fb950',
    primaryTypes: ['nature', 'viewpoint'],
    secondaryTypes: ['landmark', 'hidden_gem'],
    vibeAffinities: ['FLUID_TROPIC'],  // Nature-rich cities
  },
  {
    id: 'foodie',
    label: 'Foodie',
    icon: 'UtensilsCrossed',
    accentColor: '#d29922',
    primaryTypes: ['food', 'drink'],
    secondaryTypes: ['shopping', 'culture'],
    vibeAffinities: ['DECAY_CHIC'],  // Historic food culture cities
  },
  {
    id: 'gearhead',
    label: 'Gearhead',
    icon: 'Car',
    accentColor: '#f85149',
    primaryTypes: ['landmark', 'viewpoint'],  // Scenic drives, car museums
    secondaryTypes: ['hidden_gem', 'nature'],
    vibeAffinities: ['BRUTAL_GRIT', 'NEON_GRID'],  // Industrial/neon cities
  },
  {
    id: 'culture',
    label: 'Culture Buff',
    icon: 'Palette',
    accentColor: '#bc8cff',
    primaryTypes: ['culture', 'landmark'],
    secondaryTypes: ['food', 'hidden_gem'],
    vibeAffinities: ['DECAY_CHIC', 'BRUTAL_GRIT'],  // Historic cities
  },
  {
    id: 'nerd',
    label: 'Boardgamer',
    icon: 'Dice5',
    accentColor: '#0ff',
    primaryTypes: ['shopping', 'culture'],  // Game shops, museums
    secondaryTypes: ['food', 'drink', 'hidden_gem'],
    vibeAffinities: ['NEON_GRID'],  // Tech/modern cities
  },
];
```

### Scoring Formula

```typescript
function scoreWaypoint(
  waypoint: Waypoint,
  persona: PersonaConfig,
  cityVibeClass: VibeClass | undefined,
  detourMinutes: number
): number {
  // Base score from trending (0-100)
  let score = waypoint.trending_score;

  // Type relevance multiplier
  if (persona.primaryTypes.includes(waypoint.type)) {
    score *= 1.0;  // Full weight
  } else if (persona.secondaryTypes.includes(waypoint.type)) {
    score *= 0.5;  // Half weight
  } else {
    score *= 0.1;  // Minimal weight (still shown but ranked low)
  }

  // Vibe affinity bonus (+20% if city vibe matches persona preference)
  if (cityVibeClass && persona.vibeAffinities.includes(cityVibeClass)) {
    score *= 1.2;
  }

  // Detour efficiency penalty (prefer stops that are easy to reach)
  // A stop 10 min off route is 6x better than one 60 min off route
  const efficiencyFactor = Math.max(0.2, 1 - (detourMinutes / 120));
  score *= efficiencyFactor;

  return score;
}
```

---

## Session-by-Session Plan

### Session 1: Next.js Scaffold + Dark Theme

**Goal:** Empty Next.js 16 app with Tailwind, dark industrial theme, and project structure.

**What to build:**
- `npx create-next-app@latest` with TypeScript, App Router, Tailwind CSS v4
- Configure `tailwind.config.ts` with design.md colors as CSS custom properties
- Create root layout with dark background (#0a0a0a), font stacks from design.md
- Set up `src/` directory structure:
  - `src/app/` (App Router pages)
  - `src/lib/` (shared utilities)
  - `src/components/` (React components)
  - `src/lib/personas/` (persona definitions)
  - `src/lib/urban-explorer/` (data access layer)
- Add ESLint, TypeScript strict mode
- Create a landing page placeholder with the dark theme applied

**Key files to create:**
- `package.json` (with deps: next, react, tailwindcss, lucide-react, zod)
- `src/app/layout.tsx` (root layout with fonts, meta tags from design.md)
- `src/app/page.tsx` (placeholder landing)
- `src/app/globals.css` (Tailwind directives + custom properties)
- `next.config.ts` (base config, CSP headers stub)
- `tsconfig.json` (strict mode, path aliases)

**UE patterns to reuse:**
- Font setup from UE layout.tsx (Geist + Geist_Mono)
- Meta viewport pattern from design.md

**Testing criteria:**
- `npm run build` succeeds
- `npm run dev` shows dark-themed page at localhost:3000
- No TypeScript errors, no lint warnings

---

### Session 2: Firebase/Firestore Connection

**Goal:** Read-only connection to the `urbanexplorer` named Firestore database with Admin SDK for server-side reads.

**What to build:**
- Copy and adapt `firebase.ts` (client SDK) from Urban Explorer
- Copy and adapt `firebaseAdmin.ts` (Admin SDK) from Urban Explorer
- Copy `vibeCacheTypes.ts` schemas exactly (Zod types are shared)
- Create simplified `vibeCacheRetrieval.ts` for Roadtripper (just `getCachedWaypoints` and city lookup — skip seasonal/lock logic)
- Copy `global_city_cache.json` (102 cities with lat/lng/vibeClass)
- Create a test API route `GET /api/test-firestore` that fetches one city's waypoints and returns count
- Add environment variables to `.env.local` template

**Key files to create:**
- `src/lib/firebase.ts` (client init — same Firebase project, same named DB)
- `src/lib/firebaseAdmin.ts` (Admin SDK — reuse FIREBASE_SERVICE_ACCOUNT_KEY)
- `src/lib/urban-explorer/schemas.ts` (copy of vibeCacheTypes.ts)
- `src/lib/urban-explorer/data-access.ts` (simplified retrieval: getCachedWaypoints, lookupCity, getAllCities)
- `src/data/global_city_cache.json` (copy from UE)
- `src/app/api/test-firestore/route.ts` (verification endpoint)
- `.env.local.example` (template with all required env vars)

**UE patterns to reuse:**
- Exact `firebase.ts` and `firebaseAdmin.ts` initialization
- `vibeCacheTypes.ts` Zod schemas verbatim
- `haversineKm()` function from `vibeCacheRetrieval.ts`
- `lookupCity()` and `resolveLocationToCity()` functions
- Flat mirror collection queries (`vibe_neighborhoods`, `vibe_waypoints`)

**Testing criteria:**
- `/api/test-firestore` returns waypoint count for a known city (e.g., "tokyo")
- `npm run build` succeeds
- No writes to urbanexplorer database (verify in Firestore console)

---

### Session 3: Clerk Auth Integration

**Goal:** User authentication with Clerk, protecting future saved-trip routes.

**What to build:**
- Install `@clerk/nextjs`
- Create `src/middleware.ts` with route matcher (protect `/trips/saved`, `/profile`)
- Add `ClerkProvider` to root layout
- Add sign-in/sign-up buttons to a minimal header/nav
- Configure Clerk environment variables

**Key files to create:**
- `src/middleware.ts` (copy pattern from UE, adjust protected routes)
- `src/app/layout.tsx` (wrap with ClerkProvider)
- `src/components/Header.tsx` (minimal nav with auth buttons)

**UE patterns to reuse:**
- Exact `middleware.ts` pattern with `createRouteMatcher`
- `ClerkProvider` wrapping in layout.tsx
- CSP headers for `*.clerk.accounts.dev`

**Testing criteria:**
- Sign in/out works in browser
- Protected route redirects to sign-in
- `npm run build` succeeds

---

### Session 4: Google Maps Setup + Route Display

**Goal:** Render a Google Map with the ability to display a route polyline.

**What to build:**
- Install `@vis.gl/react-google-maps`
- Create `RouteMap` component (extends UE's GoogleMap pattern)
- Add `DirectionsRenderer` to display a route polyline on the map
- Add custom dark map styling (to match #0a0a0a aesthetic)
- Add persona-colored route lines (configurable stroke color)
- Create map layout: side panel (35%) + map (65%) on desktop
- Update CSP headers for Google Maps domains

**Key files to create:**
- `src/components/map/RouteMap.tsx` (main map with directions rendering)
- `src/components/map/BoundsFitter.tsx` (from UE pattern)
- `src/components/map/StopMarker.tsx` (custom marker with persona color)
- `src/components/layout/MapLayout.tsx` (responsive split layout)
- `src/app/plan/page.tsx` (main planning page with map layout)

**UE patterns to reuse:**
- `APIProvider` + `Map` + `AdvancedMarker` from GoogleMap.tsx
- `BoundsFitter` component
- `useOnlineStatus` hook
- CSP headers for `*.googleapis.com`, `*.gstatic.com`

**Testing criteria:**
- Map renders at `/plan` with dark styling
- Responsive layout: 65/35 split on desktop, full map on mobile
- Map loads without CSP violations

**Note:** Route display will be wired up in Session 7 when Directions API is integrated. This session just sets up the map container and components.

---

### Session 5: City Autocomplete Input

**Goal:** Start/end city input with autocomplete against the 102 Urban Explorer cities.

**What to build:**
- Create `CityAutocomplete` component that searches `global_city_cache.json`
- Fuzzy matching by city name, aliases, and country
- Display city name + country + vibeClass badge in dropdown
- Two instances: "Start" and "End" city
- Store selected cities in component state (lifted to plan page)
- No Google Places autocomplete needed — we only support UE cities

**Key files to create:**
- `src/components/inputs/CityAutocomplete.tsx` (search + dropdown)
- `src/components/inputs/CityBadge.tsx` (selected city display with vibe color)
- `src/lib/urban-explorer/city-search.ts` (fuzzy search logic using global cache)

**UE patterns to reuse:**
- `lookupCity()` and city cache indexing from `vibeCacheRetrieval.ts`
- City type definitions from `vibeCacheTypes.ts`

**Testing criteria:**
- Typing "new" shows "New York City" and "New Orleans"
- Selecting a city displays its name and vibeClass
- Start and End inputs work independently
- Keyboard navigation works (arrow keys, enter to select)

---

### Session 6: Drive Time Budget Selector

**Goal:** UI component for setting daily maximum drive time.

**What to build:**
- `TimeBudgetSelector` component: slider or stepper from 2h to 10h in 30-min increments
- Visual time budget bar (from design.md: green/amber/red fill)
- Display current selection in monospace: `6h 00m`
- Default: 6 hours
- Store value in plan page state

**Key files to create:**
- `src/components/inputs/TimeBudgetSelector.tsx`
- `src/components/display/TimeBudgetBar.tsx` (horizontal progress bar)

**UE patterns to reuse:** None directly — new UI component.

**Testing criteria:**
- Slider adjusts from 2h to 10h in 30-min steps
- Current value displays in monospace
- Bar color changes: green (<50%), amber (50-80%), red (>80%)

---

### Session 7: Route Calculation (Directions API)

**Goal:** Calculate and display the driving route between start and end cities.

**What to build:**
- Server action or API route: `POST /api/route/calculate`
  - Input: start city lat/lng, end city lat/lng
  - Call Google Maps Directions API (server-side, using GOOGLE_MAPS_KEY)
  - Return: route polyline, total duration, total distance, leg details
- Wire up the route response to the `RouteMap` component
- Display route summary: total time, total distance
- Render the route polyline on the map using `DirectionsRenderer` or a `Polyline` component
- Cache route results server-side (keyed by start+end city IDs, TTL 1 hour)

**Key files to create:**
- `src/app/api/route/calculate/route.ts` (Directions API wrapper)
- `src/lib/maps/directions.ts` (Google Maps Directions service wrapper)
- `src/lib/maps/polyline.ts` (decode polyline utility)
- `src/lib/maps/cache.ts` (in-memory or Redis cache for route results)
- `src/components/display/RouteSummary.tsx` (time + distance display)

**UE patterns to reuse:**
- Rate limiting from `rateLimit.ts` (protect API route)
- Server-side API key pattern (GOOGLE_MAPS_KEY, not NEXT_PUBLIC_)

**Testing criteria:**
- Selecting NYC → Miami calculates route and shows polyline on map
- Route summary shows ~19h drive time, ~2,000km
- API route is rate-limited
- Cached results return instantly on second request

---

### Session 8: Stop Recommendation Engine (CORE IP)

**Goal:** Implement the three-phase recommendation pipeline described in the Critical Algorithm section.

**What to build:**

**Phase 1 — Geometric Pre-filter:**
- `src/lib/recommendations/geo-filter.ts`
  - `samplePolylineEveryNKm()`: decode polyline, sample at intervals
  - `getCandidateCities()`: filter 102 cities by Haversine distance to route samples
  - Buffer: 120km from route

**Phase 2 — Drive-Time Validation:**
- `src/lib/recommendations/detour-calculator.ts`
  - For each candidate city, find nearest route sample point
  - Batch Distance Matrix API call: route-points → candidate cities
  - Calculate round-trip detour time
  - Filter to cities within 60-minute one-way detour (120 min round-trip)
- `src/app/api/route/recommendations/route.ts`
  - Orchestrates Phase 1 + Phase 2 + Phase 3
  - Returns scored, ranked waypoint recommendations

**Phase 3 — Waypoint Retrieval:**
- `src/lib/recommendations/waypoint-scorer.ts`
  - Fetch waypoints for validated cities via `getCachedWaypoints()`
  - Score by trending_score and detour efficiency
  - Return top N recommendations per city

**Integration:**
- Wire recommendations into the plan page sidebar
- Display recommendation cards with waypoint name, city, type, detour time
- Show candidate cities as markers on the map

**Key files to create:**
- `src/lib/recommendations/geo-filter.ts`
- `src/lib/recommendations/detour-calculator.ts`
- `src/lib/recommendations/waypoint-scorer.ts`
- `src/lib/recommendations/pipeline.ts` (orchestrator)
- `src/app/api/route/recommendations/route.ts`
- `src/components/recommendations/RecommendationCard.tsx`
- `src/components/recommendations/RecommendationList.tsx`

**UE patterns to reuse:**
- `haversineKm()` from `vibeCacheRetrieval.ts`
- `getCachedWaypoints()` query pattern
- `global_city_cache.json` for city coordinates
- Rate limiting for API route

**Testing criteria:**
- NYC → Miami route produces recommendations from Philadelphia, Washington DC, and other east coast cities
- No recommendations appear for cities far from route (e.g., Seattle)
- Detour times are reasonable (validated against Google Maps manual check)
- Phase 1 runs in <10ms
- Total pipeline completes in <3 seconds

---

### Session 9: Dynamic Route Recalculation

**Goal:** When a user adds a recommended stop, recalculate the route to include it as a waypoint.

**What to build:**
- "Add to Route" button on each recommendation card
- Trip state management: ordered list of stops (start → [added stops] → end)
- When a stop is added:
  - Insert it into the stop list at the geographically logical position
  - Recalculate route via Directions API with waypoints
  - Update route polyline on map
  - Update total drive time display
  - Re-run recommendation engine for the new route shape
- "Remove from Route" button on added stops
- Time budget enforcement: warn (amber) or block (red) if adding a stop exceeds daily budget

**Key files to create:**
- `src/lib/trip/trip-state.ts` (trip state management — ordered stops, add/remove)
- `src/lib/trip/stop-ordering.ts` (insert stop at optimal position in route)
- `src/components/trip/TripItinerary.tsx` (sidebar list of added stops)
- `src/components/trip/StopCard.tsx` (added stop card with remove button)
- `src/components/trip/DriveSegment.tsx` (time/distance between stops)

**UE patterns to reuse:**
- None directly — new interaction pattern

**Testing criteria:**
- Adding Philadelphia to NYC→Miami route updates the polyline through Philly
- Total drive time increases by the detour amount
- Removing the stop reverts to original route
- Exceeding time budget shows warning
- Recommendations refresh after adding a stop

---

### Session 10: Persona Selector + Filtered Recommendations (MVP Complete)

**Goal:** Persona selector UI that filters and re-ranks recommendations.

**What to build:**
- `PersonaSelector` component: horizontal pill row per design.md
- Persona definitions in `src/lib/personas/definitions.ts`
- Persona-to-waypoint-type mapping (see Persona-to-Data Mapping section)
- When persona changes:
  - Re-score existing recommendations using persona weights
  - Re-sort recommendation list
  - Update route line color to persona accent
  - Update map markers to persona accent color
- Default persona: Explorer (shows all types equally)

**Key files to create:**
- `src/lib/personas/definitions.ts` (PersonaConfig array)
- `src/lib/personas/types.ts` (TypeScript types)
- `src/components/personas/PersonaSelector.tsx` (pill row UI)
- Update `src/lib/recommendations/waypoint-scorer.ts` to accept persona parameter

**UE patterns to reuse:**
- VibeClass type from `vibeCacheTypes.ts`
- WaypointType enum from `vibeCacheTypes.ts`

**Testing criteria:**
- Selecting "Foodie" promotes food/drink waypoints to top of list
- Selecting "Outdoorsman" promotes nature/viewpoint waypoints
- Route line color changes with persona selection
- Map markers update color
- Explorer (default) shows balanced recommendations
- Switching persona does NOT lose added stops

---

## Post-MVP Sessions (Polish Phase)

### Session 11: Multi-Day Itinerary View
- Split total route into days based on drive time budget
- Day dividers per design.md (monospace, horizontal rule)
- "DAY 1", "DAY 2" headers with cumulative drive time

### Session 12: Mobile Bottom Sheet
- Bottom sheet on mobile (<768px) using CSS transforms
- Swipe up to expand, swipe down to minimize
- Three states: collapsed (peek), half, full

### Session 13: Trip Save/Load
- Separate Firestore collection (NOT in urbanexplorer DB)
- Save: trip name, stops, persona, budget → user's collection
- Load: list saved trips, restore state

### Session 14: Trip Export (PDF/Share)
- Generate PDF itinerary with stop details and map screenshot
- Share link with encoded trip state

### Session 15: Drag-to-Reorder Stops
- Drag handle on stop cards
- Reorder triggers route recalculation
- Constrained to within-day reordering

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Distance Matrix API cost | High per-element cost at scale | Aggressive caching (1hr TTL), batch requests, geometric pre-filter reduces candidates to <20 |
| Only 17 US cities in UE database | Many US road trips pass through cities not in DB | MVP focuses on corridors with good coverage (East Coast, West Coast). Document as known limitation. |
| Polyline sampling accuracy | Sampled points may miss route curves | Sample every 25-50km; use 120km buffer (2x the 60-min target) to compensate |
| Drive time estimation vs. actual | Traffic, construction change real times | Use "best guess" traffic model; display as estimates with disclaimer |
| Directions API waypoint limit | Google Directions API allows max 25 waypoints | Unlikely to exceed for MVP; enforce max 20 added stops |
| Firestore read costs | Querying waypoints for many cities | Cache all waypoint queries (UE pattern); global city cache is local JSON |
| Named database access | Both UE and Roadtripper read same named DB | Read-only access; no write operations; same Firebase project credentials |

---

## Key Architecture Decisions

1. **Server-side route calculation**: All Google Maps API calls happen server-side (API routes) to protect API keys and enable caching. Client only receives processed results.

2. **Local city cache**: The 102-city dataset is a static JSON file bundled with the app. No Firestore reads needed for city lookups or geometric filtering.

3. **Three-phase recommendation pipeline**: Separating geometric filtering (free) from drive-time validation (paid API) from waypoint retrieval (Firestore) minimizes cost and latency.

4. **Persona as a scoring layer, not a filter**: Personas re-weight results rather than hard-filtering. A foodie still sees landmarks — they are just ranked lower. This prevents empty result sets.

5. **Same Firebase project**: Roadtripper uses the same Firebase project and `urbanexplorer` named database as Urban Explorer. Same credentials, same service account. Only the Next.js app is separate.

6. **Trip state is client-side for MVP**: No persistence until Session 13. Trip state lives in React state/context. This simplifies the MVP and avoids needing a second Firestore database immediately.
