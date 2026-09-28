<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/roadside-on-map`

## Goal

Step 22: the survivors on the map, visibly distinct from city stops. The
bench passed its bar (provisionally) on the Amarillo to Austin corridor,
so the stops the model says are worth pulling over for go on the plan
page: markers of their own shape and colour on the map, and a list under
the recommendations with one line to read and a map link. No model call
at plan time; the survivors are a committed file per pulled corridor.

## Ship rule, written before the work

1. `roadside:survivors` builds `data/roadside/<corridor>.json` from the
   pulled corridor, the bench's scores and the descriptions: every stop at
   or above the line, with name, position, kind, probability, one line to
   read (the encyclopedia's opening, else its short description, else what
   the mapper wrote) and the Wikipedia link. The line is 0.45, one notch
   under the sheet's 0.5, because the bench's three near misses at 0.49
   were all approved. 214 of 1,074 on the first corridor.
2. At plan time the page decodes its route and keeps the survivors within
   10 km of the road, in road order with the distance along. Pure filter,
   the corridor code's own `withinCorridor`; every file in `data/roadside`
   is read once per process; any failure is an empty list and one warning,
   never a broken plan page.
3. On the map the survivors are diamonds in amber, a different shape and
   colour from the round city candidates and the numbered square trip
   stops, titled with the name. In the sidebar, under the recommendations,
   a collapsed "Roadside stops along the way" with the count, opening to
   the list: name as a map link, kind, km along, the line to read. A route
   with no pulled corridor near it shows nothing and says nothing.
4. Tested: the builder applies the line and the about order; the filter
   keeps a stop 5 km off the road and drops one 15 km off, sorts by
   distance along, and passes nothing for a route of one point; the
   workspace renders the section with the fixture's stops and no section
   without them. The marker effect is client-only and covered by the icon
   helper's test, not by a browser.

**Cost:** $0 at plan time. The survivors were scored once for two cents.

**Weakest part:** One corridor exists, so only a route down that road shows
anything; the app cannot yet pull and score a corridor for a new route,
which is the step after this. 214 markers is dense at the Austin end,
where a hundred murals sit inside a few kilometres; the map will need
clustering or a zoom rule before that end is readable, and this PR does
not attempt it.

## Gate 1 proofs

- Rule 1: with the line removed from `buildSurvivors`, "keeps every scored stop at or above the line…" fails. Restored, `cmp` clean.
- Rule 2: with `withinCorridor` removed from `roadsideAlong`, "keeps a stop 5 km off the road and drops one 15 km off" fails. Restored, `cmp` clean.
- Rule 3 and 4: the workspace SSR test renders the section with two fixture stops (map link, kind, km, the line to read, one `data-roadside-about` for the one stop that has a line) and nothing without them; the diamond helper has the diamond path and the amber and no circle or rect.
- The build: 214 survivors of 1,074 at 0.45; 139 have a line to read. Against the straight line Amarillo to Austin with the 10 km buffer (a lower bound, since the road bends), 159 of them are along the route.
- 453 tests, 9 new; lint and types clean.
