<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/roadside-corridor`

## Goal

Stage 4 begins: roadside stops, the thing Urban Explorer structurally
cannot hold (Cadillac Ranch, the Big Texan). Steps 16, 17 and 18 together,
because each alone is a type or a function with nothing to run: pick the
sources, build the corridor query, define the roadside record. Then step
19 runs it once for real and the raw output gets read by eye.

## Ship rule, written before the work

1. The roadside record: a name, a lat/lng, a reason that may be null, a
   source, a kind, the source's own id, and nothing else required. No city,
   no neighbourhood. A zod schema, and a parser from an OpenStreetMap
   element that refuses an element without a name or a position. Tested.
2. The corridor query is pure geometry: decode the route polyline, cut it
   into tiles of at most 25 km of route, pad each tile's bounding box by the
   buffer (10 km by default), and keep a result only if its true distance
   to the polyline is inside the buffer. Tested: every point inside the
   buffer of a zigzag route falls in some tile; a point just outside the
   buffer is dropped even when its tile's box contains it.
3. Sources: OpenStreetMap through Overpass for the pull, tags for the
   things a road-tripper stops for (tourism attraction, museum, viewpoint,
   artwork, theme park, zoo; historic; man_made lighthouse, tower;
   natural waterfall, arch, cave entrance). Wikidata is step 23's source for
   reasons and is not called here. Google Places is not used. The Overpass
   client sends a descriptive User-Agent with a contact, one request per
   tile at least a second apart, a timeout, and one retry after a pause on
   429 or 504. Nothing is cached; step 19 runs once.
4. A script pulls one corridor for step 19: the route polyline from ORS
   directions (free, within the 200 a day), the tiles, the Overpass pull,
   and writes the raw records as JSON plus a plain listing to read, one
   line per stop, no filtering except "has a name". Not run in this PR.
5. No secrets added, no Google calls, no atlas changes.

**Cost:** $0. Overpass and ORS directions are free; the script runs once
per corridor by hand.

**Weakest part:** The tag list is a guess until step 19's eyeballing says
what it missed and what it dragged in; that is what step 19 is for. The
public Overpass instance is best effort: it can answer 504 under load, and
the script's one retry is the whole strategy. And the buffer is
straight-line distance to the polyline, so a stop 9 km away across a river
with no bridge is "in the corridor"; the drive-time check is a later step.

## Gate 1 proofs

- Rule 2: with `withinCorridor` trusting the box (always true), the far-corner test and the coverage test fail. Restored.
- Rule 1: with the name no longer trimmed, "refuses an element with no name" fails on the whitespace-only case. (Removing the empty-name guard alone did not fail anything: the zod schema's `min(1)` also refuses it. Two layers, and the proof had to target the one the schema cannot see.) Restored.
- Rule 3: with the retry on 429 and 504 removed, "retries once after a long pause" fails. Restored.
- 399 tests, 14 new; lint and types clean. Overpass answered a probe query in 5.8 s and ORS directions returned a 3,712-point LineString for Amarillo to Austin; the pull script is not run in this PR.

## Council round 1 on #60 (BLOCK, maintainability 4, bugs 6), and what changed

- every constant says why: the tile size against Overpass's limits and the request count, the buffer as minutes off the highway, the pole clamp, the pacing against the public instance's published policy (about two a second, about 10,000 a day), the retry pause and why only one retry, the 200 and 240 bounds and where they come from (the saved-trip schema; `MAX_REASON_LENGTH`, now imported rather than repeated)
- a pull can be cancelled: an optional signal stops between tiles and aborts the request in flight; tested
- the script refuses to continue when ORS returns no route
- `data/corridors/` is gitignored: raw pulls are read locally for step 19; the hand-labelled set from step 20 is the committed artifact
