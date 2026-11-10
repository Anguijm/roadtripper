<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: docs/u52-record

(Docs only: records U52, shipped as #169, live 10:49 JST.)

## Ship rule (written before the work)

U52. The car session saw /api/today offer Toronto from Detroit like any
other town. John chose to label, not hide (2026-11-10). A town whose atlas
country differs from the country of the atlas town nearest the start says
"in Canada" beside its name: on /plan (RecommendationList, both header
forms), on /today, and in /api/today as `country` on each town and on
`here` (non-breaking addition, docs/car-api.md). Unknown country on either
side labels nothing.

The rule: on production, /today from Detroit at 4 h shows "Toronto · in
Canada"; /api/today from Detroit gives Toronto `country: "Canada"` and here
`country: "United States"`. The old build has neither.

**Cost:** None at run time. One more atlas lookup (snapToCity) per /plan
render, the same indexed read /today already makes.

**Weakest part:** The start's country is the nearest atlas town's, within
40 km; a start farther from any atlas town labels nothing.
