# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-04-28** (Session 11 — PR #7 merged).

## Now (this week)

- **PolylineRenderer marker diff**: candidate-marker rebuild on every refresh causes visible flicker on Add. Fix with `id → marker` map and diff. 4-effect split is load-bearing, don't collapse.

## Next (queued, scoped)

- **PolylineRenderer marker diff**: candidate-marker rebuild on every refresh causes visible flicker on Add. Fix with `id → marker` map and diff. 4-effect split is load-bearing, don't collapse.
- **Click-to-select neighborhood panel**: panel shows for last-added stop. User should click any Itinerary stop to switch. Needs a lightweight separate Server Action (neighborhood-only, no route recompute) to avoid burning rate-limit budget.
- **Off-corridor indicator in Itinerary**: subtle badge for stops no longer in the refreshed candidate list (Council S7-PROD deferred).
- **Mobile bottom sheet**: 360px aside doesn't fit phones; 20/55/92 snap points (Session 5 council deferred).

## Someday (architectural ideas, daydreams)

- Save/load trips: biggest net-new surface. Needs Firestore schema + Clerk-scoped storage in `saved_hunts` + trip-list view.
- "Optimize stop order" toggle wrapping Routes API `optimizeWaypointOrder`.
- Map polygon rendering for neighborhoods (schema doesn't carry polygons today).
- Locales beyond `en` in the UI. Schema supports 7 locales via `LocalizedTextSchema`; `localizedText(text, locale)` centralizes the path. i18n switch is one file.
- External CAS state for council monthly-budget counter (documented cross-PR race in GH Actions cache; GCP budget alert is current backstop).
- Move post-commit hook artifacts off the working tree so `gh pr merge` stops requiring a pre-merge stash.
- Persona-aware neighborhood ranking (trending_score + persona weights, S8 deferred).
- CitySchema: reconcile local nested `location.{latitude,longitude}` divergence with upstream (deferred from city-atlas-service#26).
- `getAllCities` 24h TTL: consider a cache invalidation endpoint or shorter TTL if pipeline runs more than once/day.

## Open issues

None. (`gh issue list` returned empty as of 2026-04-28.)

## In flight

None.

## Completed this session (S10+S11, 2026-04-28)

- ✓ PR #5 `43ff9ec` — Vitest scaffold, 41 unit tests
- ✓ PR #6 `a3b03b7` — SHA-256 for all cache key helpers
- ✓ PR #7 `18b7ee5` — getAllCities/lookupCity live Firestore read; city_fallback.json; 53 unit tests; 7 council rounds ([skip council] on R7 — fabricated lat/lng non-negotiable)
- ✓ Step 9 latency assertion: 1150ms cold, under budget
- ✓ Upstream city-atlas-service#26 confirmed merged; cityAtlas.ts comment updated

## Scheduled remote agents

- **`trig_01YHMwS7gNTrnNqYY7AHhrpX` — Council v2 30-day kill-criteria check.** One-time, fires `2026-05-26T00:00:00Z` (= 2026-05-26 09:00 JST). Pulls PR cycle-time data, council compliance tally, cost estimate. Opens draft rollback PR if any criterion tripped, otherwise "paying off" status issue. Manage: https://claude.ai/code/routines/trig_01YHMwS7gNTrnNqYY7AHhrpX
