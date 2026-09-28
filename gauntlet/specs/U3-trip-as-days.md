# U3: The trip told as days

## Deliverables
1. The plan sheet groups the route by day from the daily budget and the trip's legs
   (`src/lib/plan/trip-state.ts` already computes legs and days): "Day 1 · Amarillo to
   Lubbock · 3 h 20 min", then the towns and the places worth pulling over for that fall
   in that day, then "Day 2 …".
2. Tapping a day fits the map to that day's stretch of road; tapping it again returns
   to the whole trip.
3. In arrival mode the deadline line stays, in a sentence: "Arrive in Austin by
   October 14, six days from now".

## Acceptance
- A screenshot with a two-day trip shows two day headings with the towns and roadside
  places under the right day, and the map fitted to day one after a tap.
- A test that a trip whose legs exceed one day's budget renders two day sections and
  assigns each stop to the right one; a zero-stop trip renders one day.
- Gate 1; cost $0.

## Constraints
- No new routing calls: the days come from the legs the app already has.
