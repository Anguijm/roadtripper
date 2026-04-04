# Roadtripper Implementation Plan

## Context

Roadtripper is a road trip planner that recommends persona-themed stops along a driving route using the Urban Explorer Firestore database (102 cities, 23 in North America). The scaffold is complete (program.md, design.md, skills, harness, Claude Code config). This plan takes us from scaffold to MVP.

**MVP definition:** User enters start/end US cities + daily drive budget, sees a route on a map, gets persona-filtered stop recommendations from Urban Explorer data, adds stops, route recalculates. That's the core loop.

**Key constraint:** Only 17 US cities in the database. Viable corridors: East Coast (Boston→NYC→Philly→DC→Miami), West Coast (Seattle→Portland→SF→LA→San Diego), Southwest (LA→Phoenix→Las Vegas→Denver), Texas (Austin→New Orleans). Midwest/Plains are sparse.

---

## The Stop Recommendation Algorithm (Core IP)

This is the hardest problem and drives the architecture. Three-phase pipeline:

### Phase 1: Geometric Pre-filter (zero API cost, <10ms)
1. Decode the Google Directions polyline into lat/lng points
2. Sample every ~50km along the polyline
3. For each of the 102 UE cities, compute Haversine distance to the nearest sample point
4. Keep cities within 120km buffer (generous — real drive detour validated in Phase 2)
5. Reuse `haversineKm()` from `urban-explorer/src/lib/vibeCacheRetrieval.ts:97`

### Phase 2: Drive-Time Validation (1-2 Distance Matrix API calls)
1. For ~5-15 geometric candidates, batch a Distance Matrix request
2. Origins: nearest route waypoints. Destinations: candidate city lat/lngs
3. Keep cities where round-trip detour is within the user's daily budget tolerance (+/- 60 min)
4. Attach `detourMinutes` to each validated city for scoring

### Phase 3: Waypoint Retrieval + Persona Scoring (Firestore cached reads)
1. For validated cities, call `getCachedWaypoints(cityId)` (reuse UE pattern)
2. Score each waypoint: `trending_score * typeWeight * vibeBonus * (1 / detourMinutes)`
3. Persona defines `typeWeight` (1.0 primary, 0.5 secondary, 0.2 other) and `vibeBonus` (1.2x for preferred vibeClass)
4. Return top N waypoints per city, grouped by day based on drive budget

### Persona-to-Data Mapping

| Persona | Primary Types (1.0) | Secondary (0.5) | Preferred Vibes |
|---------|---------------------|------------------|-----------------|
| Outdoorsman | nature, viewpoint | landmark, hidden_gem | FLUID_TROPIC, BRUTAL_GRIT |
| Foodie | food, drink | shopping, culture | DECAY_CHIC, FLUID_TROPIC |
| Gearhead | landmark, viewpoint | hidden_gem, nature | BRUTAL_GRIT, NEON_GRID |
| Culture Buff | culture, landmark | food, hidden_gem | DECAY_CHIC, NEON_GRID |
| Nerd | hidden_gem, culture | shopping, food | NEON_GRID, DECAY_CHIC |

Scoring is a **ranking layer, not a filter** — every persona sees all waypoints, just differently ordered. This prevents empty results.

---

## Session Plan (10 sessions to MVP)

### Session 1: Project Init + Firebase Connection
**Goal:** Next.js app runs, reads from Urban Explorer Firestore

**Build:**
- `npx create-next-app@latest` with TypeScript, Tailwind, App Router
- Copy `firebase.ts` and `firebaseAdmin.ts` patterns from Urban Explorer
- Copy `vibeCacheTypes.ts` (Zod schemas) verbatim
- Create `src/lib/urban-explorer/cities.ts` — load `global_city_cache.json`, export lookup functions
- Create a test page `/test` that lists all 102 cities from Firestore to verify connection
- Set up `.env.local` with Firebase config, service account key
- `git init`, initial commit

**Key files to create:**
- `src/lib/firebase.ts` (from `urban-explorer/src/lib/firebase.ts`)
- `src/lib/firebaseAdmin.ts` (from `urban-explorer/src/lib/firebaseAdmin.ts`)
- `src/lib/urban-explorer/types.ts` (from `urban-explorer/src/lib/vibeCacheTypes.ts`)
- `src/lib/urban-explorer/cities.ts` (city lookup, haversine, nearby)
- `src/app/test/page.tsx` (verification page)
- `.env.local`, `.gitignore`

**Verify:** `/test` page renders 102 city names from Firestore.

---

### Session 2: Clerk Auth + Google Maps Setup
**Goal:** Auth works, map renders with route polyline

**Build:**
- Install `@clerk/nextjs`, configure middleware (copy UE pattern)
- Install `@vis.gl/react-google-maps`
- Create `src/components/RouteMap.tsx` — Google Map with Directions renderer
- Copy CSP header patterns from `urban-explorer/next.config.ts` for Maps + Clerk
- Create `/` landing page with a map showing a hardcoded test route (NYC→DC)
- Set up `apphosting.yaml` with Firebase secrets

