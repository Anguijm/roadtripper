<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/corridor-descriptions`

## Goal

John looked at the labelling sheet and said the right thing: a name and a
kind are not enough to judge a place by, and most of the judging is
automatable anyway. So the order changes. Descriptions come first, from the
two free encyclopedias every stop with a Wikidata id can reach; the model
runs over the whole corridor with the description in front of it; John
reads only its yes list, with the description and a map link, and taps the
ones he would really stop for. This PR is the descriptions.

## Ship rule, written before the work

1. Free sources only: Wikidata entities and English Wikipedia extracts
   through the MediaWiki APIs, batched (50 ids, 20 titles), one request at
   a time, 250 ms apart, with our User-Agent. About 45 requests for this
   corridor. One retry after a pause on 429 or a 5xx; anything else stops
   the run with the status.
2. Every stop with a Wikidata id gets Wikidata's short description ("airport",
   "roller coaster"). Every stop with an English Wikipedia page, from the
   OpenStreetMap tag or the Wikidata sitelink, gets the page's first two
   sentences clipped to 240 characters at a sentence end where one falls
   late enough, and the page URL. Stops with neither get nothing, and the
   file says how many.
3. Titles follow MediaWiki's `normalized` and `redirects` maps, so a stop's
   result is keyed by the stop, not by whatever title Wikipedia answered
   with. Tested with a fixture that has both and a missing page.
4. Output is a sidecar, `data/corridors/<name>.descriptions.json`, keyed by
   stop id. The corridor file and the record schema are untouched: no
   re-pull, no version bump. Gitignored with the corridor.
5. Pure parsers and the batching loop live in `src/lib/roadside/describe.ts`
   with injected fetch and sleep; the script reads and writes files.

**Cost:** $0. Wikimedia's APIs are free; the run is about 45 requests.

**Weakest part:** An encyclopedia's opening sentence is a description, not
a reason to stop, so the reason step is still ahead. And 448 of the 1,074
stops have no Wikidata at all (murals, sinkholes, small memorials) and stay
name-only, which is uneven exactly where the pre-filter is weakest.

## Gate 1 proofs

- Rule 3: with the redirect step removed from `parseExtracts`, "keys each page by the title that was asked for, following normalized and redirects" fails. Restored, `cmp` clean.
- Rule 1 and 2: the batching test counts two Wikidata requests for 55 ids and two Wikipedia requests for 28 titles, three pauses of 250 ms, and checks a stop filled from both sources, one from Wikidata alone, one from the tag alone, and one left out.
- The run: 31 requests in 81 seconds. 1,074 stops; 627 reach an encyclopedia; 602 have a short description, 369 an opening; 447 have neither. Big Texan reads "restaurant and motel in Amarillo, Texas" and "a roadside attraction known for competitive eating".
- 430 tests, 7 new; lint and types clean.
