<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u5-mood-chips`

## Ship rule (written before the work; U5, round 1)

Ships when the mood chips on the plan sheet, the today screen (its form and
its results) and the home's fold are one React component,
src/components/MoodChips.tsx, that owns the look and the words: the label
"I'm in the mood for" above the row, a chip per mood with its icon and its
one short word (Culture, Food, Nerd, Gear, Outdoors, the project's, not
renamed), the active one filled with its mood's colour and its word in the
heavier weight, every chip 48 px tall (rule 7's 44 with the margin U2
settled on, so a measurement of the painted box cannot land under 44), and
a root that carries `data-mood-chips`, the attribute the runner finds on
every screen. The screens keep only the wiring, what a tap does: the
sheet's state and URL, the two forms' state, the results' router.replace.
"One row" in the spec is read under rules 2 and 7: at 16 px with 44 px
targets the five chips measure wider than the 358 px a 390 px phone leaves
inside its 16 px gutters (the sums are in "The measurement" below), so the
row wraps, three chips then two, every chip whole, none cut, no sideways
scroll, on every screen; the type is not shrunk, no word is shortened past
plain ("Outdoors" stays "Outdoors"), and no chip is ever alone on a row.
PersonaSelector.tsx and TodayPersonaBar.tsx are gone; TodayMoodChips.tsx
is the results screen's wiring (the URL) and nothing else. Tests: an SSR
test of the component with four moods (four chips, the label, the active
one marked, none marked for null) and with the five; a test that every
screen's chips are the component's markup byte for byte, one
`data-mood-chips` per screen and the standalone render found inside the
screen's; the home fold, plan page, today page, glossary and stylesheet
tests green on the new markup; one test proven by mutation, below. No new
string on a screen; no glossary never-word. Nothing the app pays for
changes: no fetch, no store, no model.

**Cost:** $0. No API call, no model, no store write; the change is markup
and tests.

**Weakest part:** The two-row wrap is arithmetic on the font's advance
widths and the classes, not a browser measurement; the runner's screenshot
at 390 by 844 is the measurement. The label-to-chips gap is the home's 4 px
on every screen now (the plan sheet and the today screen had 8), because
the home's fold with a range set has about 4 px of room inside 844 by U4's
sums and the one component cannot have two gaps. The active chip's word is
semibold and the measurement below is of the regular weight, so the row is
a little wider than the sums; that widens the case for two rows, it does
not weaken it.

## The measurement

Read from the advance widths in Geist Regular (the TTF Next ships at
node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf, 1000 units
per em, no kerning applied) at 16 px, by a small reader in the runner's
scratchpad, not by a browser. A chip is 1 px of border, 12 px of padding,
the icon, a 6 px gap, the word, 12 px of padding and 1 px of border (the
component's `px-3 gap-1.5 border`). The words: Culture 55.2, Food 37.3,
Nerd 36.4, Gear 35.1, Outdoors 69.5 px, 233.6 px in all (8.65 px a
letter). The icons: ● 13.5 and ▲ 13.9 px in Geist; ◆ ◇ ■ are not in Geist
and fall to a system face, taken as one em, 16 px. The chips: Culture
100.7, Food 85.3, Nerd 84.4, Gear 83.1, Outdoors 115.5 px, 469.0 px in all;
with the four 8 px gaps the row is 501 px. The row a 390 px phone gives
is 358 px inside the 16 px gutters (the today screen's `p-4`, the home's
form), 366 px on the plan sheet (`p-2` and `px-1`). So the five chips do
not fit one row by 143 px; not even the words alone with their padding
and borders and gaps (233.6 + 130 + 32 = 395.6 px) fit with no icon at all.
Two rows it is, under rules 2 (16 px type) and 7 (44 px targets, no
sideways scroll): three chips then two by the 30 % basis U4 settled
(three chips are 90 % of the row and four are 120 %, so the break is
after the third at any row width, and the fifth is never alone).

## Routed, not dropped

- The spec's acceptance, screenshots of the plan and today screens with the
  row complete, no chip cut and 44 px targets: the runner's, at 390 by 844,
  never the builder's. What this branch proves is the markup and the sums.
- The home's fold at 844 px with a range set, about 4 px of room by U4's
  sums: unchanged here (the label-to-chips gap is the home's 4 px), and
  still the runner's screenshot.

## Gate 1 proofs

Mutation 1 (the root's attribute): in `src/components/MoodChips.tsx` the
root's `data-mood-chips` was renamed `data-persona-chips`; `bunx vitest run`
over the four chip tests then failed four tests by name: "carries
data-mood-chips on its root, for the runner to find on every screen"
(MoodChips.ssr.test.tsx; expected '<div data-persona-chips="true" …' to
match /^<div data-mood-chips="true"/), "mounts the one mood component on
every screen: its render found byte for byte inside the home's fold, the
plan sheet and the today form, once each" (glossary.ssr.test.tsx), "opens
More when the URL carries dateMode, startDate or endDate, however they
parse" (home.fold.ssr.test.tsx) and "mounts the one mood component on the
results with the URL's mood checked: its render found byte for byte, once"
(today/page.ssr.test.tsx); the file was restored from a copy, `cmp`
identical, all passing.

Mutation 2 (the label): in the same file the `<p>` with the label was
deleted; three tests failed by name: "says the label, I'm in the mood for,
once above the chips and names the group with it" (MoodChips.ssr.test.tsx),
"fits the mood chips: five short words with their glyphs, wrapping and
never scrolling sideways, 48 px tall like the hour buttons"
(glossary.ssr.test.tsx; "fold: expected ' From Here To Each day …' to
contain 'I'm in the mood for'") and "mounts the one mood component on every
screen …" ("sheet: expected [] to have a length of 1"); restored from the
copy, `cmp` identical.

Mutation 3 (one screen differing): in `src/components/TodayStart.tsx` the
today form mounted the chips with `moods={PERSONA_ORDER.slice(0, 4)}`, so
its markup differed from the other screens'; three tests failed by name,
each naming the screen: "fits the mood chips …" ("today: expected [ …(4) ]
to have a length of 5 but got 4"), "mounts the one mood component on every
screen …" ("today: expected '<form class=…' to contain '<div
data-mood-chips="true" …'") and the today page's "mounts the one mood
component on the results …"; restored from a copy, `cmp` identical.

The whole suite: 55 files, 548 tests green; `bun run type-check` 0 errors;
`bun run lint` 0 errors (9 warnings, all older than this branch and none in
its files). Not measured here: the 390 by 844 screenshot, which is the
runner's.

## Council round 1 on #90

1. The fold and stylesheet tests named by path in the class comment of
   `src/components/MoodChips.tsx`.
2. `px-3` and `gap-1.5` explained at the class line as terms of the 501 px
   sum; the wrap does not depend on them.
3. `src/lib/personas` imports only `zod/v4` and a type-only import from
   `@/lib/urban-explorer/types` (erased at compile); nothing server-only,
   no `node:` module, no sqlite, no `process.env` (grep over the directory).
   `MoodChips.tsx` pulls no server code into the client bundle through it.
