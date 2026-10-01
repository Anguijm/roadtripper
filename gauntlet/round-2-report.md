# Round 2 of the interface build: the report

Written 2026-10-01, after U7 merged. Round 2 carried the tag work from a store
column to a screen you can tap. Four pull requests, all merged: #92, #93, #94, #96.

## What shipped

| | | |
|---|---|---|
| T1 | the eighteen tags, the eight moods, and how two chosen moods rank a place | #92 |
| T2 | the stops the plan page reads carry their tag scores | #93 |
| U6 | the eight moods on the screens, two at a time, and the order of the day's places | #94 |
| U7 | "Stop here", from the roadside card | #96 |

Before this round a single score asked "would you pull over for this", and a
great barbecue joint answered it badly while a canyon answered it well. The
French Laundry scored 0.05, Franklin Barbecue 0.59, the Rose Bowl 0.06. Food
and sport were in the store the whole time and invisible.

Measured, not estimated: every stop that can appear on the map is tagged —
27,976 of 27,976 at `MAP_THRESHOLD` 0.45, none missing — and the join costs
4.3 ms for 500 markers. The tagging run itself cost $2.94 against a $7.50
estimate; the estimator was wrong because it adds a fixed overhead per
question and was calibrated on three, not eighteen.

## What the two gates each caught, and what neither did

The critic caught every screen problem and no code problem. The council caught
every code problem and no screen problem. Neither caught the other's, which is
the argument for both.

**The critic's finds:** the sort control sitting in the chip grid in the chips'
own shape, so it read as a ninth and tenth mood; the eight geometric glyphs at
unequal sizes, two of them unreadable, with Museums' hollow diamond and
Machines' solid one differing only by fill — which is this app's signal for
"chosen"; and U7's inverted hierarchy, where the card's own action wore the
quiet outline and the control that leaves the app was the only gold thing on it.

**The council's finds:** a `history.replaceState` inside a state updater; a
trip schema capping at a literal 2 instead of `MAX_MOODS`; a route line that
never changed colour while a comment said it did; a degraded read that looked
like an empty road; a repeated query parameter read as nothing; a legacy
`?persona=` link silently discarding a saved choice; and the towns' refresh
broken by U7's own fix.

**What neither caught, and the screenshots did.** Adding a roadside place left
the drive times stale. `recomputeAndRefreshAction` validates `selectedCityId`
against a slug pattern and a roadside id is an OSM one with colons, so the
server threw the whole recompute away as `invalid_input`. Three timings were
the diagnosis: 3 ms bailing before the Routes API, 293 ms for a town, 457 ms
once fixed. Every SSR test was green through it, because the failure lives in a
server action the suite never calls.

## Three tests that certified the wrong thing

Worth recording together, because they are the same mistake:

1. **The chunking test (#93)** asked for 2,501 ids and checked the rows came
   back. It passed with the chunking removed, because SQLite's parameter
   ceiling is 32,766 on this machine. It proved the loop reassembles and
   nothing about why the loop exists. It now watches the SQL through a proxy
   on `prepare`.
2. **The `parseMoods` bail (#94)** asserted `parseMoods(["food"])` was `[]`,
   locking in a bug while appearing to close a gap: a repeated query parameter
   arrives as `string[]`, and the page declared `moods?: string`, a type that
   was simply false.
3. **The route line's colour (#94)** had no test at all, and a comment at the
   use site described behaviour that was never written.

In each case the mutation proof was what settled it, and in each case it was
run only after something else raised the question.

## Open, and named

- **#95 — no DOM or interaction tests.** Three client fixes from this round are
  unguarded: reverting any of them leaves the whole suite green. The chips also
  became a multi-select, which changes what a screen reader is told, and nobody
  has heard it read aloud. Closing this means adding jsdom, which is the
  operator's decision and not a feature branch's.
- **#97 — a place in the trip is not marked in the day's list.** Its card says
  "✓ Added" while the list shows it like any other. One screen, two answers.
- The glyphs are gone rather than redrawn. `MoodConfig` has no `glyph` field and
  a test asserts its absence, so bringing icons back is a deliberate act: one
  set, one size, each shape meaning its mood, no two telling apart only by fill.
- **Left for the operator from round 1, still open:** a map-first today screen.

## Numbering

`round-1-report.md` routed U1's "Add as a stop" residual forward under the name
"U6". That name went to the moods and the sort control before the residual was
built, so the residual is U7. Nothing about it changed.

## Cost of the round

$0 in API calls for the interface work. The screenshots hit a local dev server,
whose routes call is cached; the three screenshots that add a stop each trigger
one recompute, which is the app's own behaviour and not a new call. The at-cap
screenshot was not taken, because reaching it live means seven added stops and
seven paid recomputes; both critics were told, and neither counted it against
the component.
