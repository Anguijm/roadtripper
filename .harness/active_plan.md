<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/reason-under-every-stop`

## Goal

Steps 11 and 12 together, because 11 alone is a field in a type with
nothing to look at. Step 11: fetch the descriptions; the atlas holds one
for every waypoint (13,390 of 13,390, median 125 characters, longest 234)
and the query already selects it, then the projection drops it. Done when
the field arrives in the payload. Step 12: render the reason under every
stop. Done when no stop is a bare name.

## Ship rule, written before the work

1. `description` travels the whole chain: SQLite row, `LiteWaypoint`,
   `RankedWaypoint`. Null when the atlas has none. Tested at the payload
   (`buildRankedGroups` output carries it) and at the read (`waypointsForCities`
   returns it for a real city).
2. The text is untrusted model output. It is rendered as text only, never as
   markup, and cut at 240 characters at the read so nothing downstream can
   grow past a sentence or two.
3. On the plan page's candidate list and on the today screen, every stop
   shows its reason under its name. A stop with no description shows the
   name alone rather than an empty line, and the count of such stops on the
   real atlas today is zero, asserted.
4. Server-render tests on both screens find a known description under its
   stop.
5. Nothing calls out; the field is already in every row read.

**Cost:** $0. The bytes were already read and thrown away.

**Weakest part:** The reason is Urban Explorer's one-line description,
which the survey in the plan found is often generic ("a charming spot") and
food-heavy. This step makes the field visible; it does not make it good.
Making it good is steps 19 to 25, the labels and the Jev scores. Seeing the
weak ones on screen is the point: it is how the labelling in step 19 gets
chosen.

## Gate 1 proofs

- Rule 1: with the pipeline mapping the description to null, the today page test fails on "every spot rendered carries its reason" (spots counted against reasons). Restored.
- Rule 2: `clipReason` is unit-tested: trims, blank to null, 500 characters cut to 240 with an ellipsis, exactly 240 kept. The candidate-list render test feeds a description containing `<b>` and asserts it comes out escaped, never as markup.
- Rule 3: the read-layer test walks every city in the atlas (13,390 waypoints in batches of 50) and asserts zero without a description.
- Rule 4: the candidate list (plan page) and the today screen both have server-render tests finding a reason under a stop.
- 370 tests, 4 new; lint and types clean. Fixtures in two files gained the field; the health page's fixed waypoint has a reason too.

## Council round 1 on #57 (CONDITIONAL, bugs 8), and what changed

- `clipReason` treats anything that is not a string as "no reason", the way `safeWaypointType` treats an unknown type; tested with a number and a buffer
- `MAX_REASON_LENGTH` says why 240: longest in the atlas is 234, median 125, nothing real is cut, a pasted paragraph cannot bloat the payload or overflow the two-line clamp
- the ellipsis arithmetic is explained where it happens

## Council round 2 on #57 (CONDITIONAL, bugs 9), and what changed

- the today screen's reason is clamped to three lines (the candidate list uses two; here the reason is the content and 240 characters is about three lines on a phone)
