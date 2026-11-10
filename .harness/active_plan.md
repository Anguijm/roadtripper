<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: docs/dedupe-logs-record

(Docs only: records #175 and the /api/today log exclusion.)

Ship rule: BACKLOG, SESSION_HANDOFF and docs/car-api.md say what shipped and
what the server keeps of a request, and the learnings carry what went wrong.

Cost: None.

Weakest part: the privacy facts are true of today's code and log settings;
the doc asks whoever changes either to say so.
