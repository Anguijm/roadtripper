# Skill: Bootstrap

**Description:** Initialize a session by reading state files and routing to the correct skill. First skill loaded in every session.

**Trigger:** Start of any new session, or when the user says "let's go" / "what's next" / "continue".

---

## Methodology

1. Read `session_state.json` for full context recovery
2. Read `learnings.md` (first 30 lines — accumulated principles)
3. Determine session type from `current_phase.next_session_type`:
   - **build** → load `skills/10-build.md`
   - **review** → load `skills/20-review.md`
   - **refine** → load `skills/10-build.md` (with refinement flag)
4. If user overrides with specific request, follow that instead
5. Report: last session summary, next action, any blockers from learnings

## Input
- `session_state.json` (auto-generated)
- `learnings.md` (accumulated knowledge)

## Output
- Decision: Build, Review, or Refine
- Context summary for the routed skill
- Route to the correct skill chain
