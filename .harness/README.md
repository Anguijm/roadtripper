# .harness/

Development framework for Roadtripper. This directory is methodology-as-code: a Gemini-powered review council, durable session state, a git hook that captures every commit, and operational runbooks.

Not application code. Safe to delete if you want the project without the harness; the Next.js app does not depend on it.

Inspired by:
- **[harness-cli](https://github.com/anguijm/harness-cli)** — multi-persona council pattern.
- **LLMwiki-StudyGuide** — filesystem-driven council, runner script, post-commit hook, halt circuit breaker, model-upgrade discipline. This file structure is a port of that project's `.harness/` adapted for the Roadtripper stack (Firestore + App Hosting + Clerk + Google Maps).

## One-time setup

```bash
# 1. Install the Python dependencies for the council runner.
pip install -r .harness/scripts/requirements.txt

# 2. Point your local git at the harness hooks.
bash .harness/scripts/install_hooks.sh

# 3. Export your Gemini API key (add to ~/.zshrc or ~/.bashrc to persist).
export GEMINI_API_KEY="..."
```

Verify:

```bash
git config --get core.hooksPath           # → .harness/hooks
python3 .harness/scripts/council.py -h    # → help text, no import errors
```

## File map

```
.harness/
├── README.md                # this file
├── council/
│   ├── README.md            # how to add/remove angles
│   ├── security.md          # persona: server-only, Firestore Rules, rate limits, untrusted UE content
│   ├── architecture.md      # persona: App Router, server-only, DUs, schema validation, cache
│   ├── product.md           # persona: single-user trip-planning loop, mobile, scope
│   ├── bugs.md              # persona: nulls, races, retries, schema drift, request-id-stale-bail
│   ├── cost.md              # persona: Maps Directions, Firestore fan-out, council Gemini cap
│   ├── accessibility.md     # persona: WCAG AA, keyboard, screen reader, map-vs-list parity
│   └── lead-architect.md    # resolver: synthesizes the six into one plan
├── scripts/
│   ├── council.py           # Gemini council runner (filesystem-driven persona discovery)
│   ├── install_hooks.sh     # one-time: git config core.hooksPath
│   ├── requirements.txt     # Python deps for council.py
│   └── security_checklist.md# authoritative non-negotiables (loaded by council)
├── hooks/
│   └── post-commit          # auto-updates session_state.json + yolo_log.jsonl
├── memory/                  # session snapshots + decision history
│   └── decisions/           # session-N-council-review.md per-session records
├── session_state.json       # current state (active plan, focus, last council, last commit)
├── yolo_log.jsonl           # append-only audit trail
├── learnings.md             # human-readable KB (KEEP / IMPROVE / INSIGHT / COUNCIL)
├── model-upgrade-audit.md   # 5-layer checklist for model swaps
├── halt_instructions.md     # how to use the .harness_halt circuit breaker
└── last_council.md          # (created by council.py) latest run report
```

## Running the council

On a plan you've drafted (preferred — must be committed to git):

```bash
python3 .harness/scripts/council.py --plan Plans/session-N-some-feature.md
```

On the working-tree diff (post-implementation review):

```bash
python3 .harness/scripts/council.py --diff                  # vs origin/main
python3 .harness/scripts/council.py --diff --base main      # vs local main
```

Output goes to `.harness/last_council.md` (overwritten each run) and a `council_run` line is appended to `.harness/yolo_log.jsonl`. Per-angle scores are stored in `.harness/session_state.json` under `last_council`.

## Hard rules

- **Council refuses to review uncommitted plans.** Plans must be tracked in git and have no unstaged changes. Override with `--allow-untracked` only if you know what you're doing.
- **Cap of 15 Gemini calls per run** (`CALL_CAP` in `council.py`, declared as a non-negotiable in `.harness/council/cost.md`). The pre-flight check rejects any setup whose worst case exceeds the cap: `(num_personas + 1 lead) × (MAX_RETRIES + 1)`. With 6 angles + lead and `MAX_RETRIES=1` the worst case is 14. Adding a 7th angle pushes worst case to 16 and would require either relaxing the cost-doc cap or dropping retries to zero — read `cost.md` before doing either.
- **`.harness_halt` halts the council.** See `halt_instructions.md`.
- **Lead Architect cannot Proceed if any reviewer veto'd** (score ≤ 3 with non-negotiable cited) or if average < 5.
