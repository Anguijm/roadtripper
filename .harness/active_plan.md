<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/roadside-store`

## Goal

John's requirement in his words: pull the phone out, open the website, put
a few characteristics of the trip in, and without hitting Claude get
feedback back. Step 22 shipped a demo on one road that I stitched by hand.
This PR makes roadside stops a lookup for any road in the country: a
store built once, offline, from the OpenStreetMap extract of the United
States, described from the encyclopedias, scored once by Jev under a cap
he said yes to (five to ten dollars), and read by the plan page with no
network, no model and no key at plan time. The same shape as the atlas
and the drive graph.

## Ship rule, written before the work

1. One parser. The extractor (`scripts/osm/extract-roadside.py`, pyosmium,
   three passes over the 12 GB file because the positions of ways and
   relations live in their nodes) keeps a loose superset of candidates as
   OSM elements; the store builder runs `fromOsmElement`, the same
   function the corridor pull uses, over them. Nothing about what a stop
   is lives in Python.
2. The store is `data/roadside.sqlite`, gitignored like the extract, with
   one row per stop: position, kind, what the map says, the Wikidata and
   Wikipedia links, the encyclopedia lines and the score, with an index on
   position. The builder replaces the table; the describe and score passes
   fill columns by id and resume where they stopped.
3. Describing uses the corridor's client unchanged, in chunks, tagged kinds
   before "notable", so scoring can start early. Scoring is jev-lab's J10:
   J9's question and state, one stop per request, three tranches (tagged
   kinds; notable with a Wikipedia page; notable with only a Wikidata id),
   stopping at the cap from the ledger. An unscored stop is not a survivor.
4. At plan time the page decodes its route, asks the store for scored stops
   at or above the line inside the route's padded tiles (one indexed range
   query per tile), then keeps those within 10 km of the road itself, in
   road order. A missing store, a bad row or a route that does not decode
   gives an empty list and one warning, never a broken page. The
   one-corridor JSON file and its builder go away.
5. Tested without the real store: a temporary SQLite in the same schema
   with a stop inside the corridor above the line, one below the line, one
   outside the buffer, and one in two tiles at once; the missing-store
   path. The corridor's own 1,074 stops are checked against J9's scores by
   the scorer (`--check-corridor`), and the plan page is rendered for a
   route the first corridor never touched.

**Cost:** $0 at plan time. Once: the extract download (free), about an
hour of CPU, an evening of polite encyclopedia requests (free), and up to
ten dollars of Jev from the ledger.

**Weakest part:** The store is a snapshot; a place mapped after the build
is not on it until the next build. The line and the question were
validated on one corridor in one state. And the store is not deployable
by git: it is hundreds of megabytes, so the deployed app needs it copied
onto its volume, which this PR does not do.

## Gate 1 proofs (so far; the scoring of the Wikidata-only tranche is still running)

- Rule 1: the extractor's smoke on a synthetic file emits a node and a way with its centre; on the United States file: 90,544 candidate relations, 275,370 candidate ways, 251,099 candidate nodes, 14 minutes, memory flat at half the machine (the first version held 56 million node references in Python and would not have fit).
- Rule 2: the store, built under Node (Bun's SQLite binding crashes at startup): 616,163 elements read, 323,888 stops, 58 MB. By kind: notable 178,633; park 53,391; historic 28,099; artwork 20,795; attraction 16,448; museum 14,292; viewpoint 7,438; tower 1,244; cave 973; theme park 842; lighthouse 782; zoo 633; arch 317; waterfall 1.
- Rule 3: tranche 1 (every tagged kind, 145,255 stops) scored in 27 minutes, 26,741 at or above 0.45; parks almost never (296 of 53,391), viewpoints and arches mostly. The scorer was paused between tranches until the describer finished, so the Wikidata-only flood is scored with its descriptions; 326 rows scored before their description landed were reset and rescored.
- Rule 4, proven on a road the first corridor never touched: Denver to Santa Fe renders in 1.2 s with 278 roadside stops along I-25, amber diamonds through Denver, Colorado Springs and Pueblo; screenshot sent to John.
- Rule 5: the store test on a temporary database; with the line removed from the query, two tests fail; with the tile dedupe removed, one fails; restored, `cmp` clean. The corridor check after tranche 1: 7.3% of the corridor's scored stops crossed the 0.45 line against J9, all within a few hundredths of it and all with the map's line newly in the state; the spec stops the run above 10%.
- The describe pass died once at row 60,000 on a dropped connection; the client now retries a dropped connection once (test: "retries once when the connection drops…", which fails with the retry removed) and the pass retries a chunk five times.
- 457 tests; lint and types clean.

## Council round 1 on #75 (BLOCK, maintainability 4), and what changed

- comments: the sampling constants and what the mean of sampled positions costs (a river's centre off the line, a crescent park's outside it; fine for a pin, not a geofence); the chunk size against the two APIs' batch limits and as the unit of resumption; the tagged-kinds-first order and why; the 30 s times attempt backoff; the columns' lifecycle across the three passes; the 10,000-row transaction; the about order
- the store keeps one read-only connection per path and tests close them; a custom path no longer opens a handle per call
- the dropped-connection error names both failures, first and second
- the store is found like the atlas is: `ROADSIDE_STORE_PATH`, then beside the atlas, then under the standalone output; `docs/roadside-store.md` holds the build steps and the two deploy paths (a volume, or a build-time download traced in like the atlas), and says plainly that this repository does not decide where the app runs
- ANALYZE after the load
- Answered, not changed: the one-corridor JSON is not kept as a fallback. A silent fallback to Amarillo to Austin would make a broken deployment look like it works on one road and not the rest, which is the quiet degradation the house refuses; a missing store already gives no stops and one warning, and the deploy doc is the fix. The antimeridian does not cross the United States store's roads.

## Council round 2 on #75 (CONDITIONAL, bugs 6), and what changed

- a missing store logs one warning per process, naming the three places it looked and the doc
- the name and the line are JSX text children (`{s.name}` in the link, `{s.about}` in the paragraph, `title` on the marker); a new test renders a stop whose name and line carry HTML and asserts it comes out as characters
- taken from the deferred list: VACUUM after the rebuild; `data/**` and the extractor's venv are out of lint's way (the 316 warnings were the Node bundles)
