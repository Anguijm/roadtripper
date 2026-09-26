<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/session-26-learnings`

## Goal

Record the session-26 lessons in `learnings.md` while they are exact. Docs
only; `[skip council]`.

**Cost:** $0.

**Weakest part:** These are prose, which is precisely the class of lesson this
file has already shown does not survive into the next session. The `-X theirs`
and suppressed-output lessons should become a pre-rebase or pre-push check,
and they are not yet. This entry records the failure; it does not prevent it.
