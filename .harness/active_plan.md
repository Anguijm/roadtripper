<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/round-4-close`

## Ship rule (written before the export)

The operator approved the spend ("Go, all 28", 2026-10-08), scoped in
`docs/atlas-gaps.md`. This ships when:

- the atlas carries the corridor towns that passed city-atlas-service's
  pipeline (#61, merged) with places that are actually in those towns
- the drive graph covers every new town's pairs
- U20 (label collisions) is merged first, since the new towns crowd the
  map
- a live run shows the towns offered on the long corridors
- the critic approves

**Cost:** about $1–2 of Gemini upstream (already spent). $0 here: the
export reads Firestore, and the drive graph's 586 new pairs came from the
free ORS matrix (calibration reused).

**Weakest part:** 11 of the 27 towns didn't make it. Ten were too thin for
the pipeline's floor of 6 places. Sweetwater was ingested with Miami
places, caught by the council, deleted, and is now guarded by a spatial
check. Those towns still name day ends via U19. Most of the 16 came back
`degraded`, meaning 5–10 places where a town's target is 24.

## What's in it

- 16 towns: abilene-tx, cedar-city-ut, cheyenne-wy, elko-nv, hays-ks,
  kearney-ne, laramie-wy, lincoln-ne, north-platte-ne, salina-ks,
  san-angelo-tx, st-george-ut, topeka-ks, tucumcari-nm, twin-falls-id,
  winnemucca-nv.
- 293 cities in all.
- The drive graph has 5,672 pairs at 100 % coverage. That is 586 fetched,
  minus the 46 Sweetwater pairs dropped with it.
- All places in all 16 towns lie within 10 km of the town's point, checked
  upstream.

## Live (dev server, 4 h a day)

| trip | prod towns that fit | new |
|---|---|---|
| Reno → Salt Lake City | none | Elko, Winnemucca |
| Las Vegas → Salt Lake City | none | St. George, Cedar City |
| Kansas City → Denver | Lawrence, Omaha, Wichita | + Hays, Salina, Topeka, Lincoln |
| Amarillo → Austin | Lubbock | + Abilene, San Angelo |

## What went wrong, kept

- **Sweetwater, TX was ingested with five Miami places** (Sweetwater, FL).
  The Infatuation scraper fetched the wrong town, and Gemini's audit,
  which checks names, passed it. The council on #61 caught it. Fixed by
  deleting its 49 Firestore docs (re-checked empty) and adding a Phase C
  check that rejects any place more than 3 radii (at least 30 km) from the
  registry point. That check fails only the bad Sweetwater output of every
  output on disk.
- **The first export of this atlas included it.** It was rebuilt after
  the cleanup. The earlier local commit was never pushed.
- **The batch runner logged every failure as "Exit code 1".** It now keeps
  the tail of stdout, with paths redacted.

## Critic: APPROVE (round 1)

The critic found Winnemucca and Elko real, and correctly placed along I-80. It judged their places specific and accurate (the 1900 Butch Cassidy bank robbery, the Buckaroo Hall of Fame).

Its one data query was an unlabelled dot south-west of Abilene. That is San Angelo, which really is off the road, south-west of Abilene. Its name is withheld by U20 because the label touches Sweetwater's dot by 0.5 px. It is not Sweetwater: Sweetwater is not in the atlas.

It also flagged Elko as borderline for a 4 h day. That comes from the fit rule's tolerance, not from this data.
