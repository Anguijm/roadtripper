# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-10-08** (late): U17–U20 and the corridor-town atlas merged (#114–#119).

## Now (this week)

Nothing queued. Round 3 closed with #108; see `gauntlet/round-3-report.md`.

## Next (scoped, not started)

- **Audit `tripDays`'s one-day fallback.** Undated trips still get `tripDays = 1`. U11 stopped the budget wording believing it; other readers of `tripDays` / `totalBudgetMinutes` are unaudited.
- **The zoom buttons cover the start's name on a phone** ("Kansas City" shows as "Ka"). Since U20, that hidden name also blocks the names of the towns beside it (Lawrence, Topeka). Rule 6. Flagged by four critics.
- **Ten corridor towns too thin for the pipeline** (Grand Island, Rock Springs, Rawlins, Snyder, Santa Rosa, Brownwood, Colby, Ogallala, Elk City, West Wendover) and Sweetwater. They still name day ends via U19. Adding them needs a new source upstream (city-atlas-service's "thin cities" problem).
- **Day ends beyond 30 km of any 5k town stay "on the road"**, about a quarter of 6 h days. Options: GeoNames `cities1000`, or a smaller population floor. Product call: "near X" for a village of 1,500.
- **Draw where each day ends on the map** (U28 and U19 critics). Day headings now name an end ("near Sweetwater", "45 min past Elizabethtown") from the town list, but the map draws no marker there. Readers look for the named town on the map and don't find it.
- **Say why a detour appeared** (U21 critic). A dated trip with spare days now offers a town "out of the way" at the bottom, and nothing says why the list changed. Something like "3 days to spare, so one a bit out of the way". It also shows "★ The pick" on the detour's places, which reads as a recommendation over towns on the way.
- **One "The pick" per town?** Two critics noticed several picks on one town's list.
- **Mobile smoke test** — pending since May. Food, Museums and the stop flows all now work live and can be checked on a phone.

## Someday (architectural ideas, daydreams)

- A map-first today screen. Left for the operator in round 1; never scoped.
- A per-stop "stay the night here" choice, if a roadside motel ever needs to be an overnight. The operator chose the visit default over a toggle (U10).
- A Google Maps fake for jsdom, so the map effects can be run rather than read as source (U12).
- Icons for the eight moods, if wanted back: one drawn set at one size, no two telling apart only by fill.
- Rename `TripStopMarker.cityId`: a stop's id may be an OSM id, and the field name is wrong for those values.
- A Firestore backfill translating legacy `personaId` to `moods` (tidying, not a fix).
- "Optimize stop order" toggle wrapping Routes API `optimizeWaypointOrder`.
- Locales beyond `en`; neighborhood polygons; council budget CAS; `getAllCities` TTL.

## Open issues

None.

## In flight

None.

## Completed

### Round 3 of the interface build (2026-10-02–07) — see `gauntlet/round-3-report.md`
- ✓ #100 jsdom + interaction tests · #102 U8 roadside stop marked in the trip · #103 production fetches the tagged store · #104 U9 saved trips keep their stops · #105 U10 roadside places are visits · #106 U11 no budget warning without dates · #108 U12 map labels.
- ✓ #101 council advisory · #107 merge without asking, check production in a browser.

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
