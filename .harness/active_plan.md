<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/lore-before-commit`

## Goal

Step 13: surface the neighbourhood write-up before you commit. Today the
panel that shows a city's neighbourhoods opens only for a city already in
the trip; to read about Lubbock you have to add Lubbock. Done when a
candidate city shows its lore without being added first.

## Ship rule, written before the work

1. Every candidate city on the plan page's list has a button, "See what's
   here", that opens its neighbourhood panel without adding it. A real
   button, labelled with the city name, keyboard reachable, and marked
   pressed while that city is the one shown.
2. The panel's city resolves from the trip when the city is a stop and from
   the candidates otherwise: one pure function, `panelCityFor`, tested with
   a stop, a candidate, an unknown id and null.
3. Adding a previewed city keeps the panel on it; removing a stop that is
   also a candidate keeps the panel on it too. Nothing flickers to "nothing
   selected" when the city is still on screen.
4. Nothing new calls out. The neighbourhood action already exists and is
   rate limited; a preview costs one call for that city, cached in the
   workspace like a click on a stop.
5. Server-render tests: the candidate list shows the button per city with
   its label; the workspace still renders.

**Cost:** $0.

**Weakest part:** The click itself is not exercised here; there is still no
DOM test runner, so the button's presence and label are tested at the
server render and the state change behind it through the pure resolver.
The map's tap on a candidate marker still adds the city rather than
previewing it, unchanged, because changing what a tap means on a phone is a
product decision and this step is about the list.

## Gate 1 proofs

- Rule 2: with the candidate lookup removed from `panelCityFor` (the panel follows the trip only, as before), "resolves a candidate that is not in the trip" and "keeps the panel on a city that leaves the trip" fail. Restored.
- Rule 1: with the preview button never rendered, "offers to show a city's lore before it is added, and marks the open one as pressed" fails. Restored.
- Rule 5: the candidate-list render shows the button per city with `aria-label="See what is in Amarillo"` and `aria-pressed` true only for the open city; the workspace server-render test still passes.
- 376 tests, 6 new; lint and types clean.
