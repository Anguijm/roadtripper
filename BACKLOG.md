# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-11-10**. Last change: #175 (bracketed duplicates merged) and the /api/today log exclusion, after #173 (Toledo's Cloister line), #171 (Toledo joins the atlas), #169 (U52 border label), #167 (U51), #165 (CI type-check), #164 (/api/today), #162 (U50), #160 (U49) and #158. Before it, U45–U48 merged 2026-10-11 (#151–#154); phone smoke test passed (#150).

## Now (this week)

Nothing queued. Open questions for John are in Next.

## Next (scoped, not started)

- **More plain-word lines.** U51 rewrote five; the U51 critic suggested Fonner Park's racing season and a Stuhr line that opens on Railroad Town, both needing facts beyond the Wikipedia lead. Studio 10 in Grand Island has no line at all and no source yet.
- **city-atlas-service CI:** its `validate` job fails at `npm audit` before reaching the tests (it has since #62), and four of its TypeScript tests fail on main (index definitions, coverage tiers). #66 fixed seven others. Neither blocks Roadtripper.
- **`GET /api/trip` for the car app**, phase two: the plan's days and Along the way are computed in the browser, so this is a port of that logic to the server. Shape agreed after the car app's Today screen has been used.
- **U50 critic notes (round 2), all predating U50:** a stop town's drawer shows no drive figure (U3's choice: the day heading carries it); Along the way rows have no gap between places; a town past where the day runs out (Ogallala on Omaha to Denver, 4 h 15 min on a 4 h day) is listed under "Towns that fit today", which road order now makes plain.

- **Elk City, OK** is still too thin: 4 mapped places within 3 km. It names day ends via U19.


## Done, recorded

