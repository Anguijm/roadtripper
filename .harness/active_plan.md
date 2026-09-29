<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u4-shorter-home`

## Ship rule (written before the work)

Ships when, on a 390 by 844 phone with no browser chrome, the home shows
without scrolling: the masthead, the title, one example line, From, To, the
hours row and the one large button "Plan the trip", the button enabled once
from and to are set and, while it is not, the reason in the line beside it
("Choose where you start first"); nothing else between the title and the
button. Dates and the mood sit under one disclosure below the button, a 44 px
control that reads "More: dates and what I'm in the mood for" closed and "Less"
open, closed by default and open when the URL carries dateMode, startDate or
endDate. The example line is a sentence with two real names read from the
roadside store at request time by a rule stated in the code, the same two on
every request, and exactly "Cadillac Ranch" and "the Big Texan" when there is
no store; no network, no model. "Use where I am" is a 44 px control inside the
From box at its right end, its state said in the line under the field. Every
new string is sentence case with no glossary never-word. Tests: a new SSR test
renders the home closed without date params and open with them and checks the
dates control is absent or present; an example-line test pins the sentence with
a fixture of two names and the fallback; the existing home, RouteInput,
glossary and stylesheet tests pass with the new markup; one test proven by
mutation below. What the home sends the plan page is unchanged in form: no new
parameter name, no parameter in a new shape.

**Cost:** $0. No API call, no model, no store write. The example line is one
read of the local SQLite store, once per process and path (kept in memory),
and nothing at all when the store is absent.

**Weakest part:** The fold's fit at 844 px is arithmetic on the classes (header
69, title block 112, three fields 240, button 64, about 535 px to the button's
bottom, top-aligned so opening "More" pushes nothing up), not a measurement;
the runner's screenshot is the measurement. The example sentence puts "the"
before each name, which reads right for the Cadillac Ranch and the Big Texan
and for most store names with a page, and wrong for a name that takes no
article ("the Wall Drug"); the rule limits names to 40 characters so the line
stays two lines, and the store's two strongest with a page can be parks rather
than roadside oddities. The mood in the fold sends `persona` only when a mood
was chosen, a parameter the plan page has read since session 5; with none
chosen the query is byte for byte what it was.

## Gate 1 proofs

Mutation: in `src/app/page.tsx` the fold's initial state was made open by
default (`const initialMoreOpen = true || ...`); `bunx vitest run
src/app/__tests__/home.fold.ssr.test.tsx` then failed one test by name,
"keeps the dates and the mood folded under More when the URL carries no
date" (AssertionError: expected 'true' to be 'false'), 4 of 5 passing; the
file was restored from a copy, `cmp` identical, 5 of 5 passing. The whole
suite: 53 files, 512 tests green; `bun run type-check` 0 errors; `bun run
lint` 0 errors (9 warnings, all older than this branch and none in its
files). Not measured here: the 390 by 844 screenshot, which is the runner's.
