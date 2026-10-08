<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u17-detour-limit`

## Ship rule (written before the work)

U14's critic noticed Oklahoma City offered as a town that "fits today" on
Amarillo → Austin, though it lies north-east, not on the way. Ships when a
town counts as ahead only if going through it is at most a quarter longer
than going straight, measured the way the rule already measures — straight
lines, no API — so OKC drops off that trip and every town on a real route
stays; with tests from the measured trips; mutation proofs before the
push; and a live check that OKC is gone and Lubbock is still offered.

**Cost:** $0, and can only go down. The filter runs before the free drive
graph and before the paid Routes fallback; a stricter filter sends that
fallback a subset, never more, and it is capped either way.

**Weakest part:** 1.25 is a tuning number, chosen from three trips, and it
measures straight lines, not roads. A town a quarter off the straight line
can be right on a highway that bends (or the reverse). The three trips
were picked to cover a near-straight route, a diagonal and a dog-leg; a
fourth kind of trip could want a different number.

## The fault

`makesProgress` calls a town ahead when it is closer to the destination in
a straight line than the start is, and not past it. Its comment says a town
at right angles is excluded "by Pythagoras" — true only at exactly right
angles. Oklahoma City is 578 km from Austin against Amarillo's 667, so it
passes; going through it is about 1,000 km against 667 direct.

## Measured, before choosing the number

Detour ratio = (start→town + town→destination) / (start→destination),
straight lines, for every town today's rule offers within a day:

| trip | kept at 1.25 | dropped |
|---|---|---|
| Amarillo → Austin | Lubbock 1.07 | **Oklahoma City 1.45** |
| Dallas → Denver | Fort Worth 1.02, Oklahoma City 1.05, Tulsa 1.19 | — |
| Chicago → Nashville | Indianapolis 1.05, Louisville 1.07, Cincinnati 1.23 | St. Louis 1.30, Dayton 1.30, Columbus 1.53 |

Every town on the road the trip actually takes — US-84 through Lubbock,
I-65 through Indianapolis and Louisville — is well under 1.1. Oklahoma
City is fine on Dallas → Denver (1.05) and wrong on Amarillo → Austin
(1.45): the same town, judged by the trip.

## Mutation proofs, before push

Each mutation was applied to `progress.ts`, the progress tests were run, and the file was restored from a copy (`cmp` identical):

| mutation | result |
|---|---|
| remove the detour clause from `makesProgress` | 2 tests red |
| loosen the limit to 1.5 | 2 red |
| tighten the limit to 1.05 | 3 red |

## Gates

tsc, eslint, vitest (734 passed) and next build are all clean.

## Live run

Amarillo → Austin, compared against production, which was still on the old build:

| budget | production (old) | local (new) |
|---|---|---|
| 4 h | Lubbock and Oklahoma City fit today | **Lubbock fits today** |
| 5 h | Lubbock, Oklahoma City, Fort Worth, Dallas | **Lubbock, Fort Worth, Dallas** |

## Cost note

The filter runs before both the free drive graph and the paid Routes fallback in `radial.ts`. A stricter filter can only shrink what the fallback is asked to price. Flagged in the PR for the operator's veto, the same way U16's reading of the hard stop was.

## Critic

APPROVE on the first round. It confirmed that Oklahoma City is gone from the headline, the list and the map, and that nothing else moved.

Issues the critic raised outside this unit, kept here for the next one:

- The route line looks as if it starts at Lubbock, not Amarillo.
- A diamond sits just south of Amarillo, away from Lubbock's label.
- Only one town is offered for a 4 h day, and it is 1 h 40 min out.
- Labels pile up at Austin.
