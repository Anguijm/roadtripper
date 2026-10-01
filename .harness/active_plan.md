<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `chore/jsdom-interaction-tests`

## Ship rule (written before the work)

Ships when the suite can run a real handler in a real DOM, and the fixes
from round 2 that were provably unguarded are guarded — each with a
mutation that puts the old code back and turns the new test red. Existing
tests untouched: `environment: "node"` stays the default and a DOM file
opts in with a docblock, so none of the 62 server-render files changes.
Gate 1 green.

**Cost:** $0. Four devDependencies, no runtime dependency, nothing shipped
to the browser.

**Weakest part:** A DOM in a test runner is not a phone, and the thing I
most wanted to close is the thing it still cannot reach — whether the mood
chips actually read correctly aloud. jsdom has no accessibility tree and
no screen reader. This buys handlers and effects, not speech.

## What the DOM tests guard, and what they do not

**Guarded, each with a mutation that turns them red:**

1. The mood tap's functional update (#94). Two clicks dispatched in one
   `act` before React re-renders: with the closure form both read the same
   empty array and the second undoes the first, so one chip ends up on
   instead of two. Two tests fail.
2. The city sent with a recompute (#96). Three-way, which is the part
   worth having: taking the raw last stop sends a roadside OSM id, which
   the server refuses; guarding with `isCityId` but *not* searching
   backwards sends nothing, and the towns behind the roadside stop stop
   refreshing. Both mutations fail the same test, and only the backward
   search passes it.
3. The chips as a multi-select, through real clicks rather than markup: on,
   off again, the group named "choose up to 2", and never a third pressed.

**Not guarded, and the mutation is why.** The `stopTowns` cleanup (#96)
has no mark on the page. I wrote a test, removed the cleanup, and the test
stayed green: a lingering entry adds a city to `sheetFetch`, but whether a
town section is drawn comes from the day's candidate towns, not from that.
The council called it state "leaking in memory over long sessions", which
is exactly right, and memory is not a thing a DOM test can see. The test
is deleted and a comment in its place records why, rather than a passing
test that implies a guard.

**Still not guarded, and jsdom cannot help.** Whether the multi-select
reads correctly aloud. There is no accessibility tree and no screen reader
in a test runner. That one needs a person and a phone.

## What writing the tests found

A roadside place in a *reloaded* trip is drawn as a town section — filed
as #99. `stopTowns` is seeded from every stop in `initialTrip.stops`, and
`sheetFetch` turns each entry into a city the sheet lists. The U7 spec
said in as many words that this must not happen; the SSR test I wrote for
it asserted the wrong string, checking that `What's in <name>` was absent,
which it is for a reason unrelated to the bug.

It is left for #99 rather than fixed here, because this branch adds a test
layer and a fix for a U7 behaviour belongs with U7's own gates. The test
that found it asserts the broken state explicitly, labelled, so the check
below it cannot pass on a sheet that never had the entry.