- **One place written two ways is one place (#175, 2026-11-10).** The car session found Grand Rapids' Calder twice, as "La Grande Vitesse (The Calder)" and "La Grande Vitesse". The export now runs a second pass: the same name but for a bracketed aside, same town, within 300 m, keeping the richest row. John read all 80 merges first and kept Little Rock's two Quapaw Quarter streets apart (`KEEP_APART`): 79 merges, 80 rows. The export diff showed nothing else changed. Live 22:21 JST: from Detroit, Grand Rapids lists the Calder once, with The Blue Bridge in the freed slot; /today shows it once at 390 px in headless Chrome.
- **/api/today positions are no longer logged (2026-11-10, John's choice).** The platform's two request logs kept the URL (lat, lng), IP and user agent for 30 days. A `_Default` sink exclusion, `drop-api-today-requests`, drops those entries since 13:11 UTC; a test call left none while a control request was logged. `docs/car-api.md` says what the server keeps; the runbook has the filter and the undo.

- **Toledo's Cloister line (#173, city-atlas-service #70, 2026-11-10).** It read the OSM listing's "Museum on Monroe Street."; John approved "A courtyard framed by centuries-old columns from French monasteries.", facts from the Atlas Obscura listing, kept in the U51 approved-lines file. One waypoint row changed in the export; a test pins the line. Live 22:01 JST, checked in headless Chrome.

- **Toledo, Ohio joins the atlas (#171, city-atlas-service #67, 2026-11-10).** The car session found nothing between Ann Arbor and Dayton on I-75; John picked the addition. The October path: every scraper, then Gemini research with OpenStreetMap grounding. 6 neighbourhoods and 17 places, "degraded" against the metro floor of 48 (35 live metros are under it; follow-up city-atlas-service #68). The atlas has 304 cities and the drive graph 6,190 pairs. `build-drive-graph.mjs` gained `--max-pairs` and `--plan-only`: under Google's 625 cap the planner packed Toledo's 74 pairs into 630 billed elements, and a cap of 40 billed exactly 74. From Detroit, Toledo is now the second town and Toronto falls out of /api/today's ten. Live 12:29 JST: /api/today from Detroit lists Toledo second (the old build: Ann Arbor, Flint), and /today shows it at 59 min with its places, checked in headless Chrome at 390 px.

- **A town across a border says so (U52, #169, 2026-11-10).** From Detroit, Toronto was offered like any other town (roadtripper-car's note); John chose to label it. "· in Canada" right after the name on /plan and /today, and `country` on each town and on `here` in /api/today (docs/car-api.md). The start's country is the nearest atlas town's. Critic APPROVE (medium); its "same place on both screens" note done. Live 10:49 JST. Left for John: the critic's idea of more weight on the label.

- **Plain-word lines for five places (U51, #167, 2026-11-10).** John allowed rewrites and approved five exact lines, each from facts in its Wikipedia article: Stuhr Museum ("Prairie pioneer museum with Railroad Town, a living-history 1890s village of original buildings."), Fonner Park, Wendover Will, Reliance Tipple, Howard Payne University. city-atlas-service #66 keeps them in `data/description-overrides.json`, applied at ingest so no pipeline run can undo them. Blind critic before merge: APPROVE, high. Live 10:35 JST.

- **CI type-checks (#165, 2026-11-10).** `ci.yml` called `typecheck --if-present`; the script is `type-check`, so CI never type-checked (ops survey). Now `npm run type-check`, no `--if-present`; the run's log shows the script running. Needed the GitHub `workflow` scope on the MS-S1, granted by John the same day.
- **GET /api/today for the car app (#164, 2026-11-10).** Contract in `docs/car-api.md`, agreed with the roadtripper-car session. The /today page's computation plus each place's coordinates; discriminated on `status`; the /today page's per-IP burst limit, not the recompute quota. Council CONDITIONAL; four real items fixed (blank lat read as 0, HTML 500, id dedupe, two comments), its product objection declined (John's decision; Android Auto shows no web pages). Live 10:17 JST; the car session's one check call matched the contract.

- **Along the way, then the towns, as drawers (U50, #162, 2026-11-10).** John's design: per day, "Along the way" first (a drawer, open, the ten strongest in road order, Show all), then each town a closed drawer in road order with its pick and count, Stop here in the header and "What's in X: its parts of town" inside. A chosen mood hides what answers none of the chosen moods in both drawers, and counts the towns it emptied; Machines and Sports leave the towns whole. Sort control removed; quality bar rule 4 amended. Critic round 1 REJECT ("What's in" beside the name was a second way to open a town), round 2 APPROVE. Council CLEAR; its two real items (a marker reopening a drawer closed by hand, a NaN sort) fixed with tests. Live on production 09:57 JST.

- **Shorter Wikipedia lines (U49, #160, 2026-11-10).** city-atlas-service #64 trims a Wikipedia sentence's own subject and its town, deleting words only; a trim leaving under 25 characters keeps the whole sentence (John's choice, so Howard Payne University is unchanged). Four lines changed: Stuhr Museum, Fonner Park, Wendover Will, Reliance Tipple. Council on #64 blocked round 1 on real bugs ("X is located in <town>." became "X is.", "was a" lost past tense), fixed with tests; CLEAR on round 2. Production checked at 09:13 JST; a fresh blind critic picked the trimmed screen over the old one, APPROVE, high confidence.

- **The home page counts the atlas's cities (#158, 2026-11-10).** It said "258 cities" while the atlas had 303 since U45. The number is now `getAllCities().length` at render, so the next atlas change cannot leave it stale. Checked on production: the old build said 258, the new one 303.

- **Wikipedia sentences for OSM-only places (U48, 2026-10-11).** city-atlas-service #63. Five places get one, including Grand Island's pick, the Stuhr Museum. The critic rejected the first try: Rawlins' prison redirects to a broader article ("historic and current prison"). A redirect now counts only to the same subject. Ingest also now deletes a description the JSON no longer has; the merge write used to keep it.

- **One town order for title, map and list (U47, 2026-10-11).** The town where today's drive runs out is first, then nearest detour, with out-of-the-way towns last (`townOrder`, scoring.ts). Before, the title used the fetch's order and named Park City over a sheet that said Rawlins was the stop.

- **The pick leads its town (U46, 2026-10-11).** A town's first row is its top-ranked place, described or not. Before, the first described place led, which put "The pick" second in the OSM towns.

- **Ten thin towns added via OpenStreetMap (U45, 2026-10-11).** city-atlas-service #62 grounds research on OSM: exact names are confirmed, invented places are dropped, and OSM-only places get a plain description or none. Added: Grand Island, Colby, Ogallala, West Wendover, Snyder, Sweetwater, Brownwood, Santa Rosa, Rock Springs and Rawlins. The atlas has 303 cities, and the drive graph 6,116 pairs.

- **Phone smoke test passed (2026-10-11).** The operator ran the 19-step checklist on production: sheet snaps, gestures, live Stop here, save and reopen, geolocation, date pickers, cellular, notch, landscape. Everything looked good.


- **The one-day fallback is gone (audited 2026-10-08, U34).** Every reader of a trip's day count handles a trip with no dates explicitly:
  - `RouteInput` shows no count without both dates.
  - `PlanWorkspace` has `tripDayCount: number | null`, and `tripBudgetFor` gives an undated trip an `undated` budget.
  - The deadline pressure is null without dates.
  - `budgetWords` takes a `{ dated: false }` arm.
  - `spareDays` returns null without dates.
  - `page.tsx` uses no day count; reach is per-day.

  The only "1" left is `daysSpannedBy` reading a stretch whose drive is not back yet as one day, which is intended. `tripBudgetFor` is guarded by the U13 test against `(tripDayCount ?? 1)`.

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
