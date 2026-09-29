<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u4-shorter-home`

## Ship rule (written before the work; round 2)

Ships when, on a 390 by 844 phone with no browser chrome, the home shows
without scrolling: the masthead, the title, one example line, From, To, the
hours row and the one large button "Plan the trip", the button enabled once
from and to are set and, while it is not, the reason in the line beside it
("Choose where you start first"); nothing else between the title and the
button. The From and To boxes are the same height: each input is 44 px tall
(rule 7's target) inside a 1 px border, so both boxes measure 46 px; the
round-1 critic's one failure was the To input at 42 px inside a 44 px box
against the From input at 44 inside 46. Dates and the mood sit under one
disclosure below the button, a 44 px control that reads "More: dates and what
I'm in the mood for" closed and "Less" open, closed by default and open when
the URL carries dateMode, startDate or endDate. Open, the fold's whole content
sits inside the 844 px too: the date button, the line that counts the days
when there is a range to count, the mood label and the five chips, which share
the row's width, three then two, never one alone on a row and none cut at the
bottom. The example line is a sentence with two real names read from the
roadside store at request time by a rule stated in the code, the same two on
every request, and exactly "Cadillac Ranch" and "the Big Texan" when there is
no store; no network, no model. "Use where I am" is a 44 px control inside the
From box at its right end, a glyph with one short word ("Here") so a long city
name has the room, its accessible name still saying "use where I am", its
state said in the line under the field. Every new string is sentence case with
no glossary never-word; numbers in the .num class. Tests: the SSR test renders
the home closed without date params and open with them and checks the dates
control is absent or present; a test reads the 44 px class on both the From
and the To input; an example-line test pins the sentence with a fixture of two
names and the fallback; the existing home, RouteInput, glossary and stylesheet
tests pass with the new markup; one test proven by mutation below. What the
home sends the plan page is unchanged in form: no new parameter name, no
parameter in a new shape.

**Cost:** $0. No API call, no model, no store write. The example line is one
read of the local SQLite store, once per process and path (kept in memory),
and nothing at all when the store is absent.

**Weakest part:** The fold's fit at 844 px is arithmetic on the classes
(header 69, title block 104, From 78, To 74, hours 76, button 56, the reason
16, "Less" 44, the date button 44, the mood label and two rows of 48 px chips
136, the gaps between, about 815 px to the last chip's bottom, 840 with a
range's count of days), not a measurement; the runner's screenshot is the
measurement. The same sums on round 1's layout put the second chip row's top
near 831, which is what the critic saw cut at 844, so they are close. The
range case has the least room, about 4 px by the sums. The date button has no label line above
it now: "Pick the dates", "Arrive by Oct 14" and "Oct 10 to Oct 14" are the
button's own words, and the dialog it opens is still titled "Trip dates". The
chips' three-then-two comes from a 30 % basis on each chip inside a wrapping
row, which holds at any label width up to a third of the row; a screen wider
than about 600 px would fit all five on one row, which is also right. The
example sentence puts "the" before each name, which reads right for the
Cadillac Ranch and the Big Texan and wrong for a name that takes no article.

## Routed, not dropped (the round-1 critic's lower-priority notes)

- The mood row's fit on every screen, five chips in one row at 390 px: U5,
  "Mood chips that fit", deliverable 1. Here the home's chips fill three then
  two through a `fill` prop on PersonaSelector that the plan and today
  screens do not pass, so their rows are as U2 left them.
- r1-plan.png, "1 h 40 min away" running under the "What's in Lubbock" button
  in the plan sheet's town row: not the home's; U3, "The trip told as days",
  which regroups the sheet's rows by day.

## Gate 1 proofs

Mutation 1 (the fold): in `src/app/page.tsx` the fold's initial state was
made open by default (`const initialMoreOpen = true || ...`); `bunx vitest
run src/app/__tests__/home.fold.ssr.test.tsx` then failed one test by name,
"keeps the dates and the mood folded under More when the URL carries no
date" (AssertionError: expected 'true' to be 'false'); the file was restored
from a copy, `cmp` identical, all passing.

Mutation 2 (the To box): in `src/components/CityAutocomplete.tsx` the input's
`min-h-[44px]` was removed; the same file then failed one test by name,
"gives the From and the To input the same 44 px height inside a 1 px border"
(expected the End city input's class to match /\bmin-h-\[44px\]/); restored
from a copy, `cmp` identical, all passing.

The whole suite: 53 files, 513 tests green; `bun run type-check` 0 errors;
`bun run lint` 0 errors (9 warnings, all older than this branch and none in
its files). Not measured here: the 390 by 844 screenshot, which is the
runner's.
