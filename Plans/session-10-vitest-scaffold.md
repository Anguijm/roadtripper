# PLAN.md — Vitest Scaffolding

**Session:** 10
**Date:** 2026-04-27
**Type:** chore — no behavior change

## Summary

Add Vitest to the repo so tests have a place to land. The council bugs reviewer
has flagged "no test suite" every session. This PR gives us a working `bun run
test` command and covers the isomorphic/pure-function layer with concrete tests.
No Firestore emulator, no server-only code under test — that's a follow-up PR
once the scaffold exists.

## Scope

**In:**
- `vitest` dev dependency + `vitest.config.ts`
- `bun run test` (vitest run) and `bun run test:watch` scripts in package.json
- `src/__mocks__/server-only.ts` shim (empty export; lets tests import modules
  that guard themselves with `import "server-only"`)
- 3 test files covering the isomorphic layer:
  - `src/lib/routing/scoring.test.ts` — `tierForType`, `scoreWaypoint`,
    `buildRankedGroups`
  - `src/lib/urban-explorer/cityAtlas.test.ts` — `localizedText`,
    `NeighborhoodLiteSchema` parse / reject
  - `src/lib/routing/cache.test.ts` — `neighborhoodsCacheKey`,
    `waypointsCacheKey`

**Out:**
- Firestore emulator / `firebase-admin` mocks — `recommend.ts`, `firestore.ts`,
  `firebaseAdmin.ts` all need a real emulator; separate PR
- React component tests (jsdom) — separate PR when a UI bug warrants it
- CI integration — `bun run test` will naturally slot into the existing
  `council.yml` workflow in a later PR once we know the test run is stable

## Architecture Decisions

### 1. `server-only` shim via alias (not `vi.mock`)

`cache.ts` (and anything else guarded with `import "server-only"`) throws at
import time in a non-Next.js host. A per-file `vi.mock('server-only')` would
need to appear in every test file that transitively imports a guarded module.
Instead, the vitest config aliases `server-only` → `src/__mocks__/server-only.ts`
globally. The shim is an empty file (`export {}`), which is exactly what
`server-only` does in production — it has no exports, it only throws.

This alias does NOT mask the real `server-only` behaviour for the app; it only
applies during `vitest` runs. The `moduleResolution: "bundler"` in `tsconfig.json`
is unaffected.

### 2. Node environment (not jsdom)

All test targets are pure TS: Zod schemas, scoring math, crypto hash. No DOM.
`environment: 'node'` keeps test startup fast and avoids the jsdom shim surface
for non-UI code.

### 3. Path alias mirrors tsconfig

`@/` → `./src` in `vitest.config.ts` mirrors the `tsconfig.json` paths entry.
Using `resolve(__dirname, './src')` avoids `vite-tsconfig-paths` as a dependency
(one less package, same result for the two aliases we actually use).

### 4. Tests cover pure-function contracts, not implementation details

- `scoreWaypoint`: tests the formula (trending * typeWeight * vibeBonus /
  clampedDetour) with known inputs; covers the 5-minute detour clamp, vibe
  bonus, and primary/secondary/other tiers
- `tierForType`: exhaustive over WaypointType × persona
- `buildRankedGroups`: verifies TOP_WAYPOINTS_PER_CITY cap and detour-ascending
  city sort
- `localizedText`: locale fallback to `en`, explicit locale resolution
- `NeighborhoodLiteSchema`: valid parse, id-regex rejection, trending_score
  range rejection
- `neighborhoodsCacheKey`: deterministic output for same input, distinct output
  for distinct inputs, `neighborhoods:` prefix
- `waypointsCacheKey`: sort-independence (same set, different order → same key),
  dedup

### 5. No snapshot tests

Snapshot tests are fragile for this codebase — scoring weights and persona
configs change frequently and would invalidate snapshots on every tweak. All
assertions are explicit value checks.

## Implementation Steps

1. `bun add -D vitest` — add to devDependencies
2. Create `vitest.config.ts` at repo root (node env, `@/` alias, `server-only`
   shim alias)
3. Create `src/__mocks__/server-only.ts` as empty shim (`export {}`)
4. Add `"test": "vitest run"` and `"test:watch": "vitest"` to package.json
   scripts
5. Write `src/lib/routing/scoring.test.ts`
6. Write `src/lib/urban-explorer/cityAtlas.test.ts`
7. Write `src/lib/routing/cache.test.ts`
8. Run `bun run test` — all pass
9. Run `bun run type-check` — no new errors

## Security Notes

- No credentials, env vars, or external calls in any test. Pure in-process.
- The `server-only` shim does not weaken the production guard — it's scoped to
  the test runner only.

## Edge Cases

- `waypointsCacheKey` dedup: `['las-vegas', 'las-vegas']` should produce the
  same key as `['las-vegas']`. Tested explicitly.
- `localizedText` fallback: locale `'ja'` on a text with only `en` populated
  should return the `en` value.
- `NeighborhoodLiteSchema` strict: a doc with an extra unknown field should
  fail parse (`.strict()` is set on the schema).
- `buildRankedGroups` with zero waypoints for a city: city still appears in
  output, `rows: []`.
