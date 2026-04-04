# Roadtripper — Program Methodology

Road trip planner that uses the Urban Explorer Firestore database (102 cities with neighborhoods, waypoints, vibes, and photo tasks) to generate persona-driven, multi-day road trip itineraries. The user provides start/end cities and a daily drive time budget; the app recommends curated stops along the route based on who the traveler is.

## Tech Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Firebase Firestore (`urbanexplorer` named database — read-only access to existing collections)
- Google Maps API (Directions, Distance Matrix)
- Clerk auth
- Deployed via Firebase App Hosting

## Data Source: Urban Explorer

The `urbanexplorer` named database contains 102 cities. Each city document includes neighborhoods, waypoints, vibes, and photo tasks. Roadtripper reads this data — it never writes to it. The Urban Explorer schema is the source of truth; roadtripper adapts to it, not the other way around.

## Persona System

Personas shape every recommendation. An outdoorsman sees trailheads and state parks; a boardgamer sees game cafes and hobby shops; a car enthusiast sees scenic drives and car museums. Persona definitions live in `lib/personas/` and map to Urban Explorer vibe tags and waypoint categories. New personas are additive — adding one must not break existing ones.

---

## Bedrock Rules

These are non-negotiable. Every session, every feature, every line of code.

1. **Test everything you build.** Never mark a feature done unless you have verified it works. Run the full test protocol before closing any session.
2. **Council reviews all significant work.** Every feature gets `harness plan` before implementation and `harness review` after. The council catches what you miss.
3. **Learn from every session.** Read learnings before starting. Write learnings before ending. The system compounds or it decays.
4. **Never mark done unless verified.** If tests reveal bugs, fix them. If you cannot fix them, mark the feature "partial" honestly. Lying about status wastes time.
5. **Respect the data source.** Never write to the `urbanexplorer` database. Cache aggressively. Treat Urban Explorer schemas as immutable.

---

## Session Workflow

Every session follows this exact sequence:

1. **Read `session_state.json`** — recover full context: current feature, blockers, what was done last session, what is next.
2. **Read `skills/00-bootstrap.md`** — determine which skill to execute this session.
3. **Read `learnings.md`** — apply accumulated knowledge. Do not repeat past mistakes.
4. **Follow the routed skill's methodology** step by step.
5. **On completion**, update `session_state.json` to persist state.

Sessions are **feature-focused** — each session works on one feature from the roadmap. There is no tick-tock cadence; every session advances roadtripper directly.

---

## Feature Development Rules

1. **One feature per session.** Do not start a second feature until the first is tested, reviewed, and logged.
2. **Read the roadmap first.** The roadmap in `session_state.json` defines priority order. Do not skip ahead unless a dependency forces it.
3. **Regression test existing features.** After any change, verify that previously working features still work. Run `npm run build` as the minimum regression gate.
4. **Update learnings.** Every session ends with a learnings entry — what worked, what broke, what to do differently.
5. **Incremental commits.** Commit after each meaningful unit of work, not just at the end.
6. **No scope creep.** If you discover adjacent work, note it in the roadmap and move on.

---

## Testing Protocol

**All checks must pass before a feature is considered done.**

### Automated Gates (run in order)

```bash
npm run lint          # ESLint — zero errors, zero warnings
npm run type-check    # tsc --noEmit — zero type errors
npm run build         # Next.js production build — must succeed
```

If any gate fails, fix the issue and re-run all three from the top.

### Gemini Code Review

After automated gates pass, send the actual code (not summaries) to Gemini via MCP for review:

1. Use `mcp__gemini__gemini-analyze-code` to review every new or modified file.
2. Address all bugs and security issues Gemini identifies. Style suggestions are optional.
3. If Gemini finds a critical bug, fix it and re-run the full automated gate sequence.

### Manual Verification

After automated + Gemini review:
- Verify the feature works in the browser (dev server or preview build)
- Verify on mobile viewport (375px width minimum)
- Verify no console errors

### Dark Factory Retry Loop

