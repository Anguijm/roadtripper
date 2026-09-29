<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u6-moods-and-sort`

## Ship rule (written before the work)

Declared in `gauntlet/round-2.md` before the builder ran, and repeated here
because Gate 1 reads this file: U6 ships when the critic approves the
390 px screenshots of the plan sheet with no mood chosen, with one and with
two, and the sort control in both states, against bar rules 1, 2, 3, 4 and
7; and when the SSR tests pass — the chips with none, one and two chosen, a
third tap dropping the oldest, the roadside list reordering under a mood,
and the sort control switching the order.

**Cost:** $0. No model call, no store write, no new route. The screenshots
hit a local dev server, whose routes call is cached after the first.

**Weakest part:** The chips stop being a radiogroup and become a
multi-select, which is a change of meaning for a screen reader, not just of
markup. `aria-checked` on `role="radio"` said "one of these"; the new
markup has to say "any two of these" without a live region nagging on every
tap. I can test the attributes but not how it actually reads aloud, and the
critic judges a screenshot, which is silent. That gap stays open and is
named here rather than papered over.

## The operator's ruling that shaped this, 2026-09-30

The chips currently drive two different rankings, which I did not know when
I proposed swapping them in place: the roadside stops (tag scores, real
data) and the towns' places (nine coarse waypoint types, no tags). Asked
which the moods should own, he chose **one control, mapped where it fits**.

So `MOOD_WAYPOINTS` maps each mood onto waypoint types. Six map cleanly.
History, Art and Museums all collapse onto `culture` and `landmark` and
will order the towns' places identically — that is a real loss and it is
accepted, not hidden. Machines and Sports map to nothing.

Machines and Sports are not a hole: `typeWeight` returns 0.2 for the
"other" tier, a floor written so non-matching places still appear, so an
unmapped mood leaves the towns' places in trending-within-detour order —
the order they were in before any persona was chosen. The roadside stops,
which are what those two moods are actually about, rank on real tag scores
either way.

## What changed, and the one place I did not follow my own spec

The chips now offer the eight moods, two at a time, and the day's places
are ordered by them. The blast radius was larger than the spec implies and
the compiler mapped all of it: `MoodChips`, `SortControl` (new),
`PlanWorkspace`, `RecommendationList`, `NeighborhoodPanel`, `TodayStart`,
`TodayMoodChips`, `RouteInput`, the plan/today/health pages, the trip
schema and eight test files.

`RecommendationList` and `NeighborhoodPanel` used to take a persona *id*
and look the config up. They now take the profile itself, because two
moods do not have one id between them; `buildRankedGroupsWith` is the same
function as `buildRankedGroups` given a profile instead of an id, and the
id-taking form stays for the health page.

**The deviation:** the spec says "a sort control beside the day's places".
It is mounted once for the sheet, under the chips, not once per day. A
trip of three days would have shown three copies of one control all
driving one state, which is the clutter rule 3 exists to stop. The critic
judges the screenshot either way; this is recorded so the difference is
not mistaken for an oversight.

## Saved trips

`personaId` on a saved trip is now optional and `moods` was added beside
it. Trips saved before U6 still parse and still reopen — `TripCard` passes
their old `persona` parameter through, and the plan page simply no longer
reads it, so an unknown parameter cannot fail. A test covers exactly that
link.

## Gate 1 proofs

1. The day's ordering replaced by the pre-U6 `b.p - a.p`. Three tests in
   `PlanWorkspace.moods.ssr.test.tsx` fail by name, among them "puts the
   diner over the stadium when the mood is food". The two that check the
   sheet *at rest* still pass, which is the point: nothing about the
   no-mood screen changed.
2. `orderRoadside`'s "along" branch made unreachable. "along the road is
   the order they come up, whatever the mood" and "switching the order
   actually changes the list" fail.
3. The name tie-break removed from the "best" branch. "orders two places
   that tie, rather than leaving them as they came" fails — the Rose Bowl
   lesson one layer up.

All restored from copies taken first; `cmp` reports each identical.

`orderRoadside` was pulled out of `PlanWorkspace` into
`src/lib/roadside/order.ts` for proof 2. The sort mode is client state, so
a server render only ever shows "best" and no SSR test could ever see the
other order switched on. The comparator had to be a pure function to be
testable at all.

Gates: `npx vitest run` 609 green; `tsc --noEmit` clean; `eslint` 0 errors.

## Screenshots

Four at 390 px with device emulation, taken by the runner off a local dev
server (one routes call, cached for the rest, so the round cost $0): the
sheet with no mood, with one, with two, and with the order switched to
"Along the road". The critic judged them blind against the bar and the
spec, having read neither this file nor any source.

## U6 round 1: the critic failed it on rule 3, and was right

**The critique:** the sort control sat in the chip grid directly under the
chips, the same full-width chip shape and height, with no lead-in, so it
read as a ninth and tenth mood; the list it orders was three blocks
further down, so at a glance it applied to nothing; and it used a second
meaning for "chosen" — a picked mood is an orange fill, the picked sort
was a pale grey fill in the very next row, which on the screen with no
mood chosen made "Best match" read as a chip greyed *out* rather than the
state that is on.

It also independently arrived at the placement my own spec asked for and I
had talked myself out of. The deviation recorded above was the error, and
the reasoning that produced it — three copies of one control would be
clutter — was answering a question nobody asked while missing that the
control did not look like a control at all.

**What changed.** One line instead of a grid: `SORT_LEAD` ("Show me") and
two lower-case phrases that finish it, sized to their words rather than
stretched across the row, so nothing repeats the chips' shape. It moved
out of the chips' block to directly above the days. The state that is on
is filled the way a chosen chip is filled, a colour behind dark text, in
the gold the places are headed in, so one visual language means "this is
on" everywhere on the sheet.

**Where I did not do what the critic asked, and why.** It asked for the
control on the same line as the day's places. `ROADSIDE_LIST_PX` is a
day's list from its heading through "Show all", and the rest snap was
sized so that whole block fits the scroll box once scrolled to — 512
against a ceiling of 513, one pixel of slack, pinned by a test whose name
is the promise ("a day's list still fits the box whole once scrolled to").
A 44 px control inside each day's list spends that and then some. Trading
a U1 sizing decision is not this component's to make, so it sits directly
above the days instead, which answers the same complaint: it is out of the
chip grid, it has its own lead-in, and the first day's list begins one
line below it.

**A real bug the existing suite caught, not the critic.** The control
rendered even on a trip with no places at all, and its first label read
"Order the places worth pulling over for" — which both said the screen had
places when it had none, and put that phrase above two tests that find it
by position. It is now hidden when no day has a place, and its label
avoids the heading's words. The test that caught it is "shows nothing and
says nothing when no pulled corridor is near the route", and its name is
the rule.

Gates after the fix: 609 green; `tsc --noEmit` clean; `eslint` 0 errors.

## U6 round 2: the critic failed it on rule 2, the glyphs

**The critique:** the eight chips carried geometric characters (▲ ■ ● ◇ ★
◆ ◗ ◐) that rendered at unequal sizes in the body face — Food's and
Sports' were a fraction of the label and unreadable at arm's length; none
of them depicted its mood; Museums' hollow ◇ and Machines' solid ◆
differed only by fill, which is the signal this app uses everywhere for
"chosen"; and the two half-circles read as carets promising an expand that
is not there.

This is the finding T1's own note predicted. `MOOD_CONFIG` said the glyphs
were "provisional: the blind critic judges these on a 390 px screen in the
interface round, and a glyph that does not render in the body face is that
round's finding, not this module's". It was, and it is.

**What changed.** The glyphs are gone, which was the first of the two
fixes the critic offered. The eight labels are one plain word each and
carry a chip on their own; the chosen state is the fill, the weight and
`aria-pressed`, none of which was ever the glyph's job, so nothing is lost
by its going. The alternative it offered — one drawn icon set at one size,
each shape depicting its mood — is real design work that would take
several more rounds to get right, and the simpler fix removes the whole
class of failure rather than moving it.

`glyph` is removed from `MoodConfig` rather than left unread, and the test
asserts its absence, so bringing icons back is a decision someone has to
make on purpose. The note on the field says what a return would have to
look like: one set, one size, each shape meaning its mood, no two telling
apart only by fill.

Gates after the fix: 609 green; `tsc --noEmit` clean; `eslint` 0 errors.

## U6 round 3: approved

The critic approved the four screenshots: plain, glossary-clean words
throughout; all eight chips whole at about 47 px in three wrapped rows
with no ellipsis and no sideways scroll at 390 px; the chosen chips
unmistakably on against the outlined unchosen ones; and "Show me [best
first] [along the road]" saying in a sentence what the order does, the
live state filled and the other offered as plain underlined text.

Three rounds of the six. Each round's critic was a fresh one that had not
seen the previous draft, as the bar requires.

**Still open, and named rather than closed:** the two moods that are on
are told apart by their words, not by their fills — Oddities and Food are
neighbouring oranges. Nothing on the screen depends on telling those two
fills apart, so it is not a failure, but a future mood palette should not
assume the fills carry meaning between chips.

**And the weakest part written before the work stands unclosed.** The
chips became a multi-select, which changes what a screen reader is told,
and `MOOD_GROUP_LABEL` carries the count because the markup no longer
says it. Tests pin the attributes and the critic judged a screenshot,
which is silent. Nobody in this loop has heard it read aloud.

Next: the operator sees these screenshots before merge, which is the bar's
own gate and not the critic's.
