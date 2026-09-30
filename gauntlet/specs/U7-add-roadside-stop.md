# U7: Stop here, from the roadside card

Numbered U7, not U6. `gauntlet/round-1-report.md` routed this residual
forward under the name "U6", and that name was taken by the moods and the
sort control (#94) before this was built. Renamed here so the report and
the specs agree; nothing about the residual changed.

## The residual, as U1 left it

A diamond on the map answers a tap with a card: the name, the line about
it, how far along the road, and "Open in Maps" (quality bar, rule 4). A
person can see a place worth pulling over for and has no way to put it in
their trip. Every town on the sheet has "+ Stop here"; the card does not.

## Deliverables

1. The roadside card carries one more control, the same words the towns
   use: "+ Stop here".
2. A place already in the trip reads "✓ Added" and the control takes it
   out again, the same as a town's.
3. With the trip at its cap the control is off and a sentence beside it
   says why, never in the control's own label (rule 3).
4. Once added, the place is a stop like any other: it ends a day, the map
   draws it, the route runs through it, and it is saved with the trip.

## Acceptance

- Screenshots at 390 px: the card with the control, the card for a place
  already added, and the card with the trip at its cap.
- SSR tests: the control's three states; that adding a roadside place puts
  it in the trip's stops; that a place added twice is one stop.
- Gate 1; the council on the code; cost $0.

## Constraints

- No change to what the app fetches (hard stop 1). Adding a stop already
  recomputes the route; this adds a second way to reach the same action,
  not a new call.
- A roadside place is not a town. It has no places of its own to list, and
  the sheet must not imply it does.
