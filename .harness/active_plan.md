<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/t2-tags-in-plan-lookup`

## Ship rule (written before the work)

Ships when the stops the plan page reads carry their tag scores, so that
`rankFor` can be given something to rank. Concretely:
`survivorsAlongRoute` attaches a `scores` field to every marker it
returns, read from `roadside_tag` in batched queries against the table's
primary key, and `RoadsideMarker.scores` is typed as `TagScores`. With
unit tests over a temporary SQLite store, including a stop with no tag
rows at all. No screen changed, no ranking applied yet: the chips and the
sort control are the next unit.

Why this slice: the vocabulary (#92) is in and the store holds the scores,
but nothing carries one to the other. This is the join and only the join,
which is a server change reviewable on its own. Applying it to the list is
a UI change with its own screenshot round, and mixing them would put a
Firestore-free pure query and a React render in one diff.

**Cost:** $0. One extra indexed read per plan render against a local
SQLite file. No model call, no route, no Firestore.

**Weakest part:** The cost of the join at plan time is argued from the
table's shape rather than measured on a real corridor. The primary key is
`(stop_id, tag)` `WITHOUT ROWID`, so a lookup by stop is a single index
seek, and the markers are fetched after the corridor has narrowed them —
but "after the corridor" is the thing to check, because getting it the
other way round would read tags for every candidate in the bounding
tiles rather than the few hundred on the road.

## What the store actually holds, measured before the work

Every stop that can appear on the map is tagged. At `MAP_THRESHOLD`
(0.45) the store holds 27,976 stops and all 27,976 have tag rows; none is
missing. The tagging run went further down than the map does — 31,941
stops tagged, the lowest at a general score of 0.02 — so the threshold has
room to move down without leaving a hole.

That matters for this unit: the join has no partial-coverage case on the
screen. A chip can never show a place the ranking cannot read. The
untagged path still has to work (a store built before the tagging run, or
a threshold moved below 0.02), which is why the tests cover a stop with no
tag rows, but it is a compatibility path rather than the common one.

## Gate 1 proofs

Four mutations, each restored from a copy taken first (`cmp` identical):

1. The missing-table guard removed from `tagScoresByStop`. Three tests
   fail, two of them the *existing* store tests — which is how the problem
   was found in the first place, not a test written to fit a fix.
2. The `KNOWN_TAGS` filter removed. "drops a tag the vocabulary does not
   know instead of carrying it" fails.
3. `TAG_CHUNK` raised to 100,000, i.e. one query. See below.
4. An untagged stop given `scores: {}` instead of no field. "leaves a stop
   the tagging never reached without a scores field at all" fails.

**Mutation 3 is the one worth writing down, because the first version of
its test did not catch it.** The test asked for 2,501 ids and checked the
rows came back. It passed with the chunking removed, because SQLite's
host-parameter ceiling is 32,766 on anything built since 3.32 and this
machine has a current build; the single oversized query simply worked. The
test proved the loop reassembles across chunks and proved nothing about
why the loop exists.

It now watches the SQL instead, through a proxy on the handle's `prepare`:
every statement that touches `roadside_tag` must carry at most 999
parameters, there must be more than one of them, and their widths must sum
to the number of ids asked for. That fails the moment the chunking goes,
on any machine, and it is a statement about the code rather than about the
SQLite this laptop happens to link.

## What the join costs, measured

Against the real 178 MB store, chunked exactly as the code does it, twenty
runs after three warm ones:

| markers | tag rows | per join |
|---|---|---|
| 50 | 900 | 0.53 ms |
| 200 | 3,600 | 2.05 ms |
| 500 | 9,000 | 4.28 ms |
| 1,000 | 18,000 | 9.58 ms |

Linear, about 9 µs per marker, and a tagged stop always has all eighteen
rows. A corridor of a few hundred markers costs a few milliseconds once
per plan render, against the route fetch it sits behind. The weakest part
written above is therefore closed: it was argued from the index and is now
measured. What is still argued rather than measured is the *ordering* —
that tags are read after the corridor narrows — which the code does at the
one call site and a comment there says why.

Gates: `npx vitest run` 589 green; `tsc --noEmit` clean; `eslint` 0 errors.