**Key files to create:**
- `src/middleware.ts` (from `urban-explorer/src/middleware.ts`)
- `src/components/RouteMap.tsx`
- `next.config.ts` (CSP headers)
- `apphosting.yaml`

**Verify:** Map renders. Hardcoded route polyline visible. Sign-in/out works.

---

### Session 3: Route Input UI
**Goal:** User can enter start/end cities and see the route

**Build:**
- Create `src/components/RouteInput.tsx` — start city, end city, daily drive budget
- Google Places Autocomplete for city input (restrict to US cities initially)
- Drive budget selector: slider or dropdown (2h, 3h, 4h, 5h, 6h, 8h)
- On submit: call Google Maps Directions API, render route on map
- Extract route polyline + total duration + leg durations
- Create `src/lib/routing/directions.ts` — server action wrapping Directions API

**Key files to create:**
- `src/components/RouteInput.tsx`
- `src/lib/routing/directions.ts` (server action)
- `src/app/plan/page.tsx` (main planning page)

**Verify:** Enter "New York" → "Miami", see route on map with total drive time displayed.

---

### Session 4: Stop Recommendation Engine (Phase 1 + 2)
**Goal:** Given a route, find candidate cities within detour budget

**Build:**
- Create `src/lib/routing/candidates.ts`:
  - `samplePolyline(encodedPolyline, intervalKm)` — decode + sample
  - `geometricFilter(cities, samplePoints, bufferKm)` — Haversine pre-filter
  - `validateDetourTimes(candidates, routePoints)` — Distance Matrix API call
- Create `src/app/api/candidates/route.ts` — API route that takes encoded polyline + budget, returns validated cities
- Display candidate cities as markers on the map

**Key files to create:**
- `src/lib/routing/candidates.ts`
- `src/lib/routing/polyline.ts` (Google polyline decoder)
- `src/app/api/candidates/route.ts`

**Verify:** NYC→Miami route shows markers for DC, Philadelphia, Miami as candidate cities.

---

### Session 5: Waypoint Recommendations + Basic Persona
**Goal:** Candidate cities show ranked waypoints, persona changes ranking

**Build:**
- Create `src/lib/personas/index.ts` — persona definitions with type weights and vibe affinities
- Create `src/lib/routing/recommend.ts`:
  - `scoreWaypoints(waypoints, persona, detourMinutes)` — the scoring function
  - `getRecommendations(candidateCities, persona)` — full pipeline
- Create `src/components/RecommendationList.tsx` — scrollable list of waypoint cards
- Create `src/components/PersonaSelector.tsx` — horizontal pill row
- Wire it together: select persona → recommendations re-rank

**Key files to create:**
- `src/lib/personas/index.ts` (persona definitions)
- `src/lib/personas/types.ts` (PersonaId, PersonaConfig types)
- `src/lib/routing/recommend.ts`
- `src/components/RecommendationList.tsx`
- `src/components/PersonaSelector.tsx`

**Verify:** Switch persona from Foodie to Outdoorsman, see food waypoints drop and nature waypoints rise in ranking.

---

### Session 6: Stop Selection + Route Recalculation
**Goal:** User adds stops, route updates dynamically — the CORE LOOP is complete

**Build:**
- State management: `src/lib/state/trip.ts` — trip state with selected stops, route legs
- "Add to trip" button on waypoint cards → inserts stop into itinerary
- On stop added: recalculate route via Directions API with waypoints parameter
- Update map: show new route polyline through selected stops
- Remove stop: reverse the process
- Create `src/components/Itinerary.tsx` — ordered list of selected stops with drive times between them

**Key files to create:**
- `src/lib/state/trip.ts` (trip state management — React context or zustand)
- `src/components/Itinerary.tsx`
- Update `src/components/RouteMap.tsx` with waypoint markers

**Verify:** Add 2 stops between NYC and Miami. Route polyline updates to go through them. Remove one, route recalculates. **This is MVP.**

---

### Session 7: Day Planning + Drive Budget Enforcement
**Goal:** Multi-day trip with automatic day breaks based on drive budget

**Build:**
- `src/lib/routing/dayPlanner.ts`:
  - Given total route with stops + daily budget, split into days
  - Each day: drive time <= budget, suggest overnight city
  - Recalculate when stops added/removed
- Create `src/components/DayDivider.tsx` — "Day 2 — 4h 20m driving" headers
- Show per-day drive time vs budget indicator (green/amber/red bar)
- Update Itinerary component to group stops by day

**Key files to create:**
- `src/lib/routing/dayPlanner.ts`
- `src/components/DayDivider.tsx`
- `src/components/TimeBudgetBar.tsx`

