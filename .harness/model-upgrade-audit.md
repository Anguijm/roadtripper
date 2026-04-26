# Model upgrade audit

Run through every layer below whenever you swap a model used by the harness or the project. Skipping a layer is how regressions ship.

Roadtripper does not use an LLM in the user request path; the only model swap concerns are:
1. The Gemini model used by `council.py` (`HARNESS_MODEL` env var, default `gemini-2.5-pro`).
2. Any future LLM addition (e.g., a Claude-based analysis route).

## 1. Config

- [ ] Model ID updated in the single source of truth (env var `HARNESS_MODEL`, or constants module if a user-path LLM is added).
- [ ] No stray references to the old model ID anywhere in the repo. Grep before committing.
- [ ] Env var names documented in `.env.example` and the `.harness/README.md`.
- [ ] Default fallback model still valid (no retired IDs).

## 2. Callsites

- [ ] Every callsite that used the old model is either migrated or explicitly opted into staying on the old model (with a comment).
- [ ] SDK parameters still valid: max_tokens, temperature, system prompt shape, tool_use format, streaming options.
- [ ] Gemini: `client.models.generate_content(model=..., ...)` calls use the new model ID; `.harness/scripts/council.py` `DEFAULT_MODEL` updated if applicable.

## 3. Prompts

- [ ] System prompts (council personas, lead-architect) still produce the expected shape of output. Newer models can be stricter about instruction-following or more verbose.
- [ ] Output formatting (the `Score:` line specifically) still extracts via the runner's regex.
- [ ] Edge-case prompts still produce usable output (run a real plan through the council on the new model and inspect `.harness/last_council.md`).

## 4. Tests

- [ ] Smoke-test the new model with `python3 .harness/scripts/council.py --plan <some-real-plan>.md` — confirm all 6 angles + lead architect produce parseable output.
- [ ] Verify each angle's `Score:` extracts to an int (no n/a).

## 5. Costs

- [ ] New Gemini model's price-per-token documented in the comment near `DEFAULT_MODEL`.
- [ ] Run cost estimate updated: 7 calls × avg input/output tokens × new price.
- [ ] Rate limits (if relevant) adjusted.
