# Skill: Build (Feature Development Session)

**Description:** Implement one feature from the roadmap per session. Follow the full pipeline: orient → council → plan → build → test → review → ship. Used for all new feature work.

**Trigger:** Bootstrap routes here when `next_session_type` is "build" or "refine".

---

## Methodology

### 1. Orient
- Read `session_state.json` → `current_phase` and `roadmap` for what's next
- Read `learnings.md` for relevant patterns and anti-patterns
- Read `design.md` if the feature has UI components
- Check `.harness/memory/decisions.json` for prior architectural decisions
- Identify the ONE feature to build this session

### 2. Council (HARD GATE — cannot proceed without)

Significance check first. If the feature is **significant** (new API routes, data layer code, map integration, auth flows, algorithms, persona/scoring logic, new pages that fetch data) → council is REQUIRED. If the feature is **exempt** (pure styling, copy, README, renames, dep bumps) → skip to step 3.

**Council protocol:**

a. Read the persona prompts:
   - `.harness/council/security.md`
   - `.harness/council/architecture.md`
   - `.harness/council/product.md`

b. **Spawn 3 parallel agents** via the Agent tool, all `general-purpose`, all with `run_in_background: true`:
   - `retro-security` — pass the security persona prompt + feature description + specific files/decisions
   - `retro-architecture` — same with architecture persona
   - `retro-product` — same with product persona

c. **Wait for all 3 verdicts.** Do not start coding while they are running. Use the time to update the PRD draft.

d. **Synthesize as Lead Architect:** read all 3 reports, resolve conflicts, write a brief decision record. Document which findings to fix vs defer (with reasoning).

e. **Encode council fixes as ISC criteria** in the PRD before EXECUTE phase begins. The build is verified against them.

**Why this is a hard gate:** Council exists to catch design errors before they cement. Skipping it because "I know what to build" is the failure mode it prevents. Sessions 1-4 of Roadtripper shipped without council and the recommendation engine landed with hardcoded constants, no rate limiting, no caching — all caught in retroactive review.

### 3. Plan
- Translate council findings into concrete ISC criteria
- Identify the files to create/modify
- Note which Urban Explorer patterns to reuse (firebaseAdmin pattern, schemas, etc.)

### 4. Build
- Follow Next.js conventions: App Router file structure, Server/Client Component split
- Query Urban Explorer Firestore via Admin SDK in Server Components only (read-only)
- Use flat mirror collections (`vibe_neighborhoods`, `vibe_waypoints`) for list queries
- Follow `design.md` for all visual decisions
- Address council findings as you go — don't defer them silently

### 5. Test
Run the full verification suite:
```bash
npm run lint          # ESLint
npm run type-check    # TypeScript strict mode
npm run build         # Next.js production build (catches SSR issues)
```
If ANY check fails → fix → retest (max 3 retries per Dark Factory protocol).

### 6. Review
- Send changed files to `mcp__gemini__gemini-analyze-code` (focus: bugs, security)
- Fix every real bug identified
- Retest after fixes
- If Gemini caught bugs the council didn't, update the council prompts so the gap is closed for next session

### 7. Ship
- Commit with descriptive message + Co-Authored-By trailer
- Push to remote
- Deploy via `npx firebase-tools deploy --only apphosting` if the change is user-visible
- Update `session_state.json`:
  - Move feature from `roadmap` to `completed_features`
  - Update `current_phase.last_session_work`
  - Set `next_action` for the following session
- Update `learnings.md` with KEEP/IMPROVE/DISCARD/INSIGHT entries

## Input
- `session_state.json` (what to build)
- `design.md` (how it looks)
- `learnings.md` (what to avoid)
- `.harness/council/*.md` (council persona prompts)

## Output
- One shipped feature (committed + deployed)
- Council decision record (synthesized from 3 agent reports)
- Updated session_state.json, learnings.md
