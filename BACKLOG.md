# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-04-30** (Session 15 closeout — PR #11 merged).

## Now (this week)

_Nothing blocking. See Next._

## Next (queued, scoped)

- **Save/load trips**: biggest net-new surface. Needs Firestore schema + Clerk-scoped storage in `saved_hunts` + trip-list view.
- **Map padding for bottom sheet**: at peek (20vh), Google Maps zoom controls are partially obscured. Add bottom padding to the map container on mobile.

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
- `actions.ts` ISC anchor comment stale — references removed `WaypointFetchResult.degraded`; fix on next `actions.ts` touch.
- `geometricFilter` docstring still says "102 UE cities" — hardcoded count will drift; fix on next `candidates.ts` touch.
- **WCAG 1.4.10 Reflow**: resolved by PR #11 bottom sheet.

## Open issues

None. (`gh issue list` returned empty as of 2026-04-29.)

## In flight

None.

## Completed

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
