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
