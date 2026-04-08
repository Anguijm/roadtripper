# Session 6 Pre-EXECUTE Council Review

**Date:** 2026-04-08
**Workflow:** Hard pre-EXECUTE gate (per Session 4.5). 3 parallel general-purpose agents, 30-60s each.
**Plan reviewed:** `Plans/piped-booping-shell.md`

## Verdicts

| Expert | Verdict | Score |
|--------|---------|-------|
| Security | CONDITIONAL | 6/10 |
| Architecture | CONDITIONAL | 6/10 (C) |
| Product | CONDITIONAL | 7/10 |

All three CONDITIONAL — no FAILs, but 18 blocker findings collectively. Plan direction is correct; specific fixes required before EXECUTE.

## Blocker Findings (folded into PRD ISC)

### Security (7)
- **SEC-1:** Validate every stop coord (NaN/Infinity/range/NA bbox). Reject entire request on first invalid stop.
- **SEC-2:** Server enforces max-stops cap BEFORE any validation loop. Rejects non-array, non-object, duplicate cityIds.
- **SEC-3:** Per-IP DAILY quota separate from short-window limiter. Caps Routes API spend from hostile clients.
- **SEC-4:** Error branch returns fixed enum: `"invalid_input" | "rate_limited" | "quota_exceeded" | "upstream_unavailable" | "internal_error"`. Never forwards raw upstream errors.
- **SEC-5:** Server Action explicitly verifies `serverActions.allowedOrigins` is configured in `next.config`. Cannot rely on default.
- **SEC-6:** `computeRouteWithStops` asserts `stops.length <= 10` defensively at helper boundary. Constructs intermediates from a freshly-mapped shape — never spreads client objects (prevents `sideOfRoad`/`vehicleHeading`/`via` injection).
- **SEC-7:** Client `inFlightRef` paired with server-side concurrency guard or tight per-IP window (≤1 req/sec). Document chosen window.

### Architecture (5)
- **ARCH-1:** `directions.ts` is `"server-only"`. Move `formatDistance`/`formatDuration` to `format.ts` with NO back-compat re-export from `directions.ts` (would leak server-only barrier through transitive imports). Update existing importers to point at `format.ts` directly.
- **ARCH-2:** Split `PolylineRenderer` into two effects: one keyed `[map, candidates, routeColor]` for markers, one keyed `[map, encodedPolyline]` for the polyline. Put `hasFitOnceRef` inside PolylineRenderer guarding `fitBounds`. Avoids tearing down all 25 candidate markers + click listeners on every recompute.
- **ARCH-3:** Model live route as `liveRoute: RouteResult | null` where `null` means "use props". RouteMap consumes `liveRoute?.encodedPolyline ?? props.encodedPolyline`. On remove-to-empty, set `liveRoute = null` and skip the server action — original polyline restored automatically.
- **ARCH-4:** Server action return type asserted JSON-safe via `satisfies` + a `JsonSafe<T>` helper or runtime check. No Date/Map/Set/class instances/undefined fields.
- **ARCH-5:** Use incrementing `requestIdRef` (capture `myId = ++ref.current` before await; bail on resolve if `myId !== ref.current`) — not just `inFlightRef`. Verify React 19 strict-mode double-mount does not double-bill.

### Product (6)
- **PROD-1:** Stale-recommendation banner: when `tripStops.length > 0`, show dismissible "Showing stops along your original route. Replan to refresh." in recommendations panel.
- **PROD-2:** Itinerary renders ABOVE recommendations once `tripStops.length > 0`. Stacked-below buries the entire MVP payoff.
- **PROD-3:** Explicit error-recovery contract: don't roll back tripStops, keep previous polyline, inline banner with Retry button, mark failed stop with warning icon.
- **PROD-4:** Loading affordance: during `isPending` disable Add/Remove, spinner next to totals, subtle polyline opacity dim.
- **PROD-5:** Empty-stops behavior in code: revert to `props.encodedPolyline` from initial mount (matches ARCH-3).
- **PROD-6:** Button label must be `"Add city to trip"` not `"Add to trip"` — granularity has to be in the label.

## Non-Blocker Observations (adopted selectively)

- **Product:** Cap to 7 stops (not 10) — matches real road-trip behavior. **Adopted.**
- **Product:** Empty state copy → "Pick stops from the list to build your trip." **Adopted.**
- **Product:** Fade non-added candidates to 60% opacity once `tripStops.length > 0`. **Deferred — polish.**
- **Product:** Mobile min-width guard with notice under 768px. **Deferred — Session 8 polish.**
- **Architecture:** 5 useState slices collapse to `liveRoute + recomputeError + isPending` after ARCH-3.
- **Architecture:** Z-index numbered stop markers > candidate markers.
- **Architecture:** Mirror 7-cap client-side in `addStop` so UI disables Add at the cap.
- **Security:** Log validated stop count + IP hash (server-only) for abuse detection.
- **Security:** AbortController on the latest fetch is a bonus, not required (request-id pattern is sufficient).

## Process Notes

- Council ran in ~62s (parallel). Solid value — caught the back-compat re-export leak (would have been a build break) and the PolylineRenderer split (would have caused jarring re-fit on every Add).
- All three reviewers independently flagged the empty-stops semantics. Strong signal to fix early.
- No FAIL verdicts → CONDITIONAL → 18 ISC additions → proceed once folded in.
