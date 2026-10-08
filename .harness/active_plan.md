<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u18-sparse-stretch`

## Ship rule (written before the work)

U17's critic: on Amarillo → Austin at 4 h a day, the only town offered is
Lubbock, 1 h 40 min out, under a day headed "4 h down the road from
Amarillo". Nothing on the sheet says that this is all there is. The atlas has
no town between Lubbock and Austin. The operator chose "Both" on
2026-10-08: say it plainly now, and scope adding towns upstream as its own
track.

This unit ships when the day that holds the towns ends on open road (a cut
with no town near) and the sheet says, under its towns, in a sentence:
"Lubbock is the last town before your 4 h are up". It names the farthest town
along the road. It does not appear when the day ends near a town, at a stop or
at the destination, or when no town fits. It needs:

- tests for the sentence and for each case where the line stays off the page
- mutation proofs before push
- a live check that the line shows on Amarillo → Austin at 4 h and is absent
  at 8 h
- the critic's approval

**Cost:** $0. Words only, from data the sheet already has.

**Weakest part:** "last town" means the last town *in the atlas*. That is
true of the app's list but not of Texas: Snyder and Sweetwater exist, the
atlas just does not have them. The sentence is about what the app can
offer, and the upstream track is what fixes the land.

## Upstream track (scoped, not built here)

Add the small towns the long corridors lack to Urban Explorer's atlas
(Abilene, Sweetwater, San Angelo…). Then re-export (`bun run atlas:export`)
and rebuild the drive graph. This is a cross-project data job.

## Built

- `lastTownLine(day)` in `words.ts`. It is pure and returns null unless the day holds the towns, ends with `endKind: "hours"`, has towns, and has a known drive.
- The line renders in `PlanWorkspace` under that day's town list, built from the towns actually shown.

## Mutation proofs, before push

Run against `last-town.test.ts` and `PlanWorkspace.days.ssr.test.tsx`. All were restored, and `cmp` confirmed it:

| mutation | result |
|---|---|
| drop the `endKind` guard | 3 red |
| take the first town, not the farthest | 2 red |
| drop the `holdsTowns` guard | 1 red |
| don't render the line | 1 red |

## Gates

tsc, eslint, vitest (742 passed) and next build are all clean.

## Live run, Amarillo → Austin

| budget | prod (old) | local (new) |
|---|---|---|
| 4 h | no line | "Lubbock is the only town before your 4 h are up" |
| 8 h | no line | no line (one day, ends at Austin) |

## Critic, round 1: REJECT

The critic made two points, and both were applied:

- **Placement.** The line sat after Lubbock's expanded places, in muted grey, and read as a footnote. It now sits directly under "Towns that fit today", before the rows, in body white. A test checks the order, and a mutation that moves the line back is caught (1 red).
- **Wording.** "before the 4 h run out" isn't how someone in a car talks. It now reads "Lubbock is the last town before your 4 h are up".

The critic also wanted the line to say where day 1 ends ("Day 1 ends in Lubbock"). That is not adopted. Where the day ends is the driver's choice ("+ Stop here"), and the heading already says it ends on the road.

After the change: gates are clean, with 742 tests passing.

## Critic, round 2: APPROVE

Applied its exact-wording point: with one town the line says "only", since "last" implies others before it. A test covers it, and the mutation that drops it is caught (1 red). After the change the gates are clean (743 tests) and the live line reads "Lubbock is the only town before your 4 h are up".

Out of scope, and now raised by three critics: the roadside diamonds stacked just below Amarillo read as "Lubbock in the wrong spot" and as a route line that starts at Lubbock. These are candidates for the next unit.
