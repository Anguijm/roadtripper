<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/town-requests

## Ship rule (written before the work)

John chose (2026-11-10) "Plus 'add this town' button": a typed destination
the atlas lacks can be asked for by name, and requested towns are added in
batches with the one-town recipe. POST /api/today/town-requests takes only
the name (2 to 80 characters of a place name), answers 202, and keeps one
quoted app log line for 30 days. docs/car-api.md and atlas-gaps.md (step 0)
say where the requests are read.

## Done

- `src/lib/today/town-request.ts`: the name rules, pure.
- `src/app/api/today/town-requests/route.ts`: JSON only, 1 KB body cap, the
  per-IP burst limit, one quoted log line, nothing stored.

## Mutation proofs

Each was restored and `cmp` clean.
- No character check, no length cap, the log line unquoted, no body size
  cap, no Content-Type check: each red.
- A separate control-character check survived, because the character check
  already refuses every control character. It was dead code and is removed.

Cost: None.

Weakest part: requests are read from Cloud Logging by hand, in batches; a
request older than 30 days is gone. The rate limit is per IP and per
instance, so a determined sender could fill the log with junk names, which
are only read, never acted on without a look.
