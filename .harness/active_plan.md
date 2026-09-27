<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/roadside-tags-v2`

## Goal

Step 19's conclusions, made executable. Ten tiles of the Amarillo-to-Austin
corridor, read by eye: 514 named stops, of which 364 were `historic`
entries that are registered houses, churches and cemeteries, and 25
"towers" that are radio masts. Cadillac Ranch, Slug Bug Ranch, Ozymandias,
the Helium Monument and Buddy Holly's grave were all there; Palo Duro Canyon
was not, because a state park is none of the tags asked for; the Big Texan
was only its old building, because a restaurant is none of them either.
The second tag list fixes what the eye found, so the 100 labels in step 20
are spent on judgment calls, not on saying no to houses.

## Ship rule, written before the work

1. `historic` narrows to the things people pull over for: monument,
   memorial, castle, fort, ruins, archaeological site, ship, aircraft,
   locomotive, railway car, wreck, battlefield, landmark, milestone,
   boundary stone, cannon, tank, city gate, bridge. A registered house,
   church, district or "yes" is not pulled. A memorial that is a plaque or a
   stone is dropped in the parser: Texas has thousands of roadside markers,
   and a marker is not a stop.
2. `man_made=tower` is pulled only when `tower:type=observation`. Radio
   masts are not stops.
3. Parks join: `boundary=national_park`, `boundary=protected_area`,
   `leisure=nature_reserve`, as kind "park". Their centre may sit well off
   the road; that is noted, not solved.
4. Anything named with a `wikidata` tag joins as kind "notable" when no
   other kind claims it, except places, roads, railways, waterways,
   administrative boundaries and land use, which are not stops however
   notable. That is how the Big Texan, a restaurant, gets in.
5. The Overpass query carries `QUERY_VERSION`, and the pull script's
   progress key includes it, so tiles pulled under the old tags are not
   merged with tiles pulled under the new ones.
6. Every rule above is a test on `kindFromTags` or `fromOsmElement`, with
   the real tag sets from the corridor as fixtures.

**Cost:** $0.

**Weakest part:** The "notable" rule is only as good as OpenStreetMap's
wikidata tagging, which the first ten tiles put at 4% of named stops. It
will find the famous restaurant and miss the great unfamous one; the
persona-driven food picks stay Urban Explorer's job. And the parser drops
plaques by `memorial=plaque|stone`, which only catches markers tagged that
way; untagged ones survive into the labels, which is fine, because then
John's labels teach the Noul to drop them.
