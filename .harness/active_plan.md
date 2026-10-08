<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u23-quiet-basemap`

## Ship rule (written before the work)

U20's and U22's critics: on Kansas City → Denver the base map's "United
States" label is the heaviest text on the map. It is drawn across the
route and a diamond, louder than the trip. State names crowd the town
names (Salina, Wichita and "KANSAS"). Rule 6: the map shows the trip.

Ships when the base map:

- **Countries:** draws no country names. Every trip is in one country,
  and its name says nothing.
- **States:** draws state names dimmer than the app's town names, so they
  orient without competing. #4d5560 against the town names' #f0f6fc, on
  #1c2128 land.
- **Everything else:** roads and water keep their labels, and town names
  stay off (U1).

Also required:

- the style test pins both rules
- mutation proofs
- a before/after screenshot of Kansas City → Denver
- the critic's approval

**Cost:** $0.

**Weakest part:** a trip that crosses into Canada or Mexico loses the
country name that would say so. State and province names still show,
dimmed.

## Built

`DARK_MAP_STYLES` gets two rules: `administrative.country` labels off, and the `administrative.province` text fill set to #4d5560. Both are pinned in the style test, and both mutations are caught.

## Live check

Measured on the Kansas City → Denver screenshot: the brightest pixel in "NEBRASKA" went from #7d8590 to #4d5560, as set. "United States" is gone.

## Gates

eslint, vitest (777) and next build are clean.

## Critic: APPROVE (round 1)

The trip's names are now the brightest text on the map, and the state names stay readable.

Left out of scope: state names still collide with trip names where both fall on the same spot ("KANSAS" under Salina and Wichita). The basemap can't be told to give way to the app's markers short of turning state names off.
