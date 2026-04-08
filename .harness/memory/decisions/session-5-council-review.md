# Session 5 Pre-EXECUTE Council Review

**Date:** 2026-04-07
**Workflow:** First session executed with council as a HARD pre-EXECUTE gate (per the updated `skills/10-build.md`).

## Verdicts

| Expert | Verdict | Score |
|--------|---------|-------|
| Security | **FAIL** | 4/10 (→ 8 with ISCs) |
| Architecture | B+ | 8/10 |
| Product | medium-positive | 5/10 as-proposed → 7.5 with changes |

## Approved Session 5 Scope

**5 personas** (Product cut Nerd, added Explorer):
- **Explorer** (default, blue accent, balanced — primary = all types equally, no vibe bonus)
- **Outdoorsman** (green, nature+viewpoint primary)
- **Foodie** (amber, food+drink primary)
- **Gearhead** (red, landmark+viewpoint primary)
- **Culture Buff** (purple, culture+landmark primary)

**Scoring formula** (Architecture smoothing applied):
```
score = (trending_score + 1) * typeWeight * vibeBonus * detourPenalty
```
- `typeWeight`: 1.0 primary, 0.5 secondary, 0.2 other
- `vibeBonus`: 1.2x if city.vibeClass in persona.preferredVibes, else 1.0
- `detourPenalty`: `1 / (1 + detourMinutes / 30)`
- Max score ≈ 121 (101 × 1.0 × 1.2 × 1.0)

**Module boundaries:**
- `src/lib/personas/types.ts` — PersonaId enum, PersonaConfig, RankedWaypoint
- `src/lib/personas/index.ts` — frozen PERSONAS constant, parsePersona() with Zod enum
- `src/lib/personas/scoring.ts` — pure scoreWaypoint(), unit-testable
- `src/lib/routing/waypoints.ts` — fetchWaypointsForCities() batched Firestore read, cityId-keyed cache
- `src/lib/routing/ranking.ts` — orchestrator: candidates → waypoints → score → RankedWaypoint[]

**Cache architecture (two-layer):**
- Layer 1: `waypoint:${cityId}` — raw waypoint list from Firestore, TTL 1h, negative cache for empty results
- Layer 2 (deferred): rank cache by (polyline, cap, persona) — not needed if layer 1 is cheap enough

**UI:**
- PersonaSelector pill row (top of /plan page), URL-driven (`?persona=explorer`), tooltips
- RankedWaypointList — cards with name, city, type badge, detour, score bar, disabled "+ Add to trip" button, "why" chip
- RouteMap — named markers (city name, persona accent color), route line color switches with persona
- Mobile: bottom sheet with snap points (20/55/92)
- FLIP animation on reorder

## Deferred (with reason)

| Item | Deferred to | Reason |
|------|-------------|--------|
| Nerd persona | Session 7 or never | Overlaps Culture Buff for UE dataset |
| Hover card ↔ marker two-way sync | Session 6 | Desktop-only, lowest-leverage on mobile-first map |
| Scoring breakdown popover | Session 8 | Replaced with one-line "why" chip |
| Persona icons on cards | Session 8 | Redundant (pill row + route color already show active) |
| `AdvancedMarkerElement` migration | Session 8 | Needs Cloud map style ID |
| Daily Firestore read budget circuit breaker | Ops task | Infra, not blocking |
| IAM scope-down to named DB | Ops task | Parallel, fire-and-forget gcloud |
| Rank cache layer 2 (polyline, cap, persona) | Session 7 if needed | Layer 1 may be sufficient |
| Firestore composite index for vibe_waypoints | N/A | Skip orderBy, sort in-process instead |

## ISC Criteria (from council findings — all must pass before SHIP)

### Security
- **ISC-S5-1:** `parsePersona("__proto__")`, `parsePersona("constructor")`, `parsePersona(undefined)`, `parsePersona("<script>")` all return "explorer" (default) without throwing. Uses Zod enum, not object indexing.
- **ISC-S5-2:** No call to `infoWindow.setContent(string)` anywhere. Map InfoWindow content built via React portal or DOM `textContent`.
- **ISC-S5-3:** Switching persona on a cached polyline triggers ZERO Firestore reads (waypoints come from cityId cache).
- **ISC-S5-4:** Waypoint fetch uses batched `where("city_id", "in", [...])` query, capped to top-K candidates by detour (K ≤ 10).
- **ISC-S5-5:** WaypointSchema enforces max lengths on `name.en` (120) and `description.en` (500). HTML metacharacters in `name.en` cause rejection at Zod boundary.
- **ISC-S5-6:** `RankedWaypoint` is the ONLY type imported from `src/components/**`. Enforced by eslint import rule or grep test.
- **ISC-S5-7:** PERSONAS constant is `as const satisfies Record<PersonaId, PersonaConfig>` + `Object.freeze()`.
- **ISC-S5-8:** Negative cache (empty array) for cities with no waypoints, keyed by cityId, TTL 1h.

### Architecture
- **ISC-S5-9:** `fetchWaypointsForCities` does not rely on a composite Firestore index. Fetches by `city_id` only and sorts by `trending_score` in-process.
- **ISC-S5-10:** Scoring formula uses `(trending_score + 1)` smoothing. No waypoint scores 0.
- **ISC-S5-11:** `src/lib/personas/scoring.ts` is a pure module (no Firestore, no React) — importable from tests.
- **ISC-S5-12:** Vitest configured with one test file `scoring.test.ts` covering: persona enum parsing edge cases, score formula at each weight tier, smoothing at trending_score=0, vibeBonus on/off.
- **ISC-S5-13:** `?persona=` is a query param (not route segment). PersonaSelector uses `Link replace` to avoid history accumulation.
- **ISC-S5-14:** Map markers use `SymbolPath.CIRCLE + label: {text: cityName}` for N ≤ 8 (our typical case). No `AdvancedMarkerElement` in Session 5.

### Product
- **ISC-S5-15:** "Explorer" persona is the default when `?persona=` is missing or invalid.
- **ISC-S5-16:** Each persona pill shows a 4-6 word tooltip on hover/tap.
- **ISC-S5-17:** Each waypoint card displays: name, city name, type badge, detour minutes, score bar, one-line "why" chip, disabled "+ Add to trip — coming soon" button.
- **ISC-S5-18:** Map route line color changes to the active persona's accent on persona switch.
- **ISC-S5-19:** List reorder uses a FLIP-style animation (CSS transform, ~200ms).
- **ISC-S5-20:** Mobile viewport (<768px) renders a draggable bottom sheet at 20/55/92 snap points. No overlay collision with map interactions.
- **ISC-S5-21:** Empty state ("no waypoints for this persona") shows a "Try Explorer" rescue button.

## Process Note

This is the first session executed with council as a **hard pre-EXECUTE gate**. The workflow change came from Session 4's retroactive review and proved immediately valuable — the 21 ISC criteria above would almost certainly have slipped through an "I know what to build" mental model. Agent-based council (3 parallel `general-purpose` agents with persona prompts) took ~90 seconds and ran in parallel with this Lead Architect synthesis. Replicate.
