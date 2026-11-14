# U54: miles in the US, km abroad

The U53 critic read "109 km from Dayton" twice as not how a US driver talks.
Asked, John chose (2026-11-15) "Miles in the US, km abroad" from a menu.
The app was mixed before: /plan said miles ("494 mi", "6 miles along, in
Amarillo") and /today said km ("109 km from Dayton", "650 km").

## Deliverables

1. One rule, `src/lib/plan/units.ts`: miles when the trip starts in the
   United States, km anywhere else; the start's country is the nearest atlas
   town's within 650 km (`unitAt`), as for the border label; no town near,
   miles.
2. /today: "From your location, 68 miles from Dayton"; from north of
   Toronto, "61 km from Toronto". The far notice: "within about 400 miles".
3. /plan from a start abroad: the route's length in km ("545 km"), and the
   roadside card and the day's Along the way list in km ("212 km along,
   past ..."). From a US start, unchanged.
4. The car API keeps its km fields (`distanceKm`); the car formats its own.
5. Added in round 1 (the critic's largest failure, rule 5): with no town
   to name, the sheet's title says where that day ends ("the day ends near
   Massena"), "drive on to" only when the day reaches the end.

## Acceptance

- 390 px shots: /today from a US highway point and from north of Toronto;
  /plan Toronto to Montreal, the sheet and its Along the way. A fresh blind
  critic against `gauntlet/quality-bar.md`.
- Tests and a mutation proof on each piece; Gate 1.

## Constraints

- No figure on a US trip moves: the mile divisor stays 1.60934.
- A figure and its unit stay on one line, km included (U28).
