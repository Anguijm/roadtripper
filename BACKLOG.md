# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-04-27 10:20 UTC** (end of Session 9).

## Now (this week)

- **Step 9 — S8 latency assertion:** load live app, measure First-Add cold p50 in DevTools, verify ≤ S7 baseline + 200ms. If over, fall back to lazy-fetch on panel expand. Closes the last open S8 plan item.
- **Vitest scaffolding** (`chore: add vitest + firestore mocks`): bugs reviewer asks for unit tests every round; a scaffold gives them a place to land and should converge in 1 council round.
- **Check upstream [Anguijm/city-atlas-service#26](https://github.com/Anguijm/city-atlas-service/pull/26) status** before next schema work; carries the divergence fixes we filed.

## Next (queued, scoped)

- **`getAllCities` / `lookupCity` live-read migration**: currently reads from `src/data/global_city_cache.json`; migrate to live Firestore via `getCity`. No current bugs but JSON cache will drift.
- **SHA-256 for `candidateCacheKey` / `waypointsCacheKey`**: `charCodeAt`-loop helpers have a documented Unicode bug (non-BMP inputs). Inputs are ASCII-only today so theoretical, but fix is mechanical. Needs its own PR (cache-churn implications).
- **PolylineRenderer marker diff**: candidate-marker rebuild on every refresh causes visible flicker on Add. Fix with `id → marker` map and diff. `feedback_polyline_renderer_effects.md` — 4-effect split is load-bearing, don't collapse.
- **Off-corridor indicator in Itinerary**: subtle badge for stops no longer in the refreshed candidate list (Council S7-PROD deferred).
- **Click-to-select neighborhood panel**: panel currently shows for last-added stop. User should click any Itinerary stop to switch. Needs a lightweight separate Server Action (neighborhood-only, no route recompute) to avoid burning rate-limit budget.
- **Mobile bottom sheet**: 360px aside doesn't fit phones; 20/55/92 snap points (Session 5 council deferred).

## Someday (architectural ideas, daydreams)

- Save/load trips: biggest net-new surface. Needs Firestore schema + Clerk-scoped storage in `saved_hunts` + trip-list view.
- "Optimize stop order" toggle wrapping Routes API `optimizeWaypointOrder`.
- Map polygon rendering for neighborhoods (S8 out of scope; schema doesn't carry polygons today).
- Locales beyond `en` in the UI. Schema supports 7 locales via `LocalizedTextSchema`; `localizedText(text, locale)` centralizes the path. i18n switch is one file.
- External CAS state for council monthly-budget counter (documented cross-PR race in GH Actions cache; GCP budget alert is current backstop).
- Move post-commit hook artifacts off the working tree so `gh pr merge` stops requiring a pre-merge stash.
- Persona-aware neighborhood ranking (trending_score + persona weights, S8 deferred).

## Open issues

None. (`gh issue list` returned empty as of 2026-04-27 10:20 UTC.)

## In flight

None. All S8 branches merged; working tree clean.

## Scheduled remote agents

- **`trig_01YHMwS7gNTrnNqYY7AHhrpX` — Council v2 30-day kill-criteria check.** One-time, fires `2026-05-26T00:00:00Z` (= 2026-05-26 09:00 JST). Pulls PR cycle-time data, council compliance tally, cost estimate. Opens draft rollback PR if any criterion tripped, otherwise "paying off" status issue. Manage: https://claude.ai/code/routines/trig_01YHMwS7gNTrnNqYY7AHhrpX
