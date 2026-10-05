<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u8-roadside-stop-in-trip`

## Ship rule (written before the work)

Declared in `gauntlet/round-2.md` before the build: U8 ships when the
critic approves the 390 px screenshots of the day's list with a roadside
place in the trip, and of a reloaded trip holding one; when the tests pass;
when a mutation proof has turned each new test red *before* the push; and
when the operator has looked. Closes #99 and #97.

**Cost:** $0. No model call, no store write. The screenshot that adds a
stop triggers one recompute, which is the app's own behaviour.

**Weakest part:** The mark has to fit on a line the row already has,
because the row may not get taller — and I first wrote, in a code comment,
that "✓ In the trip" is shorter than every kind word it replaces. It is
not. It is 13 characters; "zoo", "arch", "cave" and "park" are three or
four. For those the line grows and can wrap. Checked before it shipped,
and only because I went to read the kind words rather than trust the
sentence I had written. The rows were never exactly two lines — the second
line already wraps on a long town name — so this does not break a
guarantee that held, but it can make a short-kind row taller, and only a
screenshot of a route with such a place would show it.

## #99 is latent, and I filed it as though it were live

`initialTrip` is a prop of `PlanWorkspace` that no page in `src/app` ever
passes; only tests set it. `TripCard`'s resume link leaves stops out on
purpose ("V1: stops are intentionally excluded… users re-add them
interactively"). So no saved trip ever reaches the sheet with its stops,
and the town section #99 describes cannot appear for a real user.

I filed #99 saying "reopen a saved trip that holds a roadside place and
the sheet draws a town section for it". I found it through the DOM test
harness, which sets `initialTrip` directly, and did not check whether
anything in the app could do the same. Corrected on the issue.

The fix stays: it is one `isCityId` check, and the day stops are
serialised — which TripCard's own comment anticipates — it would go live.
The spec's #99 screenshot is dropped, because there is no live state to
photograph; the tests hold it instead.

## U8 round 1: approved

The row says "✓ In the trip" in plain words on its existing second line
without growing, agrees with the card's "✓ Added" above it, matches the
other rows but for a quiet highlight, and nothing is cut or scrolls
sideways at 390 px. One round, judged blind.

Mutation proofs were run before the push, the first unit to do so under
CLAUDE.md's new rule 2: seeding `stopTowns` from every stop (2 fail),
never marking the row (2 fail), the mark on a line of its own (1 fails).

Gates: 660 green across 64 files; `tsc --noEmit` clean; `eslint` 0 errors.
