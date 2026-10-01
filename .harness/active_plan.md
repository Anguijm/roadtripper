<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/round-2-closeout`

## Ship rule (written before the work)

Ships when `gauntlet/round-2-report.md` records what round 2 shipped, what
each gate caught and what neither caught, and the residuals by name;
`BACKLOG.md` and `SESSION_HANDOFF.md` say what is true on 2026-10-01
rather than what was true in May; and Gate 1 is green. Docs only: no
source file changes, so `[skip council]` on the PR.

**Cost:** $0. No model call, no store write, no route, no screenshot.

**Weakest part:** A report is a claim about what happened, and the only
check on it is that I wrote both the work and the report. The figures in
it are the ones measured at the time and quoted from the plan file, not
recomputed — if one of them was wrong when it was recorded, it is wrong
here too and nothing in this branch would catch that.
