# Backlog

Living priority tracker. Re-rank as priorities shift. Each item is one line; link to GitHub issue/PR if one exists.

Last refreshed: **2026-04-26 21:15 UTC** (end of Session 8).

## Now (this week)

- [PR #2 — S8a foundation](https://github.com/Anguijm/roadtripper/pull/2): bundle S8b + S8c into the existing branch (slicing experiment failed council convergence — see `SESSION_HANDOFF.md`).
- Add Vitest + Firestore mock setup so the bugs reviewer's recurring "where are the tests?" finding has a place to land. Scope: `chore: vitest scaffolding`, no behavior change. Could ship before, after, or alongside PR #2.

## Next (queued, scoped)

- Migrate `getAllCities` / `lookupCity` from JSON cache (`src/data/global_city_cache.json`) to live Firestore reads via `getCity`. Independent surface; no current bugs but the JSON cache will drift.
- Switch `candidateCacheKey` and `waypointsCacheKey` to SHA-256 (matching `neighborhoodsCacheKey`). Bugs reviewer R2/R3 flagged the `charCodeAt`-loop Unicode bug; deferred because the existing helpers are fed ASCII-only inputs and the switch is a public-API change with cache-churn implications.
- Marker diff in PolylineRenderer (Session 7 deferral): the candidate-marker rebuild on every refresh causes visible flicker on every Add. Fix with `id → marker` map and diff. `feedback_polyline_renderer_effects.md` notes the 4-effect split is load-bearing — don't collapse it.
- Off-corridor indicator in Itinerary: subtle badge for stops no longer in the refreshed candidate list (Council S7-PROD observation).
- Mobile bottom sheet: 360px aside doesn't fit phones; 20/55/92 snap points (Session 5 council deferred).

## Someday (architectural ideas, daydreams)

- Save/load trips: biggest net-new surface. Needs Firestore schema + Clerk-scoped storage in `saved_hunts` + trip-list view.
- "Optimize stop order" toggle wrapping Routes API `optimizeWaypointOrder`.
- Map polygon rendering for neighborhoods (S8 out of scope; schema doesn't carry polygons today).
- Locales beyond `en` in the UI. Schema already supports 7 locales via `LocalizedTextSchema`; the `localizedText(text, locale)` helper centralizes the resolution path. Switch is a single-file change to thread the locale through.
- External CAS state for the council monthly-budget counter (currently has a documented cross-PR race in the GH Actions cache; mitigated by the GCP budget alert backstop).
- Move post-commit hook artifacts off the working tree (or commit them themselves) so `gh pr merge` stops aborting on dirty session_state.json + yolo_log.jsonl.

## Open issues

None. (`gh issue list` returned empty as of 2026-04-26 21:15 UTC.)

## In flight

- **`feat/session-8a-neighborhood-foundation`** ([PR #2](https://github.com/Anguijm/roadtripper/pull/2)): 5 commits, last sha `5f2fdb1`. Council Revise after R3. Will be expanded to bundle S8b + S8c next session, then re-reviewed.
- **Upstream [Anguijm/city-atlas-service#26](https://github.com/Anguijm/city-atlas-service/pull/26)**: schema convergence PR. Open, status pending. Worth a status check next session before doing more local schema work.

## Scheduled remote agents

- **`trig_01YHMwS7gNTrnNqYY7AHhrpX` — Council v2 30-day kill-criteria check.** One-time, fires `2026-05-26T00:00:00Z` (= 2026-05-26 09:00 JST). Pulls PR cycle-time data, council compliance tally, cost estimate from `yolo_log.jsonl`. Opens draft rollback PR if any criterion tripped, otherwise a "paying off" status issue. Manage: https://claude.ai/code/routines/trig_01YHMwS7gNTrnNqYY7AHhrpX
