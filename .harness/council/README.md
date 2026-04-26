# Council

Each `*.md` file in this directory (other than this README and `lead-architect.md`) defines a reviewer persona. The Gemini runner (`../scripts/council.py`) dispatches them in parallel and then runs the Lead Architect synthesis.

## Active angles

| File | Role | Scope |
|------|------|-------|
| `security.md` | Security Reviewer | Server-only enforcement, Firestore Rules, SA scoping, Server Action input validation, paid-API rate-limits, untrusted UE-pipeline content rendering, secret discipline |
| `architecture.md` | Architecture Reviewer | App Router boundaries, `server-only`, force-dynamic invariants, discriminated unions, schema validation at Firestore boundary, LRU cache discipline, RouteMap effect order, Server Actions |
| `product.md` | Product Reviewer | Single-user trip-planning loop, mobile-first, persona system, scope creep, anti-scope (multi-user, marketplace, social) |
| `bugs.md` | Bug Hunter | Nulls, races, retries, double-fires, schema drift, AbortController hygiene, silent failures, request-id-stale-bail order |
| `cost.md` | Cost Reviewer | Google Maps Directions per-request cost, Firestore fan-out, council Gemini budget (15 calls/run), per-user rate-limit layers |
| `accessibility.md` | Accessibility Reviewer | Keyboard, screen reader, WCAG AA, motion, mobile touch targets, map-vs-list parity, i18n |
| `lead-architect.md` | Resolver — synthesizes the six into one plan |

## Adding a new angle

1. Create `<angle>.md` in this directory following the persona shape in any existing file:
   - One-sentence role statement ("You are a <Role>...").
   - Scope list.
   - Review checklist (numbered questions).
   - Output format (fenced block).
   - Scoring rubric (1–10).
   - Non-negotiables (veto power).
2. The runner auto-picks it up — no code change.
3. Smoke-test by running `python3 ../scripts/council.py --plan Plans/<some-plan>.md` and confirm the new angle appears in `.harness/last_council.md`.
4. Append the entry to the table above in this README.

## Removing an angle

Delete the file. The runner skips it on the next invocation.

## Disabling an angle temporarily

Rename to `<angle>.md.disabled`. The runner only loads files ending in `.md`.

## Cost cap

The runner enforces 15 Gemini calls per run (hard). Adding a new angle eats one of those slots. If you're near the cap, remove a weaker angle before adding a new one.

## Style invariants for new personas

- No emojis.
- Opening line: `You are a <Role> examining a development plan for Roadtripper...`
- Always include non-negotiables that grant veto power (so the Lead Architect knows when to reject).
- Keep the checklist actionable — questions, not lectures.
- Output format must be machine-parseable (fenced block with `Score:` on its own line so the log can extract it).
