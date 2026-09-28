# U2: Plain words and readable type, on every screen

## Deliverables
1. Every visible string on the home, plan, today and trips screens is checked against
   the glossary in `gauntlet/quality-bar.md` and rewritten in sentence case. The sheet
   header on the plan page becomes a sentence: "Lubbock and Abilene fit today" or
   "Nothing fits today; drive on to Austin", never counts and minutes as labels.
2. Body text is a normal typeface (the system sans, or one Google font chosen and
   named in the PR) at 16 px or more on a phone; the monospace face remains only for
   numbers, distances and times. Headings are not letter-spaced capitals.
3. No name is cut with an ellipsis: place names and persona chips wrap to two lines or
   the row changes shape. The persona chips fit the width without scrolling, with a
   short word each ("Culture", "Food", "Nerd", "Gear") and their icons.
4. Disabled buttons say why beside them ("Choose where you are first" as a line, the
   button reads "Show me what's in range").

## Acceptance
- A screenshot of each of the four screens at 390 px, with no glossary "never" word,
  no ellipsis in a name or a chip, no capitalised label, body text measured at 16 px or
  more (the runner reads the computed style).
- A test that walks the rendered HTML of the plan and today screens for the glossary's
  "never" words and fails on any.
- Gate 1; cost $0.

## Constraints
- Words only, and type. No change to layout beyond what wrapping needs; the days view
  is U3.
