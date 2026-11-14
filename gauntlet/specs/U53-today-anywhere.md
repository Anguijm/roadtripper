# U53: /today from anywhere, for any length of day

John, 2026-11-14, asked through the car session: "Is the web app getting
fixed too?", after the car's lists started answering between towns (#181)
and on 10, 12 hours and no limit (#182). His choice the same day, from a
menu: "Both: between towns + long days".

## Deliverables

1. **Between towns.** A point with no atlas town within 40 km gets the
   answer the car gets (`planToday` with `betweenTowns`), not "Not near a
   city we know". The subtitle says where you are against the nearest town
   ("From your location, 109 km from Dayton"). The nearest town is a card
   like any other. "Not near a city we know" stays only past 650 km from
   every town, and says 650 km.
2. **About.** A town whose minutes are a straight-line estimate (between
   towns, and past the drive graph on a long day) reads "about 1 h 19 min
   away"; the graph's towns read as now. The subtitle's "Drive times are one
   way." gains "Times marked about are estimates by straight line." only when
   one is shown.
3. **Longer days.** The start screen's "I have" chips: 2, 3, 4, 5, 6, 8,
   10, 12 h and "No limit", in two rows that fit 390 px (five, then four).
   `hours=any` is No limit, as on the car endpoints. The heading on No limit
   is "The nearest cities, no time limit" (a count of every town in the
   atlas, abroad included, would mean nothing); the footer says "Showing the
   nearest N." The deadline's feasibility line is left out on No limit: it
   counts days of driving by the daily budget, and there is none.
4. The /plan page's daily budget is unchanged: it keeps 2 to 8 h.

## Acceptance

- 390 px screenshots: the start screen at rest (the chips); results between
  towns (near Lima, Ohio); results on No limit (central Nevada); a town in
  range snapped (Amarillo, 5 h) for comparison. A fresh blind critic
  against `gauntlet/quality-bar.md`, before merge.
- Tests: between towns renders the nearest town as a card with "about";
  past 650 km still the notice; hours=any renders the no-limit heading and
  no feasibility line; the chips hold the new choices; /plan's budget
  selector still offers 2 to 8. Mutation proof on each.
- Gate 1. No new fetch; atlas reads only.

## Constraints

- No `router.replace`; the start screen still navigates with the URL.
- Plain words: "No limit", "about", never "estimated" or "snapped".
