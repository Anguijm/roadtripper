<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: docs/u51-record

(Docs only: records U51, shipped as #167, live 10:35 JST.)

## Ship rule (written before the work)

U51. John allowed plain-word rewrites of the Wikipedia lines (2026-11-10)
and approved five exact lines, each using only facts from its Wikipedia
article. city-atlas-service #66 keeps them in a tracked overrides file that
wins at ingest, and wrote them to Firestore; this PR is the re-exported atlas.

The rule: on production, Omaha to Denver, Grand Island opened, the Stuhr
Museum's `data-reason` is "Prairie pioneer museum with Railroad Town, a
living-history 1890s village of original buildings." The old build says "A
museum intended to preserve ...", so it fails.

Atlas diff: 5 waypoint descriptions changed (Stuhr Museum, Fonner Park,
Wendover Will, Reliance Tipple, Howard Payne University), nothing else;
counts 303 / 2,241 / 13,659 / 6,116 unchanged; integrity_check ok.

Critic before merge: matched 390 px pair, production (old) against local
(new), Grand Island opened, the Stuhr row centered, blind.

**Cost:** None at run time.

**Weakest part:** The lines are no longer the sources' own sentences; their
accuracy rests on the drafting and John's approval, each cited in
city-atlas-service's data/description-overrides.json.
