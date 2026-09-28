# U1: Roadside stops first-class, and the machinery off the map

## Deliverables
1. Tapping a roadside diamond on the plan map opens a card in the sheet: the place's
   name, the line about it (encyclopedia or the map's own), the kind in plain words,
   how far along the road ("212 km in, past Lubbock" style, or "2 h 40 min in" when the
   drive time is known), and one button, "Open in Maps". The card closes on a second
   tap or a swipe.
2. The list of places worth pulling over for is open by default in the sheet, headed
   "N places worth pulling over for", showing the ten strongest first with a "show
   all" control; each row opens the same card.
3. The search arc is gone from the map. The compass and map controls never overlap the
   sheet: they sit in the map's own area or are hidden while the sheet is up.
4. The zoom rule stays; the card works at every zoom.

## Acceptance
- A screenshot at 390 px with a diamond tapped shows the card with all five parts and
  nothing truncated.
- A screenshot of the sheet at rest shows the roadside list open, ten rows, a "show
  all" control, no word from the glossary's "never" column anywhere on the screen.
- No arc on the map in any screenshot; the compass does not overlap the sheet.
- SSR tests: the list renders open with ten rows and the control; the card markup
  renders from state with the five parts; the test that renders a stop with HTML in
  its name still passes.
- Gate 1 as always; cost $0 (no new fetch).

## Constraints
- No change to what is fetched or scored; the card uses what the store already gives.
- "Add as a stop" is not in this component: the trip's stops are cities in the drive
  graph, and a roadside stop is not; that is routed to a later component by name (U6).
