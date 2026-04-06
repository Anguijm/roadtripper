# Roadtripper Learnings

Accumulated knowledge from building and iterating on Roadtripper. Read this before every session. Update after every session.

Format:
```
### [Feature/Area] (YYYY-MM-DD)
- **KEEP**: [technique] — [why it worked]
- **IMPROVE**: [issue] — [what was found] — [how to fix next time]
- **DISCARD**: [approach] — [why it failed]
- **INSIGHT**: [generalizable principle]
- **TEST CAUGHT**: [bug] — would have shipped broken without testing
```

---

## Inherited from Urban Explorer

### Firestore Cache-First Pattern
- **KEEP**: Named database (`urbanexplorer`) with composite indexes — sub-second reads
- **KEEP**: Flat mirror collections (`vibe_neighborhoods`, `vibe_waypoints`) for fast queries alongside hierarchical structure
- **INSIGHT**: Always query flat mirrors for list views, hierarchical collections for detail views
- **INSIGHT**: Firestore composite indexes must be deployed before queries work — check `firestore.indexes.json`

### Google Maps Integration
- **KEEP**: CSP headers must include `*.googleapis.com` and `*.gstatic.com` for map rendering
- **INSIGHT**: Distance Matrix API has per-element billing — batch requests, cache results aggressively

### Next.js + Firebase
- **KEEP**: Server Components read directly from Firestore Admin SDK — no client-side fetching for initial data
- **KEEP**: Clerk middleware must run before Firebase auth checks
- **INSIGHT**: Firebase App Hosting deploys are slow (~3-5 min) — test locally with `next dev` first

---

## Session Learnings

### Session 1: Project Init + Firebase (2026-04-04)
- **KEEP**: Copying firebase.ts and firebaseAdmin.ts patterns verbatim from UE — worked first try
- **KEEP**: Using ADC (gcloud auth application-default login) instead of service account key — simpler local dev
- **IMPROVE**: Assumed `global_city_cache` was a Firestore collection — it's actually `cities`. Always run `listCollections()` first to verify actual schema.
- **IMPROVE**: Firebase Admin SDK with ADC needs explicit `projectId` — doesn't auto-detect from gcloud config
- **INSIGHT**: The `global_city_cache.json` file is a local data export, not a mirror of a Firestore collection name. Use it for static lookups, use `cities` collection for Firestore queries.
- **INSIGHT**: Zod v4 import path is `zod/v4` — different from v3's `zod`
- **TEST CAUGHT**: 500 error on test page revealed missing projectId — would have shipped broken without the manual curl verification

### Session 2: Clerk Auth + Google Maps (2026-04-04)
- **KEEP**: Copying CSP headers from UE next.config.ts — proven pattern, just strip ad-related domains
- **IMPROVE**: @clerk/nextjs v7 has breaking API changes from v6 — SignedIn/SignedOut exports removed, use useAuth() hook instead. Always check package version before copying import patterns.
- **IMPROVE**: @clerk/themes package doesn't exist in v7 — dark theme must be configured via appearance prop or CSS
- **INSIGHT**: Clerk v7 auth state requires client components — extracted AuthButtons.tsx as a "use client" wrapper to keep page.tsx as server component
- **INSIGHT**: Google Maps dark styling uses MapTypeStyle array (not mapId) for custom colors — works without a Cloud Console map style ID
- **INSIGHT**: Google Maps Directions renderer needs to be cleaned up on unmount (setMap(null)) to prevent memory leaks

