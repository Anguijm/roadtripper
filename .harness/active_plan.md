<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u33-why-this-stop`

## Ship rule (written before the work)

The U31 and U32 critics: one town's "+ Stop here" is filled and the
others are outlined, and nothing says why. U31 fills the town nearest
where the day's driving runs out.

Ships when:

- **One line.** The primary town's header carries one line under its
  name: "Closest to where today's 4 h run out" on the day the title calls
  "today", or "Nearest where day 2's 4 h run out" on a later day, with
  the budget as the heading writes it.
- **Only there.** No other town carries it, and there is no line when
  no town is primary.

Also required:

- a pure function for the words, with a test
- an SSR test that it sits in the primary town's header only
- mutation proofs
- a screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** "nearest" is along the road, so a town just past the
day's end is called nearest when it sits a little beyond the budget.

## Built

- `words.ts`: `primaryTownLine(day, budgetMinutes)`.
- `RecommendationList.tsx`: a `primaryNote` prop, shown under the primary town's name only.
- `PlanWorkspace.tsx`: passes the note for the day's primary town.

## Mutation proofs

All 3 are caught:

- always "today"
- note on every town
- note not passed

## Gates

tsc, eslint, vitest (800) and next build are clean.

## Live

Amarillo → Austin at 4 h: the line reads "Closest to where today's 4 h run out", under Abilene only.

## Critic: APPROVE (round 1)

Applied its wording point: "Closest to where today's 4 h run out".
