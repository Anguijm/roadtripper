# Contributing to Roadtripper

## The council

Every PR is reviewed by an automated multi-persona council before merge. The council runs as a GitHub Action (`.github/workflows/council.yml`), is implemented at `.harness/scripts/council.py`, and is documented at `.harness/README.md`. Six reviewer personas (security, architecture, product, bugs, cost, accessibility) plus a lead-architect resolver — each one a markdown file under `.harness/council/` — produce a structured critique that gets posted as a single re-edited PR comment.

The council runs on Gemini 2.5 Pro via a separate API key (`GEMINI_API_KEY` repo secret), deliberately a different model than the one writing the code. The cost is roughly $0.30–0.50 per PR and the workflow enforces a hard monthly cap of 60 runs.

### What the council does

- Catches issues a single AI reviewer in the same conversation as the code-writing AI would miss (different model, different blind spots).
- Refuses to review uncommitted plan files (`--allow-untracked` is forbidden in CI). Approval requires git-of-record, not a chat-summary handshake.
- Secret-scans the PR diff with `gitleaks` BEFORE shipping it to the LLM.
- Halts if `.harness_halt` exists at the repo root.
- Updates a single `<!-- council-report -->` PR comment in place rather than spamming on every push.

### What it doesn't do

- It does not block merge mechanically. The Lead Architect's verdict (Proceed / Revise / Reject) is advisory; humans gate merge.
- It does not replace human review. The persona output should sharpen reviewer attention, not substitute for it.
- It does not look at runtime behavior — it sees the diff, not the running code.

### Bypass

Add `[skip council]` (case-insensitive) to the PR title to skip the run on subsequent pushes. Prefer this for trivial commits (typos, copy tweaks, docs-only) where the council cost outweighs its signal.

### Cost backstop (mandatory)

The workflow's monthly run cap (60) is a soft limit — it can drift due to a documented cross-PR race in the GH Actions cache. **Set a hard external budget alert at the GCP project that owns the `GEMINI_API_KEY`** so a runaway scenario surfaces independently of the workflow's accounting:

1. Open the [GCP Billing Budgets console](https://console.cloud.google.com/billing/budgets) for the project that owns the API key.
2. Create a budget scoped to the **Generative Language API** SKU.
3. Set the amount to **$50/month** (matching the kill criterion below).
4. Configure email alerts at 50% / 90% / 100% to the repo owner.

This is a defense-in-depth backstop, not an alternative to the workflow's monthly cap. Both should be in place; the workflow cap stops cost early in the typical case, and the GCP alert catches the cross-PR race or any future runaway.

### Kill criteria

The council was added on the hypothesis that automated multi-persona review improves PR quality without disproportionately slowing the cycle. The hypothesis is testable. It will be rolled back if any of the following hold over a one-month window:

1. **PR cycle time (open → merge) increases by more than 25%** without a corresponding drop in post-merge defect rate.
2. **Council feedback is being routinely ignored** (judged by inspection of merged PRs vs. the council's blockers in the comment thread).
3. **Cost exceeds $50/month** on the council itself, sustained for two consecutive months.

To roll back: revert the three commits that introduced the council (`a374810`, `a36cd51`, `4494cf2`), or surgically remove `.github/workflows/council.yml` and `.harness/`. The application code does not depend on either.

## Running the council locally

```
python3 -m venv .harness/.venv
.harness/.venv/bin/pip install -r .harness/scripts/requirements.txt
bash .harness/scripts/install_hooks.sh
export GEMINI_API_KEY=...   # https://aistudio.google.com/app/apikey

# Pre-EXECUTE — review a tracked plan file
.harness/.venv/bin/python .harness/scripts/council.py \
  --plan Plans/session-N-<slug>.md

# Post-implementation — review the working-tree diff
.harness/.venv/bin/python .harness/scripts/council.py --diff
```

Output lands at `.harness/last_council.md` (regenerated each run; gitignored). Persistent records are appended to `.harness/yolo_log.jsonl` and `.harness/session_state.json`.

## Modifying the council

Personas are filesystem-driven. Add a reviewer by dropping a new `<angle>.md` in `.harness/council/`; the runner picks it up automatically. Disable temporarily by renaming to `<angle>.md.disabled`. Remove permanently by deleting the file.

The pre-flight check rejects setups whose worst case (every call exhausting its retry budget) exceeds `CALL_CAP`. Adding an 8th angle requires bumping `CALL_CAP` in `.harness/scripts/council.py` first.

## What counts as approval

The Lead Architect resolver issues one of three verdicts on every run:

- **Proceed** — plan is sound, no further changes required.
- **Revise** — plan needs the listed changes before merge. Address them, push, council re-runs, comment updates in place.
- **Reject** — plan violates a non-negotiable that cannot be patched. Redesign required.

Any reviewer veto (score ≤ 3 with a non-negotiable cited) forces Revise or Reject. Average score below 5 defaults to Revise. Any reviewer flagging missing tests means step 1 of the resolver's plan is "write the test."

CONDITIONAL/Revise is the normal shape, not failure. The findings are the value, not the verdict.
