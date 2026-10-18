<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/status-sweep-2026-10-18`

## Ship rule (written before the work)

U48. The U46 critic: an OSM town's pick can lead its list with a bare or
plain line. city-atlas-service #63 gives a place the OSM listing could only
name the first sentence of its Wikipedia article, when the article is about
the same subject by name. Five places get one, among them Grand Island's
pick, the Stuhr Museum of the Prairie Pioneer.

First attempt rejected by the critic. Rawlins' Wyoming Frontier Prison
redirects to "Wyoming State Penitentiary", and that article's "historic and
current prison" read as a working prison a driver can't visit, worse than no
line. A redirect now counts only to the same subject ("Stuhr Museum of the
Prairie Pioneer" → "Stuhr Museum"). The prison is back to no line.

The rule: on production, Grand Island's lead row on Omaha → Denver carries a
`data-reason` that starts "The Stuhr Museum of the Prairie Pioneer is a
museum". The old build says "Museum on US-34.". Waypoint counts are unchanged.

**Cost:** None at run time. The atlas changes by six description strings.

**Weakest part:** Wikipedia's first sentence is written for an encyclopedia,
not a driver. It is longer than the listing's lines and may restate the town.
The critic judges whether it helps.
