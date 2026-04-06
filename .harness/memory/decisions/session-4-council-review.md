# Session 4 Retro Council Review

**Date:** 2026-04-07
**Trigger:** Session 4 shipped without council. User flagged that council wasn't being used correctly. Retroactive review run with 3 parallel agents.

## Verdicts

| Expert | Verdict | Score |
|--------|---------|-------|
| Security | FAIL | 4/10 |
| Architecture | B | 6.5/10 |
| Product | medium-negative | 4/10 |

## Decision Record

**Tier 1 (must fix now — Session 4.5 hardening):**
- Input validation: lat/lng finite + range, budget bounds, max great-circle distance
- Polyline size cap (10k vertices)
- Migrate Distance Matrix → `computeRouteMatrix` (kills 25× quota waste)
- Fix `samplePolyline` interpolation bug (was snapping to vertices, missing highway cities)
- Project candidates onto full polyline for true nearest point
- Scale `maxDetourMinutes` from budget (`Math.min(90, budget * 12)`)
- Remove unused `routes.legs` from Routes field mask
- Strip API responses from thrown errors (no key leak)
- In-process LRU cache on `findCandidateCities`
- Per-IP rate limit on `/plan` (in-memory map, 20 req/min/IP)

**Tier 2 (Session 5 — pairs naturally with personas):**
- Clickable candidates with "Add to trip"
- Labeled persistent markers
- Empty state messaging for routes with no UE coverage
- Mobile bottom card collapse
- `RankedWaypoint` boundary type
- Hover/tap sync between list and map

**Tier 3 (deferred until launch):**
- Clerk gate on `/plan`
- Cloud Armor / IP allowlist
- Firestore-backed query cache
- Spatial index for cities (premature for 102 records)

## Why This Order

Security FAIL is real but blast radius is bounded right now (no public marketing, low traffic). Tier 1 input validation + rate limit + cache get us out of the immediate billing-DoS window. Migrating to `computeRouteMatrix` is the highest-leverage architectural fix — 25× cost reduction on the hot path.

Tier 2 is naturally Session 5 territory because clickable candidates need persona scoring to differentiate "which city should I click first."

Tier 3 waits until we're promoting URLs publicly.

## Process Lesson

The council was treated as a one-shot consultation when stuck, not a pre-EXECUTE gate. Sessions 1-4 all qualified as significant per program.md and all skipped council. Workflow files updated (program.md + skills/10-build.md) to make council a hard numbered step that can't be skipped on significant work. Significance criteria explicit. Agent-based pattern (3 parallel general-purpose agents) documented as the working substitute for harness-cli.
