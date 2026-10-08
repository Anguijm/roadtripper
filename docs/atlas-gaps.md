# Where the atlas has no towns: the upstream track

Scoped 2026-10-08, after U18. The operator chose "Both": say it plainly in
the app (U18, #115), and scope adding towns upstream as a separate track.
This is that scope. Nothing here is built yet.

## The gap, measured

`data/atlas.sqlite` has 191 cities inside the lower-48 box. On common
corridors I took the atlas towns within 8 % of the straight line and
measured the largest stretch between neighbours:

| corridor | length | largest stretch with no town |
|---|---|---|
| Kansas City → Denver | 897 km | **802 km** |
| Omaha → Denver | 784 km | **747 km** |
| Reno → Salt Lake City | 687 km | **687 km** |
| Las Vegas → Salt Lake City | 583 km | 550 km |
| Boise → Salt Lake City | 476 km | 476 km |
| Amarillo → Austin | 670 km | 399 km |
| Oklahoma City → Albuquerque | 830 km | 392 km |
| Salt Lake City → Denver | 596 km | 386 km |

A day at 4 h is roughly 350–400 km. On the top five, a whole day's drive
ends with no town that the app knows.

## Candidates, by corridor

None of these is in the registry (`configs/global_city_cache.json`) yet.

- **I-70 KC–Denver:** Topeka, Salina, Hays, Colby
- **I-80 Omaha–Denver:** Lincoln, Grand Island, Kearney, North Platte, Ogallala
- **I-80 Reno–SLC:** Winnemucca, Elko, Wendover
- **I-15 Vegas–SLC:** St. George, Cedar City
- **I-84 Boise–SLC:** Twin Falls
- **Amarillo–Austin:** Snyder, Sweetwater, Abilene, San Angelo, Brownwood
- **I-40 OKC–ABQ:** Elk City, Tucumcari, Santa Rosa
- **I-80 SLC–Denver:** Rock Springs, Rawlins, Laramie, Cheyenne

That is about 28 towns. Most would be `coverageTier: "town"` or `"village"`.
The pipeline already has village rules: no neighbourhoods (hallucination
risk), and a looser Phase C threshold.

## What it takes

1. In `city-atlas-service`, add the towns to the registry, then
   scrape → research → structure → validate → ingest into the shared
   `urbanexplorer` Firestore. **That database is Urban Explorer's too**,
   so the new towns appear in that app as well.
2. Gemini 2.5 Pro costs 3–4 calls per city, per that repo's CLAUDE.md, so
   about 100 calls for 28 towns. Scraping is rate-limited, at 30 s per city
   on Playwright.
3. In Roadtripper: `bun run atlas:export`, then rebuild the drive graph
   (`scripts/build-drive-graph.mjs`, OSM-calibrated, no Routes calls), then
   ship the new `atlas.sqlite`.

## Weakest part

Small towns have little written about them. Some villages may fail
validation, or come back with a thin place list. Even a town with zero
places still fixes the day's end ("near Hays"), because `cutEndName` only
needs a name and a position. Whether a town with no places should be
offered as a "town that fits" is a product call for when it happens.
