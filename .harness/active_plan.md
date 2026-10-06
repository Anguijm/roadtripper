<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u12-map-labels`

## Ship rule (written before the work)

Three critics in a row named it: on the map, "The Big Texan Steak Ranch"
was printed over "Amarillo" and neither could be read. Ships when Amarillo
reads, the visit keeps its numbered square, the town stop keeps its name,
no marker has moved (rule 6), the critic approves, and the mutation
proofs ran before the push.

**Cost:** $0.

**Weakest part:** The effect that draws stop markers is guarded only by
reading its source, because it runs only inside a real Google map. A
source check catches a revert of the line it names, not a different wrong
line; it is the guard this repo already uses for its map effects, and it
is weaker than running the code.

## The fix, and why it is not a label-dodging engine

A trip stop carried its name because "a stop is where a day ends, and the
framed day's end must read as a town" (round 5, the comment on effect 3).
Since U10 a roadside place is a visit and ends no day, so that reason no
longer reaches it. `tripStopLabel` gives a town stop its name and a visit
none; the visit keeps its numbered square, and its name stays in the
marker's title for a screen reader and on the sheet's row and card.

Nothing moves and no label avoids another. Rule 6 was written after a
spreading engine for stacked diamonds put Amarillo's places in New Mexico,
and the same instinct for labels would have gone the same way. This fix
removes a label whose reason had already gone, rather than placing labels
around each other. A town stop beside an endpoint could still collide;
that is rarer, because towns sit further apart than a steakhouse and its
city, and it is left to the zoom and a pinch as rule 6 says.

## Mutation proofs, before the push

1. Every stop named again: 1 fails.
2. Effect 3 calling `endpointLabel` directly instead of `tripStopLabel`:
   **0 failed the first time.** The effect only runs inside a real Google
   map, and I wrote it off as unguardable — "the rule is tested; the
   one-line call is not" — and drafted that into this plan. Then an
   existing days test failed for an unrelated-looking reason: it reads
   `RouteMap.tsx`'s source and asserted the old `label:` line. That is how
   this repo already guards the map effects that cannot run in a test, and
   it was the answer to the gap I had just declared closed-off. It now
   asserts the effect applies `tripStopLabel(stop)` and does not name every
   stop; the revert turns it red.

## A process fault found on the way

The local screenshot hung for ten minutes. The production check for U11
and the screenshot both started headless Chrome on debugging port 9336 at
once, collided, and left a Chrome holding the port. Killed by its PID; the
runner scripts now take `SHOT_PORT`, so two runs can go side by side.

And the first production check for U11 was worthless: a `curl` poll found
no "Tight" box seconds after the merge, before any build could ship,
because the box only exists after the browser's recompute. Rechecked in a
real browser against production, where the old build would have shown it
— and where "2 h of driving left today", not the "4 h" of the moment
before the recompute answers, proved the recompute had landed. CLAUDE.md
says so now (#107).

## Critic

Approved on the first round: Amarillo reads, stop 1 is still its numbered
square, Lubbock is still named, nothing moved. Outside this unit, it noted
Fort Worth's dot sitting on its own label and the Austin diamond covering
the end of "TEXAS" — map-tile and candidate-label overlaps, rule 6's
territory, left alone.

Gates: 703 green across 67 files; `tsc --noEmit` clean; `eslint` 0 errors.
