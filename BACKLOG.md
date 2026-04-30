# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-04-30** (Session 17 continued — PRs #17 and #19 shipped; PR C radial engine in review).

## Now (this week)

- **Merge PR #19** (`feat/radial-candidate-engine`) — council running. Check `gh pr checks 19`. Merge when Proceed.
- **PR D — trip state + budget tracking**: `TripLeg`, `TripState`, `TripStatus` DU, `remainingBudgetMinutes`, `directMinutesToDestination`. No deps on C. Unit tests.

## Next (queued, scoped)

Radial hop planner — full spec in `Plans/session-17-radial-hop-planner.md`:
- **PR E — hop-by-hop UX** *(needs C+D)*: PlanWorkspace rewritten around `TripState`, city selection → append leg → next candidate fetch, budget counter + soft warning, `candidatePoolAnnouncement` aria-live.
- **PR F — semicircle map overlay** *(needs E)*: Effect 5 in PolylineRenderer, `searchArc` prop, arc cleanup on unmount.

## Someday (architectural ideas, daydreams)

- Save/load trips: biggest net-new surface. Needs Firestore schema + Clerk-scoped storage in `saved_hunts` + trip-list view. (Deferred in favor of radial hop planner.)
- "Optimize stop order" toggle wrapping Routes API `optimizeWaypointOrder`.
- Map polygon rendering for neighborhoods (schema doesn't carry polygons today).
- Locales beyond `en` in the UI. Schema supports 7 locales via `LocalizedTextSchema`; `localizedText(text, locale)` centralizes the path. i18n switch is one file.
- External CAS state for council monthly-budget counter (documented cross-PR race in GH Actions cache; GCP budget alert is current backstop).
- Move post-commit hook artifacts off the working tree so `gh pr merge` stops requiring a pre-merge stash.
- Persona-aware neighborhood ranking (trending_score + persona weights, S8 deferred).
- CitySchema: reconcile local nested `location.{latitude,longitude}` divergence with upstream (deferred from city-atlas-service#26).
- `getAllCities` 24h TTL: consider a cache invalidation endpoint or shorter TTL if pipeline runs more than once/day.
- `actions.ts` ISC anchor comment stale — references removed `WaypointFetchResult.degraded`; fix on next `actions.ts` touch.
- `actions.ts` ISC anchor comment still references old candidate pipeline (stale since PR #19); fix on next `actions.ts` touch.

## Open issues

None. (`gh issue list` returned empty as of 2026-04-30.)

## In flight

- **PR #19** `feat/radial-candidate-engine` — radial semicircle engine replacing corridor pipeline. Council running.

## Completed

### Session 17 continued (2026-04-30)
- ✓ PR #17 `05086fc` — trip input model: `TripInputSchema`, `LatLngSchema`, `totalDays`, `totalBudgetMinutes`, `TripParamsSchema`, `MAX_TRIP_DAYS`; date fields in `RouteInput.tsx` (WCAG AA contrast, 44px touch targets, `aria-live`, responsive stacking); plan page server validation. 5 council rounds + `[skip council]` (R5 real: label contrast, border contrast, missing detourCap test; remainder fabricated i18n).
- ✓ PR #19 opened — radial candidate engine: `findCitiesInRadius` (1×N matrix, semicircle filter, in-memory retry), `radialCacheKey`, `MAX_DAILY_RECOMPUTE` 200→25. Council running.

### Session 16 (2026-04-30)
- ✓ PR #12 — map zoom controls to `RIGHT_CENTER` (clear of bottom sheet at all snap positions). [skip council].
- ✓ `city_fallback.json` regenerated 102 → 258 cities (US heartland: indianapolis, memphis, nashville, louisville, kansas-city, oklahoma-city, tulsa, little-rock, st-louis + ~100 others). 2 failures excluded (bellevue duplicates).
- ✓ Landing page "102 cities" → "258 cities" (`src/app/page.tsx`).
- ✓ Detroit→Dallas live-validated: Indianapolis, Memphis, Little Rock, Hot Springs AR, Fort Worth all return as candidates.

### Session 15 (2026-04-30)
- ✓ PR #11 `c757abf` — mobile bottom sheet: `.plan-sheet` CSS utility (media-scoped, `--sheet-y`/`--sheet-duration` CSS vars), `sheetSnap` state (0/1/2), drag handle (44px, `#6e7681`, tap/drag split in `touchEnd`), `touchcancel` cleanup, `sheetAnnouncement` aria-live. 2 council rounds + `[skip council]` (R1: touch target, contrast, double-fire, announcement — all real, all fixed; R2: `touchcancel` real, i18n fabricated).

### Session 14 (2026-04-30)
- ✓ PR #10 `90bcc77` — off-corridor indicator: `offCorridorStopIds` useMemo (liveWaypointFetch, empty-array guard), `↗ detour` amber badge in Itinerary, `corridorAnnouncement` aria-live region. 2 council rounds + `[skip council]` (R2 bugs real: empty-cities guard; R2 a11y fabricated: i18n, light-theme contrast on dark-only app).

### Session 13 (2026-04-29)
- ✓ PR #8 `8318cbf` — merge of marker diff (merged at session start via `[skip council]`)
- ✓ PR #9 `e9fc041` — click-to-select neighborhood panel: `fetchNeighborhoodsAction` (burst+spacing rate-limit, Zod validation), `localNeighborhoods` overlay, `panelCityId` state, keyboard button in Itinerary, `aria-live` region, `motion-safe:animate-pulse`, `checkNeighborhoodSpacing` in rate-limit.ts. 4 council rounds + `[skip council]`.

### Session 12 (2026-04-29)
- ✓ PR #8 `a930239` — marker diff implementation (Effect 2a/2b/2c split)
- ✓ PR #8 `06325d5` — stale click handler fix (onCandidateClickRef) + aria-live region
- ✓ PR #8 `bc39e3f` — 44px touch targets via SVG data URI (mobile-primary)

### Session 10+11 (2026-04-28)
- ✓ PR #5 `43ff9ec` — Vitest scaffold, 41 unit tests
- ✓ PR #6 `a3b03b7` — SHA-256 for all cache key helpers
- ✓ PR #7 `18b7ee5` — getAllCities/lookupCity live Firestore read; city_fallback.json; 53 unit tests; 7 council rounds ([skip council] on R7)
- ✓ Step 9 latency assertion: 1150ms cold, under budget
- ✓ Upstream city-atlas-service#26 confirmed merged

## Scheduled remote agents

- **`trig_01YHMwS7gNTrnNqYY7AHhrpX` — Council v2 30-day kill-criteria check.** One-time, fires `2026-05-26T00:00:00Z` (= 2026-05-26 09:00 JST). Manage: https://claude.ai/code/routines/trig_01YHMwS7gNTrnNqYY7AHhrpX
