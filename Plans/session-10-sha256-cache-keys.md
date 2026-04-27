# PLAN.md — SHA-256 for candidateCacheKey + waypointsCacheKey

**Session:** 10
**Date:** 2026-04-27
**Type:** chore — no behavior change

## Summary

`neighborhoodsCacheKey` already uses SHA-256 (added in S8a on council advice).
`candidateCacheKey` and `waypointsCacheKey` still use `charCodeAt` loops — a
documented weak-hash with a Unicode surrogate-pair bug and higher collision
probability. This PR makes all three key helpers consistent.

Inputs are ASCII slugs and encoded polyline characters today, so the bug is
theoretical. The fix is mechanical.

## Scope

**In:**
- `candidateCacheKey`: replace `charCodeAt` loop with SHA-256 of structured
  JSON `{kind, polyline, maxDetourMinutes}`, 16-hex prefix, keep `candidates:` namespace
- `waypointsCacheKey`: replace raw comma-join with SHA-256 of structured JSON
  `{kind, cityIds}` (sorted, deduped), 16-hex prefix, keep `waypoints:` namespace
- Update `cache.test.ts`: add `candidateCacheKey` tests; update `waypointsCacheKey`
  hash-format assertion (now 16-hex, same as neighborhoods)
- Remove the stale "Other two helpers keep the loop for now" sentence from the
  `neighborhoodsCacheKey` doc-comment

**Out:**
- `cacheGet` / `cacheSet` / `MAX_ENTRIES` / TTL — untouched
- `neighborhoodsCacheKey` — already correct, no change
- Any cache persistence or migration — cache is in-memory LRU only

## Architecture Decisions

### 1. Structured JSON input to hash function (same as neighborhoodsCacheKey)

`JSON.stringify({kind: "candidates", polyline: encodedPolyline, maxDetourMinutes})`
feeds SHA-256. The `kind` tag makes namespaces orthogonal by construction even
if the hash function ever changes. Matches the pattern established in S8a.

### 2. `waypointsCacheKey` loses the polyline length component from `candidateCacheKey`

`candidateCacheKey` previously encoded `polyline.length` as part of the key to
reduce collisions in the weak hash. SHA-256 makes that redundant — collision
probability drops to ~2⁻⁶⁴ at 16 hex chars. Drop the length field.

### 3. One-time cold cache at deploy

Both helpers are consumed by the in-memory LRU only. No Firestore persistence,
no Redis, no external state. All existing entries become unreachable on deploy
(different key format) and are evicted naturally by the LRU as new keys are
inserted. First request after deploy pays one Firestore round-trip per candidate
city set — acceptable at current traffic.

### 4. Test assertions stay property-based, not value-based

Tests assert: correct prefix, deterministic output, distinctness for distinct
inputs, order-independence / dedup for `waypointsCacheKey`. No test pins a
specific hash value (those break on any input change). Existing property tests
for `waypointsCacheKey` pass unchanged; only the format assertion (16-hex)
needs adding for `candidateCacheKey`.

## Implementation Steps

1. In `cache.ts`, replace `candidateCacheKey` body:
   - `JSON.stringify({kind:"candidates", polyline: encodedPolyline, maxDetourMinutes})`
   - SHA-256 → 16 hex chars
   - Return `candidates:${hash}`
2. In `cache.ts`, replace `waypointsCacheKey` body:
   - Sorted deduped city ids → `JSON.stringify({kind:"waypoints", cityIds})`
   - SHA-256 → 16 hex chars
   - Return `waypoints:${hash}`
3. Remove the "Other two helpers keep the loop for now" sentence from the
   `neighborhoodsCacheKey` doc-comment (now stale).
4. In `cache.test.ts`, add `candidateCacheKey` describe block: prefix check,
   deterministic, distinct for different polylines, distinct for different detour.
5. In `cache.test.ts`, add a 16-hex hash format check to `waypointsCacheKey`.
6. `bun run test` → all pass
7. `bun run type-check` → clean

## Security Notes

- SHA-256 via Node `crypto` — same module already imported for
  `neighborhoodsCacheKey`. No new imports.
- Inputs to the hash are developer-controlled (encoded polyline from Routes API,
  city id slugs from Firestore). No user-controlled raw strings reach the hash.
- 16-hex (64-bit) truncation is sufficient for an in-memory cache with
  MAX_ENTRIES=200; birthday collision probability is negligible.

## Deploy Note

In-memory LRU only — no migration required. Cold cache at first deploy is
expected and benign. Document in commit message so oncall has context if they
see a temporary latency bump.
