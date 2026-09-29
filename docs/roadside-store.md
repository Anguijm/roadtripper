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

The site is Firebase App Hosting, built from `main` on every push, and the store is
not in git. So the build fetches it:

1. `bun run roadside:publish` takes a compact snapshot (`VACUUM INTO`), writes its
   SHA-256 to `data/roadside.sqlite.sha256`, and uploads it as the asset
   `roadside.sqlite` of the GitHub release tagged `roadside-store`, replacing the old
   one. Then commit the checksum file. In that order: publish, then commit.
2. `bun run build` runs `scripts/fetch-roadside-store.mjs` first: if `data/roadside.sqlite`
   is present and matches the checksum in git it does nothing; else it downloads the
   asset and keeps it only if the checksum matches. Anything that goes wrong leaves no
   file, prints why, and lets the build go on: the site deploys without roadside stops
   rather than not at all.
3. `outputFileTracingIncludes` in `next.config.ts` carries the file into the standalone
   output beside the atlas, and the store looks there.

The app finds the file, in order, at `ROADSIDE_STORE_PATH`, at `data/roadside.sqlite`
in the working directory, under `.next/standalone/data/`, or, in development only, when
the working directory is a linked git worktree (`git worktree add`), at
`data/roadside.sqlite` in the main checkout, so a feature worktree needs no copy of its
own (a production build never looks for a worktree: a deploy is not one). Which of those it
found is logged once per process in words (`[roadside] store: beside the atlas`), never
the path; a missing file logs one warning per process and the plan page shows no
roadside stops.
