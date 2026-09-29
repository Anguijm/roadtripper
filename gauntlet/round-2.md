# Round 2 of the interface build: the moods reach the screens

Written 2026-09-30 (Japan time), before the builder ran. Round 1 closed with #91.
Round 2 has one component so far, U6, and it is the first that changes what the
screens *rank* rather than how they look.

## Ship rule for U6, declared before the build

U6 ships when the critic approves the phone screenshots (390 px) of the plan sheet
with no mood chosen, with one, and with two, and of the sort control in both its
states, against rules 1, 2, 3, 4 and 7 of the bar; and when the SSR tests in the
spec pass: the chips with none, one and two chosen, a third tap dropping the oldest,
the roadside list reordering under a chosen mood, and the sort control switching the
order. Gate 1 before every push; the council on the code.

Residual, routed by name: the five personas stay in `src/lib/personas` because the
towns' places are scored from waypoint types, not tags. U6 makes the moods the one
control on the screen and maps them onto those types; it does not delete the persona
module. Whether that module goes is a later component, not this one.

## What the operator ruled, 2026-09-30

Asked whether the mood chips should also order the towns' places, given that the
towns' places have no tag scores and are ranked from nine coarse waypoint types:
**one control, mapped where it fits.** Six moods map cleanly; History, Art and
Museums collapse onto `culture` and `landmark` and will order the towns' places
alike; Machines and Sports map to nothing and fall back to the neutral order.

The fallback is not a hole. `typeWeight` returns a non-zero floor of 0.2 for the
"other" tier, written so non-matching places still appear, so an unmapped mood
leaves the towns' places ordered by trending score within detour — which is the
order they had before any persona was chosen.

## Cost of the round

$0 in API calls. The screenshots hit the plan page on a local dev server, which
calls the routes API once per distinct route and caches it.

## Who judges

Unchanged from round 1: the critic never reads the builder's notes; it gets the
spec, the bar and the screenshots, and names the largest failure by rule number or
approves. At most six rounds, then the state goes to the operator with the
screenshots.
