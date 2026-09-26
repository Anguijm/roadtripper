<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/atlas-hardening`

## Goal

Land the council's round-3 remediations on PR #42, which merged at its
round-2 commit before they were applied.

The verdict on that round was BLOCK. The operator merged past it on
2026-09-22, which is his call; this PR carries the four items so main stops
being without them. Code only: the re-exported atlas binary from that commit
is deliberately left out, and so is a `storage.ts` that leaked in by a careless
`git add -A` and belongs to the Clerk-removal branch.

## Change

1. **R-tree integrity gate in the export.** `insert or replace` assigns a new
   rowid on conflict while the R-tree row was written against the old one.
   Cannot happen today (Firestore ids are unique); would return wrong corridor
   results with no error if it ever did. Now deduped by id first, and the
   export verifies the join and refuses to publish a desynced file.
2. **Enum narrowing** on `type` and `tier` reads, with a logged fallback, so an
   upstream tag added before a redeploy surfaces as a warning rather than an
   unknown string inside a switch.
3. **Bound-parameter ceiling** asserted beside the query it protects.
4. **`allCities` degrades** to "no candidates" on a locked or truncated file
   rather than an error page.

Plus the two comment requests (30-day staleness threshold, 250-city test floor).

## Ship rule (declared before the work)

The diff contains no binary and no trip-storage code. Lint, types, and the
full suite green against main's own atlas.

**Cost:** $0. No API calls, no data change.

**Weakest part:** The integrity gate runs at export time and so is exercised
only when someone re-exports. Nothing in CI runs the export, because it needs
Firestore. So the one check this PR most cares about has no automated proof
beyond the run I did by hand.

## Council round 4 (CONDITIONAL), and what changed

Four items, all applied:

1. `allCities` no longer swallows errors. Round 3 asked for the try/catch; round
   4 correctly observed it masks a broken atlas as an empty result. The caller
   already runs under `Promise.allSettled` and renders a visible failure, so
   letting it throw is the honest behaviour. Recorded here because the two
   rounds contradict each other and a future reader should know which won.
2. `safeWaypointType` / `safeCityTier` take `unknown`. `safeParse` already
   handled any input; the type now says so.
3. The bound-parameter comment names the file that defines the caller's cap.
4. EXDEV fallback: if present on this branch, copies to a sibling on the
   destination filesystem and renames, which is atomic there.
