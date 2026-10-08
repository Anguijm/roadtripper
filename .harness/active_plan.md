<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u40-away-from-where`

## Ship rule (written before the work)

Several critics (U29, U31, U39) said "Lawrence · 39 min away" doesn't
say from where. Since U39 it can also be misread as "39 min off the
road".

Ships when:

- **The row says where from.** A town's row reads "Lawrence · 39 min from
  Kansas City": from the place the day that holds the towns starts, which
  is the trip's start or the last night's stop.
- **Unchanged.** An added town's row still shows no drive, and other
  lists without a starting place keep "away".

Also required:

- the SSR tests that pin "· 2 h away" updated
- a test for the "from" form after a stop
- mutation proofs
- a screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** a long start name ("Kansas City, Missouri") wraps the
row to two lines.

## Built

- `RecommendationList.tsx`: a `drivesFrom` prop. The row says "· 39 min from Kansas City", or "away" when it is null.
- `PlanWorkspace.tsx`: passes the holding day's `fromName`, which is the start or the last stop.

## Tests

- "Fort Worth · 2 h from Lubbock", after a stop.
- "Plainview · 2 h from Amarillo · out of the way".
- The glossary's figure-face pin now ends "… min from Amarillo".

## Mutation proofs

Both are caught: not passed, and counted from the end instead.

## Gates

eslint, vitest (808) and next build are clean.

## Critic: APPROVE (round 1)

Rule 1 is met. Two small points go to the next unit: the double gap before "·", and the town name not standing out as the card's title.