1. After the test suite runs, if ANY check fails:
   - Fix the specific failure
   - Re-run the **entire** suite (not just the failed check)
   - Repeat until all checks pass — maximum 3 retry cycles
2. After Gemini code audit, if bugs are found:
   - Fix all identified bugs
   - Re-run the full test suite again
   - If new failures appear, loop back to step 1
3. Only proceed to commit after **both** test suite AND Gemini audit pass with zero issues.

---

## Harness Council Review

Significant features (new routes, persona logic, map integration, data layer changes) require council review:

1. **Before implementation:** Run `node ~/harness-cli/src/cli.js plan "<feature description>"`. Incorporate council feedback into your approach.
2. **After implementation:** Run Gemini code review (see Testing Protocol). Harness `review` command is planned for v0.2 — use Gemini until then.
3. Minor changes (copy edits, style tweaks, config) skip council review.

Council checks:
- **Security:** Firestore rules, API key exposure, Clerk session management, XSS
- **Architecture:** Data flow, Server/Client Component boundaries, caching strategy, API design
- **Product:** UX, persona relevance, route accuracy, mobile experience

---

## Data Integration Rules

### Firestore Access

- Always use the **named database** `urbanexplorer` — never the default database.
- Initialize with `getFirestore(app, 'urbanexplorer')`.
- All queries are **read-only**. No writes, no deletes, no updates to Urban Explorer data.
- Use flat mirror collections (`vibe_neighborhoods`, `vibe_waypoints`) for list queries.
- Use hierarchical collections only for detail views.

### Caching Strategy

- Cache city data aggressively — the 102 cities change infrequently.
- Use Server Components with Firestore Admin SDK for initial data loads.
- Cache Google Maps distance/direction results per origin-destination pair for the session.
- Invalidation: cache TTL of 24 hours for city data, 1 hour for routing data.

### Schema Respect

- Read the existing Urban Explorer collection schemas before writing any query.
- If a schema field is missing or renamed, adapt the query — do not assume or fabricate fields.
- Document any schema assumptions in `src/lib/urban-explorer/schemas.ts`.

---

## Logging and State

### session_state.json

Updated at the end of every session. Contains:
- `current_phase`: which roadmap phase is active (foundation, core, personas, polish)
- `last_session_work`: what was done
- `next_action`: what the next session should do
- `completed_features`: array of shipped features
- `roadmap`: feature backlog organized by phase
- `session_log`: array of session summaries

### learnings.md

Updated at the end of every session. Each entry:

```
### [feature-name] (YYYY-MM-DD)
- **KEEP**: [technique] — [why it worked]
- **IMPROVE**: [issue] — [what review caught] — [fix for next time]
- **DISCARD**: [approach] — [why it failed]
- **INSIGHT**: [generalizable principle]
- **TEST CAUGHT**: [bug] — would have shipped broken without testing
```

---

## Continuous Improvement

1. **Compound learnings.** Every 5 sessions, review the last 5 entries in `learnings.md`. Identify patterns. Update the testing protocol if tests missed bugs.
2. **Update testing gates.** If a class of bug slips through (type error, runtime crash, broken route), add a targeted check to the automated gates.
3. **Refine personas.** After each persona-related feature, verify recommendations against real Urban Explorer data. If a persona returns empty or irrelevant results, tune the mapping.
4. **Track Firestore costs.** Monitor read counts. If caching is insufficient, add more aggressive caching or batch reads.
5. **Zero regressions.** Every bug found in a previously working feature is a process failure. Update the regression testing approach to prevent recurrence.

---

## The Loop

One feature per session. The flow is:

1. Read `session_state.json`, `learnings.md` — recover context
2. Identify the next feature from the roadmap
3. Run `harness plan` for significant features
4. Build the feature, following `design.md` for UI
5. Run full test suite — fix any failures
6. Gemini code review — send actual code, address bugs
7. Re-test after fixes — verify nothing broke
8. Run `harness review` for significant features
9. Commit and push
10. Update `session_state.json` and `learnings.md`
11. Done — leave a summary as the final message
