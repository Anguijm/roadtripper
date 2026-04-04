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

(Entries added after each development session)
