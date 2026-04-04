# Skill: Build (Feature Development Session)

**Description:** Implement one feature from the roadmap per session. Follow the full pipeline: plan → build → test → review → commit. Used for all new feature work.

**Trigger:** Bootstrap routes here when `next_session_type` is "build" or "refine".

---

## Methodology

### 1. Orient
- Read `session_state.json` → `current_phase` and `roadmap` for what's next
- Read `learnings.md` for relevant patterns and anti-patterns
- Read `design.md` if the feature has UI components
- Check `.harness/memory/decisions.json` for prior architectural decisions
- Identify the ONE feature to build this session

### 2. Plan (Harness Council)
For significant features (new pages, API routes, data model changes):
- Run `node ~/harness-cli/src/cli.js plan "<feature description>"`
- Review council scores (security, architecture, product)
- Accept or adjust the plan
- Implementation follows the approved plan

For minor features (styling, copy, config):
- Skip council, proceed directly to build

### 3. Build
- Follow Next.js conventions: App Router file structure, Server/Client Component split
- Query Urban Explorer Firestore via Admin SDK in Server Components
- Use flat mirror collections (`vibe_neighborhoods`, `vibe_waypoints`) for list queries
- Follow `design.md` for all visual decisions
- One feature branch if git is initialized, otherwise work on main

### 4. Test
Run the full verification suite:
```bash
npm run lint          # ESLint
npm run type-check    # TypeScript strict mode
npm run build         # Next.js production build (catches SSR issues)
```
If ANY check fails → fix → retest (max 3 retries).

### 5. Review
- Send changed files to `mcp__gemini__gemini-analyze-code` (focus: bugs, security)
- Fix every real bug identified
- Retest after fixes
- For major features: harness `review` command planned for v0.2 — use Gemini review until then

### 6. Ship
- Commit with descriptive message + Co-Authored-By trailer
- Push to remote
- Update `session_state.json`:
  - Move feature from `roadmap` to `completed_features`
  - Update `current_phase.last_session_work`
  - Set `next_action` for the following session
- Update `learnings.md` with KEEP/IMPROVE/DISCARD/INSIGHT entries

## Input
- `session_state.json` (what to build)
- `design.md` (how it looks)
- `learnings.md` (what to avoid)
- `.harness/plan.md` (if council was run)

## Output
- One shipped feature (committed code)
- Updated session_state.json, learnings.md
- Council review results (if applicable)
