<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: feat/client-tag

## Ship rule (written before the work)

The car session asked (2026-11-10) to tell its calls apart in our logs: App
Hosting hands every request to the app with the User-Agent "Google", so the
`ua=` part of the log lines never said anything. The car sends
`client=car-<version>` in the query on all four car paths; each logs it
beside the status (or `-`), never a position. A malformed tag is ignored,
never a 400. docs/car-api.md says so, and the records for #177 and #178 go in
with it.

## Done

- `src/lib/today/client.ts` (`clientTag`), used by /api/today, /toward,
  /towns (which now logs a line) and /town-requests.
- Contract, privacy section, the car's template finding, BACKLOG,
  SESSION_HANDOFF, learnings.

## Mutation proofs

Each was restored and `cmp` clean.
- The tag passed through unchecked: red.
- /api/today dropping the tag: red.
- /towns logging nothing: red.

Cost: None.

Weakest part: the tag is what the client says it is; it identifies an app
version, not a person, and anyone can send any tag that fits the pattern.
