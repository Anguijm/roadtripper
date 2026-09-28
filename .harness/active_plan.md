<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/waterfalls-and-upsert`

## Goal

Two things the store's first build showed. Waterfalls are tagged
`waterway=waterfall` in OpenStreetMap, not `natural=waterfall`: one of
the latter in the whole country, and a classic roadside stop missing from
the list. And the builder replaced the table on every rebuild, which
would have thrown away every description fetched and every score bought
the moment the tag list changed. So: the tag, and a rebuild that keeps
what was paid for.

## Ship rule, written before the work

1. `waterway=waterfall` is a waterfall, in the record's parser, in the
   Overpass query (QUERY_VERSION 3) and in the extractor's candidate test.
   A creek or river with a Wikidata id is still not a stop; the waterfall
   rule is the only `waterway` that is, and it is tested next to the rule
   that excludes the rest.
2. The builder upserts. A stop already in the store keeps its encyclopedia
   lines and its score unless the part of the record the model saw changed
   (name, kind, what the map says), in which case the score is cleared to
   be bought again; the lines are cleared only when the Wikidata or
   Wikipedia link changed. Stops no longer in the extract are removed. The
   ids seen go in a temporary table, not in memory.
3. The writer is a small module with a test on an in-memory database:
   unchanged record keeps the score and the lines; a changed name, kind or
   map line clears the score; a changed link clears the lines and keeps
   the score; a vanished stop is removed; a moved stop keeps everything
   but its position.
4. The rebuild for real runs after the describe pass finishes, so the two
   do not fight over the file: re-extract with the new tag (free, 14
   minutes), upsert, and report how many scores were kept and how many
   waterfalls arrived.

**Cost:** $0 now. The new waterfalls are described for free and scored
with the rest once the account has credits.

**Weakest part:** The "unchanged" test compares name, kind and detail
exactly; a mapper fixing a typo in a name clears a score that was fine,
and rebuying it costs a fiftieth of a cent. The extractor's centre for a
waterfall mapped as a way (a wide fall) is the mean of a few of its
nodes, which is on the water and close enough.

## Gate 1 proofs

- Rule 1: with `waterway === "waterfall"` removed from the parser, "maps tags to kinds…" fails on Gorman Falls. Restored. The extractor's smoke on a synthetic file keeps a `waterway=waterfall` node and (as the parser will decide) also passes the creek through as a candidate, which `fromOsmElement` then refuses: one parser.
- Rule 2 and 3: with the score kept unconditionally in the upsert, "clears the score when the name, kind or the map's line changed…" fails. Restored, `cmp` clean.
- 460 tests, 2 new; lint and types clean. Rule 4 runs after the describe pass; its numbers land in the PR.

## Council round 1 on #78 (CONDITIONAL, bugs 6, maintainability 6), and what changed

- `removeUnseen` takes a floor and refuses, throwing, when a run wrote fewer ids than it; the builder passes half the rows already there, so an empty or truncated extract cannot wipe the store. Tested, and with the check disabled the test fails.
- the thirty-second lock wait says why thirty and what a timeout means; the upsert says why the compare is exact and what a typo costs, and points at the test
- Answered, not changed: the store is written only offline by this repository's own Node and better-sqlite3, whose bundled SQLite is 3.53.4 (`ON CONFLICT ... DO UPDATE` needs 3.24). The deployed app opens the file read-only and never runs the upsert.

## Council round 2 on #78 (CONDITIONAL, bugs 8), and what changed

- the removal floor is never under ten once the store holds anything, and zero for an empty store (nothing to remove, and a first small build must go through)
- the summary line now tells "not JSON" from "not a stop": the second is the extractor's loose superset being cut by the parser, expected and reported, not broken

## Council round 3 on #78 (CONDITIONAL, bugs 8), and what changed

- the extractor's waterfall line says why it is the one `waterway` that is a stop and that the parser in record.ts makes the real decision
- a parser throw on one element is counted and named, not fatal to the run
- Answered, not changed: writing to a temporary database and renaming would break the point of the upsert, which is to keep the live file's paid-for columns and let a rerun resume; every write is a transaction and an aborted run leaves a valid file with the rows written so far
