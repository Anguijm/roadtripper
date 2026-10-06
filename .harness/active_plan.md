<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u9-saved-trip-stops`

## Ship rule (written before the work)

Ships when reopening a saved trip puts its stops back, towns and roadside
places both; when a live run shows the route drawn through them with no
red banner; when the tests prove the stops survive the round trip and that
an unreadable stops parameter reads as no stops; when a mutation proof has
turned each new test red before the push; and when the operator has looked.

**Cost:** One Routes API recompute per reopen, the same call adding the
stops by hand makes. No new server call: the sheet already recomputes when
it opens with stops.

**Weakest part:** The stops go in the URL, and a URL is the one thing
anyone can edit. The parser takes them through the saved trip's own Zod
schema and caps them at the stop limit, and the server re-validates every
coordinate on the recompute — but a hand-built link can still name a stop
"Austin" at the coordinates of somewhere else, and nothing here can tell.
That was true of a saved trip in localStorage too; it is not new, only
easier to reach.

## What was built

`src/lib/trips/link.ts` writes a trip's stops into the reopen link as one
JSON parameter and reads them back; `TripCard` writes it and the plan page
reads it and hands the stops to the sheet as `initialTrip`. The sheet
already recomputes the route when it opens with stops, so a reopen costs
the one Routes call adding them by hand would — measured live, 269 ms.

`MAX_TRIP_STOPS` is one exported number now. The sheet and the saved
trip's schema each used to write 7 for themselves, and the reopen link
would have been a third.

#99's fix is live for the first time. A reopened town gets its section; a
reopened roadside place does not. Until U9 nothing could reach that code.

## Mutation proofs, before the push

Four, and one of them caught a test of mine that did not test what it
said. The page ignoring the stops (1 fails), TripCard leaving them out as
V1 did (1 fails), no de-duplication (1 fails), and no length ceiling —
which **passed** the first time. That test used a 10,000-character name,
which the schema's 200-character cap refused on its own, so it proved the
schema and nothing about the ceiling. It now pads a *valid* stop with
whitespace past the ceiling, so only the ceiling can refuse it, and the
mutation turns it red. This is the case the rule was written for: the
proof run before the push, not after a doubt.

## Live run

The reopen recompute fired with both stops in order and answered in
269 ms, no red banner. The first screenshot used a stop order no one would
choose — Lubbock, then the Big Texan, which is back in Amarillo — and the
app restored it faithfully into a 729-mile backtrack. Reshot in the order
they would have been added: 505 miles against 494 direct.

## Seen, and not this unit's

Adding a roadside place makes it the end of a day. The reopened trip reads
"Day 1 · Amarillo to The Big Texan Steak Ranch · 9 min" and claims a night
there. That is U7's behaviour, faithfully restored here, and it is wrong
for a place you pull over at rather than stay at. Raised with the operator
rather than fixed in this branch.

Gates: 674 green across 65 files; `tsc --noEmit` clean; `eslint` 0
errors; `next build` succeeds.
