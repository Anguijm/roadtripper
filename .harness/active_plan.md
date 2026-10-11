<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `data/osm-towns`

## Ship rule (written before the work)

U45. Ten towns the pipeline used to reject as too thin are now in the atlas,
grounded on OpenStreetMap (city-atlas-service #62): Grand Island, Colby,
Ogallala, West Wendover, Snyder, Sweetwater, Brownwood, Santa Rosa, Rock
Springs and Rawlins. The atlas goes from 293 to 303 cities, and the drive graph
gains 444 pairs (6,116, complete).

The rule: on production, routes along those corridors offer the new towns as
towns that fit, with their places. Each check reads a rendered
`data-town-name` that the old build cannot show, because the town was not in
its atlas. Sweetwater's places are in Texas, not Florida (spatial check). No
existing town disappears from the routes checked.

**Cost:** None at run time. The atlas grows by about 0.1 MB, and the drive graph
was built from OSM-calibrated ORS (444 pairs, no Routes calls).

**Weakest part:** OSM-only places carry a plain description ("Cafe on North
Walnut Street.") or none. A town's lead row may have no reason line under it.
The list already handles a missing description. That it reads acceptably is
judged on the screenshot.
