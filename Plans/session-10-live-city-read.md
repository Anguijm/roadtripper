# PLAN.md — getAllCities / lookupCity live-read migration

**Session:** 10
**Date:** 2026-04-28
**Type:** chore — no user-facing behavior change

## Summary

`getAllCities()` and `lookupCity()` read from `src/data/global_city_cache.json`
— a 102-city snapshot that will silently drift as the Urban Explorer pipeline
adds cities. The Firestore-backed helpers (`getCity`, `listNeighborhoods`,
`listWaypoints`) already exist in `firestore.ts`. This PR adds `listCities()`
and wires the two existing consumers to the live source.

The JSON file is deleted at the end of this PR.

## Caller map (from grep — exhaustive)

| Function | Callers |
|---|---|
| `getAllCities()` | `candidates.ts:geometricFilter` (hot path), `test/page.tsx` |
| `lookupCity()` | `cities.ts:getNearbyCities` only — and `getNearbyCities` has **zero** external callers |
| `getNearbyCities()` | **zero** external callers |
| `haversineKm` in `cities.ts` | **zero** external callers — the canonical version lives in `polyline.ts` |

## Architecture Decisions

### 1. Keep `geometricFilter` synchronous — fetch in `findCandidateCities`

`geometricFilter` is a pure function (geometry math only) and must stay
testable without Firestore. It already accepts `options.cities?: City[]` as an
override. The fix: `findCandidateCities` (already async) fetches
`await getAllCities()` once before calling `geometricFilter`, and passes the
result as `options.cities`. Zero change to `geometricFilter`'s signature or
logic.

### 2. `getAllCities()` becomes async, returns `City[]`

Returns the unwrapped city list (not `LoadResult<City>`), consistent with the
pre-migration API that callers already depend on. Dropped docs are logged via
`console.warn` at the `listCities` layer and at the `getAllCities` call site if
`dropped.length > 0` (so ops visibility is preserved without changing callers).

### 3. City list is cached via the existing LRU — 24-hour TTL, fixed key `"allCities"`

The city corpus changes only when the pipeline runs (roughly weekly). A 24-hour
in-process TTL is appropriate — long enough to avoid per-request Firestore
charges, short enough to pick up new cities within a day. Uses `cacheGet` /
`cacheSet` from `cache.ts` (already imported by `candidates.ts`). Fixed key
`"allCities"` — no hash needed, the payload is always the full list.

### 4. `lookupCity()` becomes async, delegates to `getCity()`

`lookupCity` has no external callers. It's kept as a thin wrapper around
`getCity()` from `firestore.ts` in case future callers want it. Removing it
entirely would be fine but a one-liner wrapper has zero cost.

### 5. Remove `haversineKm` and `getNearbyCities` from `cities.ts`

Both are dead code. `haversineKm` is duplicated from `polyline.ts` with a
different signature (takes 4 numbers instead of 2 `LatLng` objects). Removing
both simplifies the file. No callers exist outside `cities.ts` itself.

### 6. `cities.ts` becomes server-only

`getAllCities()` and `lookupCity()` now call Firestore — both must be guarded
with `import "server-only"`. The only callers (`candidates.ts`, `test/page.tsx`)
are already server-only or Server Components.

### 7. Add `listCities()` to `firestore.ts` alongside existing helpers

Same `parseDocs` pattern as `listNeighborhoods` / `listWaypoints`. Queries the
top-level `cities` collection, filters `isArchived` at the application layer
(consistent with the `getCity()` comment about archived = invisible), returns
`LoadResult<City>`.

### 8. Delete `src/data/global_city_cache.json`

The file is 1633 lines / 102 cities. After migration it is unreachable. Delete
it and the `import cityCacheData from "@/data/global_city_cache.json"` line.
The `test/page.tsx` "Local Cache" section becomes "Cities (live)" — update the
label while touching the file.

## Implementation Steps

1. `firestore.ts`: add `listCities()` — `urbanExplorerDb.collection('cities').get()`,
   filter archived in `parseDocs` post-parse (set `isArchived` check on each
   result), return `LoadResult<City>`.
2. `cities.ts`:
   a. Replace JSON import + `cityCache` constant with `import "server-only"` and
      imports from `firestore.ts` + `cache.ts`
   b. `getAllCities()` → `async`: check `cacheGet("allCities")`, on miss call
      `listCities()`, warn if `dropped.length > 0`, `cacheSet("allCities", items,
      24 * 60 * 60 * 1000)`, return `items`
   c. `lookupCity(cityId)` → `async`: `return getCity(cityId) ?? undefined`
   d. Delete `haversineKm` and `getNearbyCities`
3. `candidates.ts`: in `findCandidateCities`, fetch `const cities = await getAllCities()`
   before the `geometricFilter` call; pass as `options.cities`
4. `test/page.tsx`: `await getAllCities()`; rename section label "Local Cache" →
   "Cities (live)"
5. Delete `src/data/global_city_cache.json`
6. `bun run type-check` → clean
7. `bun run test` → still green (no test changes needed — `geometricFilter` is
   tested with explicit `options.cities`, not via `getAllCities`)

## Security Notes

- `cities.ts` gains `import "server-only"` — no client bundle exposure.
- `listCities()` reads the `cities` collection with no user-controlled filter.
  The collection is read-only from this service's perspective (IAM:
  `roles/datastore.viewer`). No injection surface.
- The 24-hour TTL cache key `"allCities"` is a hardcoded constant, not derived
  from user input.

## Edge Cases

- **Zero cities returned** — `getAllCities()` returns `[]`. `geometricFilter`
  returns `[]`. `findCandidateCities` caches `[]` and returns `[]`. The UI
  shows no recommendations — same degraded path as today if the JSON were
  empty.
- **All cities fail schema parse** — `listCities()` returns `{ items: [], dropped: [102 entries] }`.
  `getAllCities()` logs a warn per dropped doc, caches `[]`, returns `[]`.
- **Firestore unavailable** — `listCities()` throws. `getAllCities()` propagates
  the throw. `findCandidateCities` propagates, `recomputeAndRefreshAction`
  catches it as part of the existing degraded-state path (S7-SEC-4 catch).
  Same failure surface as any other Firestore call.
- **`lookupCity` called with unknown id** — `getCity()` returns `null`,
  `lookupCity` returns `undefined`. Same as before.

## Deploy Note

First deploy after this PR: one `listCities()` Firestore call per App Hosting
instance, then cached for 24 hours. 102 docs × cold read ≈ negligible cost
($0.00006 at $0.06/100k reads). No migration, no seed step needed.
