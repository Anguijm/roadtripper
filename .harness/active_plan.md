<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `chore/gate1-conflict-check`

## Goal

Gate 1 learns the lesson of 2026-09-27: a pull request that conflicts with
main runs no council and no CI, and GitHub says nothing. Two PRs were open;
both rewrote this file, as every PR does; when the first merged, the
second's next two pushes fired no workflow and looked like a queue for half
an hour. The hook now refuses such a push and says to rebase. The learnings
file gets the session's other lessons at the same time.

## Ship rule, written before the work

1. The check is first, before lint, types and tests, because it is the
   cheapest and its answer is "rebase before you spend two minutes here".
2. It fetches origin/main quietly and asks `git merge-tree --write-tree`
   whether the merge would conflict, touching no file. Exit 1 is a conflict
   and refuses the push with the reason and the fix. Any other failure
   (no network, a git too old for `--write-tree`) is a warning and the push
   goes on: a flaky remote is not a reason to refuse work.
3. Proven both ways on the real commits: the old head of #66 against main
   after #65 is refused with the message; this branch passes and then runs
   the rest of the gate.
4. Learnings: the timeout signal born outside the retry loop, the silent
   council on a conflicting PR, resumption over patience confirmed by the
   16-minute corridor, the corridor eyeball under the second tag list, and
   the sheet's 64-chip write limit.

**Cost:** $0. One quiet fetch of main per push, on a connection the push
already needs.

**Weakest part:** A bash hook with no test harness; the proof is the two
manual runs recorded here, not a test that runs on every change. And the
check protects only against the conflict we have met; a pull request
GitHub declines to run for any other reason will still look like a queue.

## Gate 1 proofs

- Negative: a temporary worktree at 0212f7c (the head of #66 before its rebase) fed a fake ref line to the new hook: "gate1: FAIL this branch conflicts with origin/main. Rebase first: …", exit 1, before lint ran.
- Positive: the same on this branch: "merges cleanly onto origin/main", then lint, types and tests pass.
- `git merge-tree --write-tree 0af6f1f 0212f7c` exits 1 and names `.harness/active_plan.md` as the conflict; against this branch it exits 0.

## Council round 1 on #67 (CONDITIONAL, bugs 5, product 5), and what changed

- the check now runs on each branch head in the push (gathered from the ref lines git hands the hook), not on HEAD, so pushing another branch from this checkout checks the right commit; a push of tags alone, or deletions alone, skips it and says so
- the fetch is bounded to 20 s with coreutils `timeout` where present. Answered, not changed: `git fetch` has no `--timeout` flag; the bound is the process timeout
- Proven again: the old head of #66 pushed from a checkout of main is refused by its own sha; a tags-only ref line skips the check and the gate goes on; this branch's head passes
