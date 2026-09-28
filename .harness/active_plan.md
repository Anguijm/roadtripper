<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/round-1-u2-and-lockfile-gate`

## Ship rule (written before the work)

Ships when: the round-1 report has U2's section with what happened and what
was routed on; `gauntlet/round-1.md` declares U3's ship rule before U3's
builder runs (its worktree was cut from the same main, and its rule is in git
before its first commit); and Gate 1 refuses a push whose `package.json` is
out of sync with `package-lock.json`, proven by mutation.

**Cost:** $0 in API calls; one council run on the hook change, cents.

**Weakest part:** The lockfile check runs `npm ci --dry-run` against the
working tree, not against the pushed commit; a push from a tree with
uncommitted lockfile edits checks the tree, not the branch. The council's
`validate` still checks the commit, so the gap is a slower failure, not a
missed one.

## Gate 1 proofs

Mutation: with `left-pad` added to `package.json` and no lockfile change,
`npm ci --dry-run --ignore-scripts` exits 1 (the hook's `fail` path);
`package.json` restored, `cmp` identical, the dry run exits 0. The hook
parses (`bash -n`). This branch changes neither `package.json` nor a
lockfile, so the check is skipped on this push, as designed.
