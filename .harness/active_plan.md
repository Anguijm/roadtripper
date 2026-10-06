<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u10-roadside-visits`

## Ship rule (written before the work)

The operator ruled on 2026-10-06: a roadside place added to a trip is a
visit, not an overnight. The route still runs through it; no day ends
there and no night is booked there. Ships when the days and the deadline
both read it that way, the live run shows it, the critic approves, the
mutation proofs ran before the push, and the operator has looked.

**Cost:** $0 beyond the one recompute the live run makes.

**Weakest part:** "Visit or overnight" is decided by `isCityId` — a stop
whose id is an atlas slug is an overnight, anything else is a visit. That
is right for the two kinds the app has today, towns and roadside places,
and wrong the day a third kind of stop exists, or the day someone wants to
stay the night at a roadside motel. There is no per-stop choice; the
operator chose the default and not the toggle.

## How it works

The day and deadline arithmetic was written for a world where every stop
is an overnight, and is right for that world. Rather than teach it about
visits, the visits are folded out first: a visit's leg is added to the leg
after it, so each stretch runs from one overnight to the next. Two folds,
the same rule — `foldVisitMinutes` for the days, `foldVisitLegs` for the
deadline — and a test that they agree about the stretches, which is the
invariant `days.ts` exists to keep.

The trip state itself is not folded. It keeps one leg per stop, because
the sheet indexes it by stop.

## Mutation proofs, before the push — two survived the first time

1. Every stop an overnight again: 6 fail.
2. A trailing visit's minutes dropped: 2 fail.
3. **The deadline not folded: 0 failed.** The fold lived at the sheet's
   one call site and nothing tested the deadline with a visit, so
   reverting it changed nothing any test could see. Moved *into*
   `computeDeadlinePressure`, so no caller can forget, and tested there.
4. **A day's stretch indexing every stop instead of the overnights: 0
   failed.** It only changes which road a tapped day frames, which no test
   could see. Moved into `stretchEnds`, which is handed every stop and
   picks the overnights itself, and tested there.

Both survivors were the same shape — knowledge at a call site where
nothing could check it — and both were closed by moving the knowledge
somewhere a test could reach, not by adding a test that reached into the
component. And one deadline test I wrote passed with or without the fold,
because its numbers came out the same either way; rewritten with numbers
where the fold changes the answer.

## Live run

The same trip as U9's screenshot — The Big Texan, then Lubbock. Before:
"Four days, with nights in The Big Texan Steak Ranch and Lubbock",
"Day 1 · Amarillo to The Big Texan Steak Ranch · 9 min". After: "Three
days, with a night in Lubbock", "Day 1 · Amarillo to Lubbock · 1 h 59 min"
— nine minutes and 110 folded together — and the route still drawn
through the steakhouse.

Gates: 690 green across 66 files; `tsc --noEmit` clean; `eslint` 0 errors;
`next build` succeeds.
