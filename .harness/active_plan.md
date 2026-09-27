<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/session-27-learnings`

## Goal

Record the session-27 lessons in `learnings.md` while they are exact: ORS
counts requests, the timezone error, coverage-dependent tests, and a council
condition answered by citation. Docs only; `[skip council]`.

**Cost:** $0.

**Weakest part:** Three of the four are prose. The one that became code is
the planner; the timezone rule lives in a memory file and this text, and a
future session can still misread the date banner. The coverage lesson is
enforced only by the comment in radial.test.ts.
