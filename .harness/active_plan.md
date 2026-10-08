<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u30-why-a-detour`

## Ship rule (written before the work)

U21's critic: when a dated trip has days to spare, a town out of the way
appears at the bottom of the list ("Oklahoma City · out of the way"), and
nothing says why the list changed when the trip got dates.

Ships when:

- **The line.** Directly before the first out-of-the-way town in the
  list, a plain line says why: "3 days to spare, so one a bit out of the
  way", or "…so 2 a bit out of the way" when there are more. The count is
  the trip's spare days (U21's `spareDays`).
- **Only with detours.** No line when no town out of the way is offered.
- **Figures.** Its figures set in the mono face (rule 2).

Also required:

- a pure function for the words, with tests
- an SSR test of where the line sits
- mutation proofs
- a live screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** "spare" is counted at the budget's pace, so a person
who means to drive less than their budget has fewer real spare days than
the line says.

## Built

- `words.ts`: `detourNoteLine(spare, count)` gives "3 days to spare, so one a bit out of the way".
- `RecommendationList.tsx`: a `detourNote` prop. The line goes before the first out-of-the-way town the list draws (`firstDetourId`), in a fragment with that town's section.
- `PlanWorkspace.tsx`: the note is built from the trip's spare days and the number of out-of-the-way towns offered, and passed to the day's town list.

## Mutation proofs

Three are caught: "1 days", note on every town, and note not passed.

One survived as an **equivalent mutant**: building the note even without room. With no room, no town out of the way is offered, so the list never draws it. The guard was simplified to `detourCount > 0`.

## Gates

tsc, eslint, vitest (794) and next build are clean. A dev server stuck in a stale hot-reload state served the dated page with no towns, and was restarted. Production was correct throughout.

## Live

Dated Oct 20–24: "3 days to spare, so one a bit out of the way", right before Oklahoma City. Undated: no line.

## Critic: APPROVE (round 1)

Applied its wording point: "so here's a town a bit out of the way" ("one" made the reader work out what it meant).

Out of scope, noted: San Angelo and Oklahoma City both show a filled "Stop here", so there are two primaries on one screen.
