<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u36-towns-down-to-1000`

## Ship rule (written before the work)

The operator's choice, 2026-10-08: "Down to 1,000 people". Days that end
far from any town of 5,000 still say "4 h down the road", about a quarter
of 6 h days. With GeoNames' 1,000+ list, more of them get "near X".

Ships when:

- **The list.** `places-us.json` is rebuilt from `cities1000`, the same
  rules otherwise: US, population ≥ 1,000, no PPLX, PPLQ or PPLH.
  `build-places.mjs` takes the minimum population as an argument, and it
  defaults to 1,000.
- **Measured.** The share of day ends named is measured before and after,
  on the same 9,064 day ends as U19.
- **Live.** A trip that said hours at 6 h (Reno → Salt Lake City) now
  names its day's end, or the run says why not.
- **Size.** The server bundle stays fine (~17k rows ≈ 650 KB), and the
  client bundle still has none of it.
- **Attribution.** Unchanged.

Also required:

- the critic's approval of a live screenshot
- tests updated where they pin the list's size or threshold

**Cost:** $0.

**Weakest part:** a 1,000-person place may have nowhere to sleep. "near X"
names where the day ends, not a motel.

## Built

- `scripts/build-places.mjs` takes a minimum population (default 1,000).
- `places-us.json` is rebuilt from `cities1000`: 16,257 places, 610 KB, server-only.
- A built client bundle has 0 copies of the list (checked with "Byers"); the server bundle has 1.

## Measured

On the same 9,414 day ends (atlas metros, 5–20 h trips, at 4, 6 and 8 h):

| list | day ends named |
|---|---|
| 5,000+ | 72 % |
| 1,000+ | **89 %** |

## Live

| trip | day end |
|---|---|
| Kansas City → Denver, 4 h | day 2 "near Byers" (was Night 2, on the road) |
| Kansas City → Denver, 6 h | "near Goodland" (was "40 min past Colby") |
| Reno → Salt Lake City, 6 h | "25 min past Wendover" (was hours) |

## Gates

tsc, eslint, vitest (800) and next build are clean. No test pinned the list's size.

## Found, not fixed here (U37)

U32's 8 px band paints above *every* town header, pinned or not. Where a header sits right under other text it clips that text, here "Towns that fit today" above Lawrence. Its own unit follows.

## Critic: APPROVE (round 1)

Rule 5 is better met, and the shape line reads "nights near Hays and near Byers". It noted that Byers crowds Denver, which is the short-last-day item and is being fixed next (U35, fold).
