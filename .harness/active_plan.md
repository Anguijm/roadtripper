<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: fix/home-city-count

## Ship rule (written before the work)

The home page said "Built on Urban Explorer: 258 cities"; the atlas has had
303 since U45 (#151). Found in the 2026-10-23 docs refresh, queued by John
2026-11-10. The number is now counted from the atlas that ships with the build
(`getAllCities().length` in `src/app/page.tsx`), so the next atlas change
cannot leave it stale again.

The rule: on production, the home page's `document.body.innerText` contains
"Built on Urban Explorer: 303 cities". The old build says 258, so it fails.

Mutation proof: with "258" put back, the new test in
`src/app/__tests__/home.ssr.test.tsx` fails (1 failed, 4 passed); restored
from a copy, `cmp` identical, 5 passed.

No critic round: the screen's layout is unchanged (three digits for three
digits); the 390 px screenshot goes with the PR as a record.

**Cost:** None. One local SQLite read of about 300 rows per home render, the
same read the plan page already makes.

**Weakest part:** The home page now reads the atlas, so a missing
`data/atlas.sqlite` would break the landing page rather than only /plan. It
already ships with every build and /plan cannot work without it.
