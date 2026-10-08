<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u28-past-the-last-town`

## Ship rule (written late, after the first build; recorded as a miss, as U20's and U11's were)

U26's and U27's critics: "Three days, with a night in Winnemucca and one
on the road" doesn't say where the second night is. A cut with no town
within 30 km (even after U19's town list) is said in hours: "Day 2 · 4 h
down the road from Winnemucca".

Ships when such a cut is named by the last town passed, in the time it
takes to get there at the day's own pace, rounded to 5 minutes:

- "Day 2 · Lubbock to 45 min past Brady · 4 h"
- "Three days, with nights in Winnemucca and 50 min past Elko"

Bounds:

- Only when that town is at most 100 km and 60 minutes back. Past an hour,
  "1 h 30 min past Brady" names a town left long ago, so it stays in
  hours, as now.
- A town near the cut (U17/U19) still wins.
- A town ahead of the cut never names it.

Also required:

- pure tests
- the days tests updated: the canonical "hours" fixture now reads "45 min
  past Brady", and the other one still reads hours, at 1 h 30 min back
- mutation proofs
- a live run
- the critic's approval

**Cost:** $0.

**Weakest part:** the minutes are the day's average pace applied to
straight-line km along the road. A slow stretch past the town reads short.

## Mutation proofs, before push

All 6 are caught:

- no minutes cap
- no km cap
- points ahead allowed
- 0 min allowed
- "past" never used
- the night reads "in 50 min past"

## Gates

tsc and vitest (all) are clean.

## Live (dev, 4 trips × 4 h/6 h)

| trip at 6 h | day end |
|---|---|
| Kansas City → Denver | "40 min past Colby" |
| Chicago → Nashville | "45 min past Elizabethtown" |
| Amarillo → Austin | "35 min past Brownwood" |
| Reno → SLC | still hours: nothing passed within the hour |

All the 4 h cases were already "near X" and are unchanged.

## Critic, round 1: REJECT

- **The wrap (real).** "… Elizabethtown · 6" ended a line with "h" alone below it. Fixed in `Figures`: a figure with its unit ("6 h", "45 min", "494 mi"), and the "·" before it, are now one no-wrap span. Six SSR tests that pinned figure HTML were updated with a regex transform. Mutations caught: no grouping, and separator not kept.
- **Unmatched screenshots (real).** My before and after came from different scroll scripts. Round 2 uses the same script for both, plus top-of-sheet shots showing the shape line.
- **Named town not on the map.** True, and U19's "near Sweetwater" has the same gap. Logged in the backlog: draw the day's end on the map. Not built here.

## Gates (after the fixes)

tsc, eslint, vitest (790) and next build are clean.

## Critic, round 2: APPROVE

Rule 5 is clearly better, and "· 6 h" now wraps whole. Leftovers:

- A wrapped line starts with "·".
- The named town is not on the map: backlog.
