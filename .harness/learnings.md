# Learnings

Append-only knowledge base. Every completed task ends with a block below. Do not rewrite history; add new entries.

Note: there is also a `learnings.md` at the repo root from earlier sessions (S1–S7 retrospectives). That file remains the historical record. New COUNCIL-tagged entries land here, where the council runner can find them adjacent to its own outputs.

## Block format

```
## <YYYY-MM-DD HH:MM UTC> — <task title>
### KEEP
- <what worked; pattern worth repeating>
### IMPROVE
- <what to change next time>
### INSIGHT
- <non-obvious thing worth remembering; architecture lesson, cost gotcha, a user-truth, etc.>
### COUNCIL
- <notable feedback from the Gemini council run, if any; link to .harness/last_council.md snapshot if useful>
```

Keep each bullet tight. The goal is fast recall for the next session, not a blog post.

---

## 2026-04-26 17:00 UTC — Council v2 ported from LLMwiki-StudyGuide
### KEEP
- Filesystem-driven persona discovery — adding/removing reviewers is a `mv` away. No code change to `council.py`.
- Six angles + lead-architect is the right cardinality for a non-trivial plan. Three (the previous S5–S7 shape) misses bug-class and cost concerns that surface real blockers.
- Hard rules in `lead-architect.md` (veto → can't Proceed; avg < 5 → Revise; missing tests → step 1) keep the resolver from softening blockers into "considerations."
- Tracking guard (refusing untracked plan files) makes the council a property of git-of-record, not a chat-summary handshake.
### IMPROVE
- The post-commit hook auto-updates `session_state.json` and `yolo_log.jsonl`; the next commit will include those updates. Document this loop more visibly in the README.
### INSIGHT
- Hand-spawning council agents in-conversation looks deterministic but isn't. The qualitative leap of porting the runner is "you can re-run the SAME council on the SAME plan three months from now and get a comparable result." That property is what made the S5–S7 setup feel wrong.
- The runner enforces the human-in-the-loop contract better than a doctrine note ever could: a missing GEMINI_API_KEY exits before any work happens; a missing tracked plan exits before any work happens. Failure modes are explicit and early.
### COUNCIL
- This entry pre-dates the v2 council's first real run. The S8 plan (`Plans/session-8-neighborhood-drilldown.md`) will be the first input. Live API call pending on user setting `GEMINI_API_KEY` from https://aistudio.google.com/app/apikey.