**Verify:** NYC→Miami with 4h/day budget auto-splits into ~5 days. Adding a detour stop shifts subsequent days.

---

### Session 8: Persona Theming + Visual Polish
**Goal:** Each persona has distinct visual identity, app looks production-ready

**Build:**
- Implement `design.md` fully: persona accent colors on route lines, markers, cards
- Persona-colored route polyline on map
- Custom map markers with persona icon + accent color
- Apply dark industrial aesthetic from design.md across all components
- Mobile responsive: bottom sheet on <768px, sidebar on desktop
- Loading states and skeletons

**Key files to modify:**
- `src/app/globals.css` (design system CSS variables)
- `src/components/RouteMap.tsx` (persona-colored route)
- All component files (design polish)
- `src/app/plan/page.tsx` (responsive layout)

**Verify:** Switch personas, see route line color change. App looks cohesive on both mobile and desktop.

---

### Session 9: Save/Load Trips
**Goal:** Authenticated users can save and reload trip plans

**Build:**
- Create Roadtripper's own Firestore collection (NOT in urbanexplorer DB)
  - Option A: Use default Firestore database for roadtripper data
  - Option B: Create a new named database "roadtripper"
- `saved_trips/{tripId}` collection: userId, title, start, end, stops[], persona, budget, createdAt
- Server actions: `saveTrip.ts`, `loadTrip.ts`, `listTrips.ts`, `deleteTrip.ts`
- `/my-trips` page listing saved trips
- "Save Trip" button in the planning UI

**Key files to create:**
- `src/lib/roadtripper-db.ts` (Roadtripper's own Firestore init)
- `src/app/actions/saveTrip.ts`, `loadTrip.ts`, `listTrips.ts`
- `src/app/my-trips/page.tsx`
- Firestore security rules for roadtripper data

**Verify:** Save a trip, reload the page, load it back, see the same route + stops.

---

### Session 10: Trip Export + Share
**Goal:** Users can share or export their trip plan

**Build:**
- Share link: generate a shareable URL with trip data (encoded or via saved trip ID)
- PDF export: server-side route summary → PDF generation (or client-side print CSS)
- Share modal with copy-link button + QR code (reuse UE's qrcode dependency)
- Open Graph meta tags for shared trip links

**Key files to create:**
- `src/components/ShareModal.tsx`
- `src/app/trip/[id]/page.tsx` (public trip view)
- `src/app/api/export/route.ts` (PDF generation)

**Verify:** Share a trip link, open in incognito, see the trip displayed.

---

## Post-MVP Sessions (5)

11. **Drag-to-reorder stops** — reorder within a day, update route
12. **Mobile bottom sheet** — proper sheet UI with snap points for the itinerary
13. **Rate limiting + error handling** — Upstash Redis, graceful API failures
14. **Firebase App Hosting deployment** — production deploy, domain, SSL
15. **Cron: data freshness monitoring** — check UE data staleness, alert if cities go stale

---

## Dependencies Graph

```
Session 1 (Firebase) ──→ Session 2 (Auth + Maps) ──→ Session 3 (Route Input)
                                                          │
                                                          ▼
                                                    Session 4 (Candidates)
                                                          │
                                                          ▼
                                                    Session 5 (Recommendations + Persona)
                                                          │
                                                          ▼
                                                    Session 6 (Stop Selection + Recalc) ← MVP
                                                          │
                                              ┌───────────┼───────────┐
                                              ▼           ▼           ▼
                                        Session 7    Session 8    Session 9
                                        (Days)      (Visual)     (Save/Load)
                                              └───────────┼───────────┘
                                                          ▼
                                                    Session 10 (Export/Share)
```

Sessions 7, 8, 9 can run in parallel after MVP (Session 6).

---

## Key Risks

1. **Sparse city coverage** — A trip from Dallas to Nashville has zero UE cities between them. Mitigation: show a warning when coverage is thin, suggest well-covered corridors.
2. **Distance Matrix API cost** — Each call costs $5/1000 elements. Mitigation: geometric pre-filter reduces candidates to <15; cache results aggressively.
3. **Route recalculation latency** — Each Directions API call takes 200-500ms. Mitigation: debounce stop additions, optimistic UI updates.
4. **Waypoint relevance** — UE waypoints are curated for walking scavenger hunts, not road trip stops. Some waypoints (small cafes, street art) may not make sense as road trip destinations. Mitigation: persona scoring de-prioritizes low-relevance types; surface only top-scored waypoints.

---

## Environment Variables Needed

```
# Firebase (from Urban Explorer project)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_KEY=

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY=
GOOGLE_MAPS_KEY=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Rate Limiting (optional for dev)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## Verification Strategy

Each session ends with:
1. `npm run lint && npm run type-check && npm run build` (automated gates)
2. Manual browser verification of the session's feature
3. Gemini code review of changed files via MCP
4. Update `session_state.json` and `learnings.md`
