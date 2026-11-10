<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: docs/toledo-record

(Docs only: records Toledo, shipped as #171 and city-atlas-service #67.)

Ship rule: README, BACKLOG, SESSION_HANDOFF, docs/atlas-gaps.md and the
learnings say 304 cities and 6,190 drive pairs wherever they state the
current count, and atlas-gaps.md holds the one-town recipe as run.

Cost: None.

Weakest part: the recipe was run once, on this machine. The Chrome preload
for Playwright is written out in the doc, not kept as a file in either repo.
