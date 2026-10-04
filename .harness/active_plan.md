<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/council-advisory`

## Ship rule (written before the work)

Ships when CLAUDE.md and `gauntlet/quality-bar.md` say what the operator
decided on 2026-10-04 — the council is advisory, not a gate — and what
gates a merge in its place. Docs only. Gate 1 green.

**Cost:** $0.

**Weakest part:** Rule 2, the mutation proof before pushing, is a rule I
set for myself and the only enforcement is that I follow it. Nothing in
Gate 1 checks that a mutation was run. It held in round 2 only when
something else prompted it, which is the habit this rule exists to break.