### Tightening Pass (2026-04-07)
- **KEEP**: Firestore deny-by-default with explicit allow rules per collection — clean security posture
- **KEEP**: Agent-based council reviews (3 parallel general-purpose Agents) when harness-cli is unavailable — proven effective on the Firebase hosting decision
- **INSIGHT**: Firebase App Hosting needs `firebase apphosting:secrets:grantaccess` (not the generic `gcloud secrets add-iam-policy-binding`) — App Hosting uses a different SA than the compute SA
- **INSIGHT**: GitHub-dark tones (#0d1117 family) read much better than pure black for UI — pure black eliminates depth perception between layers

### Session 3: Route Input UI (2026-04-07)
- **KEEP**: Routes API v2 (`routes.googleapis.com/directions/v2:computeRoutes`) over legacy Directions API — newer, returns encoded polyline + viewport in one call
- **KEEP**: URL search params for trip state (`/plan?from=...&to=...&budget=...`) — shareable, bookmarkable, no client state library needed
- **KEEP**: Google Places Autocomplete via @vis.gl/react-google-maps `useMapsLibrary("places")` — clean React integration, no manual script loading
- **KEEP**: Pill-style budget selector over slider — better mobile UX, fewer accidental changes
- **INSIGHT**: Server-side `computeRoute` uses GOOGLE_MAPS_KEY (server only), client uses NEXT_PUBLIC_GOOGLE_MAPS_KEY — security council recommendation paid off, separation enforced
- **INSIGHT**: RouteMap accepting precomputed encodedPolyline avoids a second Directions call when the route was already computed server-side — saves API quota and latency
- **INSIGHT**: APIProvider must be re-instantiated per page if libraries differ (places vs geometry) — could lift to root layout but each page requesting only what it needs is cleaner

### Session 4 + 4.5: Stop Recommendation + Council Retro (2026-04-07)
- **KEEP**: Two-phase pipeline (geometric pre-filter → drive-time validation) is the right shape — saves 95%+ of API calls vs validating every city
- **KEEP**: Routes API v2 `computeRouteMatrix` over legacy Distance Matrix — same data, billed per pair instead of N² (25x cost reduction on this hot path)
- **KEEP**: In-memory LRU cache keyed by (polylineHash, detourCap) — same query reruns are free
- **KEEP**: Detour cap scaled from user budget — NYC→Miami at 4h budget gets 60min cap which lets DC pass at ~57min round-trip
- **KEEP**: Custom error types (RoutesApiError, InvalidRouteParamsError) over plain Error — caller can branch on type
- **IMPROVE**: I shipped Sessions 1-4 without council review even though program.md said to. The council exists to prevent design errors before they cement, not to consult when stuck. Updated skills/10-build.md to make council a numbered, non-skippable step before EXECUTE.
- **IMPROVE**: First samplePolyline impl snapped to next vertex — silently missed cities along long highway segments. Now interpolates at the exact interval distance.
- **IMPROVE**: First geometricFilter used the nearest sample as nearestRoutePoint — up to 25km of slop inflated detour times. Now projects onto the full decoded polyline.
- **IMPROVE**: Initial detour formula `Math.min(90, budget * 12)` was too tight at budget=4 (cap=48 missed DC at ~57). Recalibrated to `Math.min(120, Math.max(45, budget * 15))`.
- **IMPROVE**: First validateDetourTimes used the legacy Distance Matrix "pairs trick" (N origins × N destinations, read diagonal) — billed N² to use N. Migrated to computeRouteMatrix.
- **DISCARD**: Throwing API response bodies in Error messages — risk of leaking keys in logs. Strip to status code only.
- **INSIGHT**: Distance Matrix vs Routes API matrix returns elements in arbitrary order — must build a Map keyed by (originIndex, destinationIndex), not assume array order
- **INSIGHT**: Same code can produce different polylines locally vs production because TRAFFIC_AWARE routing varies by time of day. The "highway exit point" projected onto a slightly different polyline can shift detour times by ~20 minutes. Calibration must accommodate this jitter.
- **INSIGHT**: Council retro reviews are cheap (3 parallel agents, ~80s) and high-value. Use them as a default, not as a last resort.
- **TEST CAUGHT**: Live curl smoke test caught the "only 2 candidates" bug after deploy. Without checking the production response, I'd have shipped a recommendation engine that filtered out the most relevant cities.
