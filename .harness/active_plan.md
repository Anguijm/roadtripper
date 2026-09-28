<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/roadside-zoom-rule`

## Goal

The density gap named on #73 and #75: at a state-wide zoom the amber
diamonds pile up on every city (278 on Denver to Santa Fe, most of them
inside Denver and Colorado Springs). A zoom rule: at a state-wide view
only the strongest stops show; zoomed to a region, the middle; zoomed
to a town, every survivor. Toggled, not rebuilt, on each zoom change.

## Ship rule, written before the work

1. One pure function, `roadsideMinProbabilityAt(zoom)`, decides the
   minimum probability a diamond needs at a zoom: 0.7 below zoom 8 (a
   state), 0.55 below zoom 10 (a region), the store's own line (0.45) from
   zoom 10 up (a town, where Google's map shows individual streets and a
   person is choosing a stop rather than a region). The line is never
   undercut, so nothing hides at town zoom that the sidebar lists.
2. The map applies it once when the markers are made and again on every
   `zoom_changed`, by setting each marker's visibility; markers are made
   once per route, and zooming costs a flag per marker.
3. The sidebar list is unchanged: it is collapsed and lists every
   survivor in road order whatever the zoom.
4. Tested: the function at the two steps and both ends, and that a line
   above a step wins. The map effect is client-only, as before.

**Cost:** $0.

**Weakest part:** Three numbers chosen by eye from one route's density,
not from a measurement of what a person can read on a phone; the first
real trip will say whether 0.7 at state zoom is too few. Clustering
would scale better than thresholds when a corridor has a thousand
survivors; this is the cheap rule that makes today's map readable.

## Gate 1 proofs

- Rule 1: with the state step changed from 0.7 to 0.6, "shows only the strongest stops at a state-wide zoom and every survivor at a town" fails. Restored, `cmp` clean.
- Lint, types and the suite green.

## Council round 1 on #77 (CONDITIONAL, maintainability 5), and what changed

- the steps say where their numbers came from (two routes, by eye), that the first trip is the measurement, and which test moves with them
- `line` says it is the store's MAP_THRESHOLD, that a lower value changes nothing and a higher one hides what the sidebar lists, and that it is a parameter only for the test
