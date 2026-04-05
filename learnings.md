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
