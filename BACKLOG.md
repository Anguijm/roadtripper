# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-10-01** (round 2 of the interface build closed — PRs #92, #93, #94, #96 merged: the tag vocabulary, the join, the moods on screen, and "Stop here" from the roadside card).

## Now (this week)

- **The jsdom decision** — [#95](https://github.com/Anguijm/roadtripper/issues/95). Three client fixes from round 2 are unguarded: reverting any one leaves all 649 tests green, because the suite is `environment: "node"` and never runs a handler. The mood chips also became a multi-select and nobody has heard it read aloud. Operator's call: adding jsdom is infrastructure, not a feature branch's to spend.
- **Mobile smoke test** — verify OKC + Tulsa surface as candidates on Dallas → [far destination], 5h/day budget. Deploy is live (PR #26 auto-deployed). Pending since S21; older than most of what is above it.

## Next (queued, scoped)

- **A place in the trip is not marked in the day's list** — [#97](https://github.com/Anguijm/roadtripper/issues/97). Its card reads "✓ Added" while the list shows it like any other place. Small UI unit; needs a spec and a critic round.

## Someday (architectural ideas, daydreams)

- A map-first today screen. Left for the operator in `gauntlet/round-1-report.md` and never scoped.
- Icons for the eight moods, if they are ever wanted back: one drawn set at one size, each shape meaning its mood, no two telling apart only by fill. `MoodConfig` has no `glyph` field and a test asserts its absence, so this is a deliberate act rather than a regression.
- Rename `TripStopMarker.cityId`. A roadside stop is a trip stop now and its id is an OSM one, so the field name is wrong for some of its values and the compiler cannot say so. Touches the saved-trip schema.
- A Firestore backfill translating legacy `personaId` to `moods`. Nothing reads `personaId` any more except `TripCard`'s resume link, which handles its absence, so this is tidying rather than a fix.
- "Optimize stop order" toggle wrapping Routes API `optimizeWaypointOrder`.
- Map polygon rendering for neighborhoods (schema doesn't carry polygons today).
- Locales beyond `en` in the UI. Schema supports 7 locales via `LocalizedTextSchema`; `localizedText(text, locale)` centralizes the path. i18n switch is one file.
- External CAS state for council monthly-budget counter (documented cross-PR race in GH Actions cache; GCP budget alert is current backstop).
- Move post-commit hook artifacts off the working tree so `gh pr merge` stops requiring a pre-merge stash.
- CitySchema: reconcile local nested `location.{latitude,longitude}` divergence with upstream (deferred from city-atlas-service#26).
- `getAllCities` 24h TTL: consider a cache invalidation endpoint or shorter TTL if pipeline runs more than once/day.

## Open issues

- [#95](https://github.com/Anguijm/roadtripper/issues/95) — no DOM/interaction tests: three client fixes are unguarded.
- [#97](https://github.com/Anguijm/roadtripper/issues/97) — a place in the trip is not marked in the day's list.

## In flight

None.

## Completed

### Round 2 of the interface build (2026-09-29–30) — see `gauntlet/round-2-report.md`
- ✓ PR #92 — T1: the eighteen tags, the eight moods, the roll-up, the question each tag is asked, and how one or two chosen moods rank a place. Banded ranking (answers both / one / neither), `MOOD_ANSWERED` 0.35, within-band tiebreak nine parts mood to one part general score. 2 council rounds.
- ✓ PR #93 — T2: `survivorsAlongRoute` attaches tag scores, read from `roadside_tag` in chunks after the corridor narrows. Found: a store built before the tagging pass has no such table and every roadside marker would have vanished silently. 2 council rounds.
- ✓ PR #94 — U6: eight mood chips, two at a time, plus the order control; `rankFor` orders the day's places; moods mapped onto the towns' waypoint types where they fit. 3 critic rounds, 7 council rounds.
- ✓ PR #96 — U7: "Stop here" from the roadside card (U1's residual). Found by screenshot, not by test: `selectedCityId` rejected a roadside OSM id, so adding a place left the drive times stale. 2 critic rounds, 2 council rounds.

### Session 24 (2026-05-09–10)
- ✓ PR #34 — Arrival mode V2: dynamic `startDate` re-derivation on each recompute. `DateDerivationResult` DU (`{status:"ok",date}|{status:"failed"}|null`) in `actions.ts`. `effectiveStartDate` state + aria-live + amber failure banner in PlanWorkspace. [skip council] R3 (i18n fabricated).
- ✓ PR #35 — Persona-aware neighborhood ranking: `scoreNeighborhood(trendingScore, waypoints, persona)` in `scoring.ts`. `NeighborhoodPanel` sorts by `trending_score × bestTypeWeight(persona)`, `Number(x??0)||0` coercion, stable sort, key-based aria-live, empty state, orphan-waypoint fix. 8 council rounds.

### Session 22 (2026-05-02)
- ✓ PR #28 — save/load trips server layer: `SavedTrip` type, `SaveTripInputSchema`, `TripIdSchema`; `saveTrip`/`loadTrips`/`deleteTrip` server actions (Clerk auth, rate-limit, Firestore transaction, per-doc Zod validation, `failedToLoadCount`). 6 council rounds.
- ✓ PR #29 — save/load trips UI: save button + aria-live region in PlanWorkspace, `/trips` list page, `TripCard`/`TripsList` components, "My Trips" link in AuthButtons. 2 council rounds + `[skip council]` (R2: security reviewer fabricating request to re-review already-merged PR #28 code).

### Session 21 (2026-05-01)
- ✓ PR #25 `f18b5df` — loading/error states (loading.tsx + error.tsx), parallel route/candidate fetch, tap-to-add map markers, frontier label. 3 council rounds + `[skip council]` (R3: pre-existing AbortController + fabricated contrast/rate-limiter).
- ✓ PR #26 `b3be938` — hop reach fix: `detourCapForBudget` → `hopReachMinutes(budgetHours × 60 + 30 min)`, date range dialog in RouteInput, `HOP_REACH_MAX_MINUTES` + `METERS_PER_DRIVE_MINUTE` constants. 4 council rounds + `[skip council]` (R4 degradation spiral on fabricated Firestore limit + pre-existing AbortController).

### Session 20 (2026-05-01)
- ✓ PR #23 `fda22c6` — semicircle map overlay: `SearchArc` interface, `buildSemicirclePoints`, `computeBearing`, Effect 5 in PolylineRenderer, `searchArc` prop + useMemo in PlanWorkspace. 4 council rounds + `[skip council]` (R4 degradation spiral: bugs 9→3 on fabricated observability/null-guard demands).

### Session 19 (2026-05-01)
- ✓ PR #21 `2bb0826` — `TripLeg`, `TripState`, `TripStatus` DU + `buildTripState` derivation + 24 tests.
- ✓ PR #22 `e395a54` — hop-by-hop plan page UX: TripState wired to PlanWorkspace, per-leg durations in Itinerary, budget counter (green/amber/red), `role="alert"` warning banner, `candidatePoolAnnouncement`. 3 council rounds + `[skip council]` (detour badge removal misidentified as regression; i18n/analytics fabricated).

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
