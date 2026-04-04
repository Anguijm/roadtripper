# Skill: Code Review

**Description:** Run code through Gemini and harness council for adversarial review. Used as a sub-skill within Build sessions or standalone for audit passes.

**Trigger:** After code is written and tests pass. Called by Build skill or directly by user.

---

## Methodology

### 1. Identify Changed Files
- Use `git diff --name-only` to find modified files since last commit
- Prioritize: API routes > Server Components > Client Components > utilities > config

### 2. Gemini Code Review
- Use `mcp__gemini__gemini-analyze-code` with focus on bugs and security
- Send ACTUAL CODE, not summaries
- For large files: send in sections (TypeScript logic first, then JSX/template)

### 3. Triage Gemini Results

**Fix immediately:**
- Logic errors, crashes, security vulnerabilities
- Firestore query issues (wrong collection, missing index)
- Google Maps API misuse (unbounded requests, missing error handling)
- Auth bypass or data exposure

**Evaluate case-by-case:**
- Performance issues (fix if easy, note in learnings if architectural)
- UX issues (fix if user-visible)

**Skip:**
- Style suggestions (Tailwind class ordering, etc.)
- Hypothetical edge cases on platforms we don't target

### 4. Harness Council Review (major features only — pending v0.2)
- Harness `review` command is planned for v0.2; until then, rely on Gemini code review above
- When available, council will check: security (auth, Firestore rules, API keys), architecture (data flow, boundaries), product (UX, personas)

### 5. Fix & Retest
- Fix all identified bugs
- Run full test suite: `npm run lint && npm run type-check && npm run build`
- If new failures → fix → retest (max 3 cycles)

### 6. Record Learnings
- Add KEEP/IMPROVE/INSIGHT entries to `learnings.md`
- If a bug class appears twice, add it to the testing protocol

## Input
- Source code (changed files)
- Git diff context

## Output
- List of bugs found and fixed
- Clean test results
- Learnings entries
