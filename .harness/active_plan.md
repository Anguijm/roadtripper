<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/miles-us-km-abroad

## Ship rule (written before the work)

`gauntlet/specs/U54-miles-us-km-abroad.md`. John chose (2026-11-15) "Miles
in the US, km abroad" after the U53 critic's note. Every distance the web
app shows reads miles from a US start and km from anywhere else; no figure
on a US trip moves; the car API keeps km.

## Done

- `src/lib/plan/units.ts` (`unitFor`, `inUnit`, `distanceWords`,
  `KM_PER_MILE` = 1.60934, the divisor the app always used).
- `unitAt(point)` in src/lib/today/plan.ts: the nearest atlas town within
  650 km decides.
- /today: the distance line and the far notice ("about 400 miles").
- /plan: `distanceUnit` prop on PlanWorkspace (from `unitAt(origin)` in the
  page); `formatDistance`, `roadsideAlongText` and `RoadsideCard` take it.
- Figures keeps "800 km" on one line like "497 mi".

## Mutation proofs

Ten, each red, restored and `cmp` clean: always miles; unknown read as km;
/today always km; formatDistance ignoring the unit; the sheet's total, the
card and the Along the way list each without the unit; unitAt snapping only
40 km; Figures without km (survived at first; a Figures test was added and
it went red); "1 miles".

## Critic

Round 1 (fresh, blind; /today US and Canada, /plan Toronto to Montreal):
not approved, and not for the units, which it read as consistent on all
four screens. Its largest failure, rule 5, was older than this change: the
sheet's title said "Nothing fits today; drive on to Montreal" over "Two
days, with a night near Massena". Fixed here: with nothing to name, the
title says where that day ends ("Nothing fits today; the day ends near
Massena", "... ends on the road"), and "drive on to" only when the day
reaches the end (`fitsTodayLine` takes the day; four mutation proofs red).
An older test had pinned the contradiction ("drive on to Austin" over "Two
days, with a night on the road") and now pins the fix.
Its minor notes: "past Toronto" on every place 292 to 401 km out (rule 4,
older than this change; on the backlog as a later component); the mono
"h"/"min" (every drive time since U2).
Round 2 (a new critic, the reshot sheet): not approved, rule 5 again and
again older than this change: "Nothing fits today" stood over "Along the
way: 15 places" listed under Day 1. "Nothing" meant no town. Fixed: "No
town fits today; the day ends near Massena", and "No town fits today;
drive on to Austin" (two mutation proofs red). Minor notes: the mono
"h"/"min" (since U2); the night "near Massena", a New York town across the
river on a Toronto to Montreal trip, because the day-end names come from
the US places list only (on the backlog); "past Toronto" (already there).
Round 3 (a new critic): approved. Minor notes: "h"/"min" in the mono
face on /today (the third critic to say so; real, since /plan sets only
the digits in mono through Figures and /today wraps the whole time in one
`num` span; on the backlog as U55); "past Toronto" (on the backlog); "No
town fits today" over 15 places, which it says nothing on the screen
contradicts.

Cost: one Routes API call for the /plan screenshot (Toronto to Montreal,
on the dev server). Nothing else paid.

Weakest part: the /plan page's own line, `distanceUnit={unitAt(origin)}`,
has no test (the page calls the Routes API); `unitAt` is tested, and the
Toronto shot and a production check cover the wiring.
