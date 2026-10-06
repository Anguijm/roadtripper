<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/merge-without-asking`

## Ship rule

Docs only. CLAUDE.md says what the operator decided on 2026-10-07 — merge
without asking once the checks hold, and keep the record — and how to
check production after a merge so the check can actually fail.

**Cost:** $0.

**Weakest part:** Merging without the operator's look moves the last human
check off every screen. The critic still judges each one blind, but the
critic has approved things the operator later saw differently would never
be caught now until he happens to look.
