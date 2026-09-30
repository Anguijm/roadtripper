<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u7-add-roadside-stop`

## Ship rule (written before the work)

Declared in `gauntlet/round-2.md` before the builder ran, and repeated
here because Gate 1 reads this file: U7 ships when the critic approves the
390 px screenshots of the roadside card offering "+ Stop here", showing
"✓ Added" for a place already in the trip, and with the control off and
the reason beside it at the trip's cap, against bar rules 1, 3, 4 and 7;
and when the SSR tests pass — the three states, that adding a roadside
place puts it in the trip's stops, and that adding the same place twice
leaves one stop.

**Cost:** $0. No model call, no store write, no new route. Adding a stop
already recomputes; this is a second way to reach an action the sheet has.

**Weakest part:** A roadside place becomes a `TripStopMarker`, whose field
is called `cityId`, and it is not a city. `stopTownFrom` already falls
back to a town synthesised from the stop itself with no places in it, so
nothing breaks, but the name of the field will now be wrong for some of
its values, and anything that later assumes a `cityId` is in the atlas
will be wrong in a way the compiler cannot see. Renaming the field is a
bigger change than this unit and would touch the saved-trip schema.

## What the screenshot loop found before the critic did

Adding a roadside place left the drive times stale and said so in red.
`recomputeAndRefreshAction` validates `selectedCityId` against
`/^[a-z0-9-]{1,100}$/`, and a roadside id is an OSM one
(`osm:way:1059981743`) with colons in it, so the server threw the whole
recompute away as `invalid_input`. The tap worked, the stop went in, and
the route did not move.

Measured on a live server: the action returned in **3 ms** without
touching the Routes API; adding a *town* took 293 ms; after the fix the
roadside one took 457 ms. That is the whole diagnosis in three numbers,
and it is what told me the fault was mine and not the environment.

The repair is not to widen the guard. `selectedCityId` is untrusted input
reaching a read, and it means "the city whose places to load" — a lookout
has none, so the sheet should never have sent one. `isCityId` now lives
once in `cityAtlas.ts` and both sides read it: the server that refuses and
the client that decides what to send.

**No SSR test could have caught this.** The failure is inside a server
action the suite never calls, and every test was green through it. Only
the runner's screenshot of a real state found it.

## U7 round 1: the critic failed it on rule 3, on weight rather than words

The card's own action wore the town row's quiet grey outline while "Open
in Maps", which leaves the app, was the only gold thing on the card — so
the faintest mark was the one thing the card exists to offer, and the
loudest sent the person away. The added state compounded it: a solid green
block, the brightest thing on the sheet, which made the most inviting
target the one that undoes the add.

I copied the town row's styling without looking at what it would sit next
to. In a row of two equal buttons that weight is right; on a card headed
and bordered in gold it inverts the hierarchy.

"+ Stop here" is now filled in the card's own gold, "Open in Maps" is the
quiet outline, and the added state is a gold rule and gold text on the
card's background — done rather than a thing to press, still tappable so a
stop can come out. Two tests pin the three weights.

**Routed on, not fixed here:** the critic noticed that a place reading
"✓ Added" is still listed among the day's places with nothing marking it
as already in the trip. That is the roadside list's, not the card's, and
it is a real contradiction on one screen. Named here so it is not lost.

## U7 round 2: approved

The critic approved both screenshots: the card keeps its name, its line,
how far along the road and "Open in Maps" (rule 4); the words are the ones
the towns already use with nothing from the glossary's never column (rule
1); the filled "+ Stop here" is the heaviest control on the offer screen
and flips to a clear, quieter "✓ Added" once it is done (rule 3); and
everything fits 390 px with full-width targets and no sideways scroll
(rule 7).

Two rounds of the six, each judged by a fresh critic.

**The at-cap screenshot was not taken and the critic was told why.**
Reaching that state live means adding seven stops, and each one triggers a
paid route recompute against a round declared at $0. It is covered by two
SSR tests instead — the control off with the reason beside it, and the
control still on for a place already in the trip at the cap, so a full
trip is never a trap. Both critics were told it was missing; neither
counted it against the component.

Gates: 645 green; `tsc --noEmit` clean; `eslint` 0 errors.

## Council round 1 on #96 — 🔴 BLOCK, two applied and two already true

**3 and 4 applied.** `CITY_ID_PATTERN` now says what its 100 is for and
that it is deliberately *tighter* than the 200 on
`SavedTripStopSchema.cityId`, which has to hold an OSM id and so cannot be
this narrow; the `MAX_TRIP_STOPS` check says the number is the Routes
API's waypoint ceiling, that the server refuses first, and that the saved
trip schema caps at the same number.

**1 was already true, and there is now a test saying so.**
`SavedTripStopSchema.cityId` is `z.string().min(1).max(200)` with no
pattern, so an OSM id parses. The council asked for the test rather than
assuming; the test parses a trip holding both a roadside stop and a town
and asserts `isCityId` is false for the first and true for the second, so
the two limits cannot quietly converge.

**2 was already true and the build proves it.** `cityAtlas.ts` imports
exactly one thing, `zod/v4` — no `server-only`, no admin client, no node
builtin — and `npx next build` completes with the client bundle that
imports `isCityId` from it through `PlanWorkspace`. A "confirm X" item is
answered by confirming it, not by moving code.

Gates: 648 green; `tsc --noEmit` clean; `eslint` 0 errors; `next build`
succeeds.

## Council round 2 on #96 — both real, and both mine

**1. I broke the towns' refresh while fixing the recompute.** Sending
`undefined` when the *last* stop is a roadside place meant that a trip of
[Lubbock, The Big Texan] sent no selected city at all, so the towns behind
the roadside stop quietly stopped refreshing. It now searches backwards
for the last stop that is an atlas city, which is what "the city whose
places to load" should always have meant.

**2. A narrow but real leak.** A saved trip reloaded from Firestore seeds
`stopTowns` from *every* stop it holds, roadside ones included, so an
entry can exist for a roadside place. Taking it out from the card left the
entry behind. Cleared now, on the way in as well as out, because that is
the same right answer either way and deciding would mean reading
`tripStops` inside the handler.

**Neither fix is guarded, and the mutation says so.** Putting the raw last
stop back leaves all 649 green. Both live in a client effect that builds a
server-action payload, which the SSR suite never runs — the same blind
spot as the U6 functional-update fix, and the same reason: `environment:
"node"` and no DOM. It belongs to issue #95 rather than to this branch.

Gates: 649 green; `tsc --noEmit` clean; `eslint` 0 errors.
