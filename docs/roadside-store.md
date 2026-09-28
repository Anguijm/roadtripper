# The roadside store

`data/roadside.sqlite` is every place in the United States a road-tripper might pull
over for, from OpenStreetMap, with a line from Wikidata or Wikipedia where one exists
and a score from the model, built once and looked up at plan time. It is data, not
code: gitignored, 58 MB, rebuilt from the steps below.

## Build

1. `curl -L -o data/osm/us-latest.osm.pbf https://download.geofabrik.de/north-america/us-latest.osm.pbf` (12 GB).
2. `uv venv .venv-osm --python 3.12 && uv pip install --python .venv-osm/bin/python osmium numpy`
3. `.venv-osm/bin/python scripts/osm/extract-roadside.py data/osm/us-latest.osm.pbf data/osm/us-roadside.ndjson` (about 15 minutes, half the machine's memory).
4. `bun run roadside:store -- --from=data/osm/us-roadside.ndjson` (seconds).
5. `bun run roadside:describe` (hours at polite pace; resumable; rerun after a crash).
6. In jev-lab: `.venv/bin/python bench/roadside_store_score.py --dry-run`, then without the flag (about six dollars, capped at ten from the ledger; resumable).

## Deploy

The app finds the file, in order, at `ROADSIDE_STORE_PATH`, at `data/roadside.sqlite`
in the working directory, or under `.next/standalone/data/` when the build traced it
in, the same three places the atlas is looked for. A missing file is not an error:
the plan page shows no roadside stops and logs one warning.

The file is not in git. Two ways to get it onto the deployed app, and which one
depends on where the app runs, which this repository does not decide:

- **A volume.** Copy the file to a mounted volume once per build and point
  `ROADSIDE_STORE_PATH` at it. The store changes only when rebuilt.
- **A build-time download.** Publish the file as a release asset or to object
  storage, download it into `data/` in the build step, and let
  `outputFileTracingIncludes` carry it like the atlas. 58 MB is inside a serverless
  function's limit but makes every cold start heavier; a volume is the better home.
