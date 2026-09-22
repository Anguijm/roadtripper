# Active plan — roadtripper

Branch: `harness/gate1-enforcement`

## Goal

Make Gate 1 executable instead of advisory.

Two protections in this repo were written down and then silently stopped
working. Both were found on 2026-09-23:

1. `.harness/learnings.md` records "Always run `bun run lint` before pushing"
   as a KEEP from Session 24, where skipping it cost 3 extra council rounds.
   Session 25 did not read it and did not run lint.
2. `CLAUDE.md` says a pre-push hook blocks direct pushes to `main`. That hook
   is in `.git/hooks/pre-push`, but `core.hooksPath` is `.harness/hooks`, so
   git never ran it. The protection had been dead for an unknown period.

Same failure both times: a rule stored as prose, in a place nothing executes.

## Change

`.harness/hooks/pre-push` (tracked, so it installs with the repo) blocks pushes
to main and runs lint, type-check and tests. It also refuses to push unless
`.harness/active_plan.md` names the current branch and carries a `Cost:` line
and a `Weakest part:` line, which turns the two judgement calls in Gate 1 into
something a script can insist on without pretending to make them.

`SKIP_GATE1=1` bypasses it loudly.

## Risk surface

- Files touched: `.harness/hooks/pre-push` (new),
  `.harness/scripts/install_hooks.sh`, `.harness/learnings.md`,
  `.harness/active_plan.md`.
- No application code. No runtime behaviour change.
- Failure mode: a noisier push. Bypass is one env var.

## Ship rule (declared before the work)

The hook must fail on a real violation, not just pass when things are fine.
Verified by removing the `Cost:` line and confirming the push is refused.

**Cost:** $0. Local hook only, no API calls, no deploy, no CI minutes. Adds
about 10 seconds per push (lint 5s, type-check 4s, tests 1.2s).

**Weakest part:** The plan-file checks test that a line *exists*, not that it
says anything true. I can satisfy `Cost:` with a lie. It converts silence into
a forced answer, which is a real improvement, but it is not verification and
should not be mistaken for it. The honest claim is that it removes "I forgot",
not "I was wrong".
