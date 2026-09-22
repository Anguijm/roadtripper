<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/atlas-sqlite`

## Goal

Step 4 of the revival plan. Move the Urban Explorer atlas out of a live
cross-project Firestore read and into a local SQLite file that ships with the
build, queried by geography.

## What the survey found (2026-09-23)

Measured against `urban-explorer-483600`, database `urbanexplorer`:

| Collection | Docs |
| --- | --- |
| `cities` | 279 (191 continental US) |
| `vibe_neighborhoods` | 2,182 |
| `vibe_waypoints` | 15,185 |
| `vibe_tasks` | 35,319 (Urban Explorer's game mechanic, not needed here) |

Western coverage is good: Amarillo, Winslow, Marfa, Terlingua, Taos, Jerome,
Bisbee, Deadwood, Truth or Consequences are all present. 62 cities sit west of
-100 longitude.

**This corrects an earlier finding.** The New York to Los Angeles plan showed
only Northeast candidates. That was not missing data. `radial.ts` keeps only the
nearest 50 cities by straight-line distance from the origin, so nothing beyond
the first hop can ever appear. Step 8 is the real fix for that.

## Why SQLite and not JSON

At today's 15,185 waypoints a JSON file scanned in memory would be fine. The
reason to build the SQLite layer now is stage 4: an OpenStreetMap corridor pull
along a 2,777 mile route is tens of thousands of nodes, and nationwide roadside
data is millions. That does not fit in a 512 MiB container as parsed JSON.
SQLite queries without loading everything, and an R-tree index makes a corridor
lookup a real spatial query rather than a full scan.

Driver: `better-sqlite3`, not `node:sqlite`. `node:sqlite` is built in and works
locally on Node 25, but App Hosting pins no runtime version and the module needs
Node 22.5+ (flagged until 23.4). `better-sqlite3` ships prebuilt binaries and
works on any supported Node.

## Change

1. `scripts/export-atlas.ts`: read Firestore once, write `data/atlas.sqlite`.
   Tables for cities, neighborhoods, waypoints. English locale only. Tasks
   skipped. Includes `description`, which the current Firestore projection drops
   entirely and which step 12 needs to render.
2. R-tree index on waypoint and city coordinates.
3. `src/lib/atlas/`: read layer replacing the Firestore path in `cities.ts` and
   `fetchWaypointsCore` in `recommend.ts`. Zod validation stays at the boundary.
4. `serverExternalPackages` entry so Next does not try to bundle the native module.
5. Firestore stays for saved trips and, later, the route cache.

## Risk surface

- Files touched: `cities.ts`, `recommend.ts`, new `src/lib/atlas/`, new export
  script, `next.config`, `package.json`.
- The cross-project read disappears, which removes the IAM fragility flagged
  earlier tonight.
- Rollback: revert the commit. Firestore path returns.

## Ship rule (declared before the work)

1. A New York to Los Angeles plan renders with the same candidate cities as the
   Firestore path returns today, verified by comparing both against the same input.
2. No runtime Firestore read against `urban-explorer-483600` remains anywhere in
   `src/`, proven by grep.
3. A bounding-box waypoint query over the full 15,185 rows returns in under 10 ms.
4. Lint, types and the full suite stay green.

**Cost:** One export reads about 17,646 Firestore documents, which at $0.06 per
100,000 reads is roughly $0.011. It runs manually or on a schedule, not per
request. It *removes* per-request reads: today every cache miss reads up to 300
waypoint documents, so at any real traffic this is a net saving. Runtime cost
after the change is $0.

**Weakest part:** The atlas becomes a point-in-time copy, so it can drift from
Urban Explorer and nothing will say so. I am trading a fragile live read for a
stale local one. The honest mitigation is a staleness check with the export date
surfaced somewhere visible, and I will not pretend a scheduled job alone solves
it, because a scheduled job failing silently is the same class of problem this
whole evening has been about.

## Result

All four ship rules met.

1. **Same candidates.** Compared the atlas against live Firestore: waypoints
   identical at 15,185/15,185; cities 277 vs 279. The two missing are
   `new-york` and `new-york-ny-usa`, duplicate New York records carrying no
   coordinates. The old path dropped them too, because `CitySchema` fails a
   city without lat/lng. `New York City`, the real record, is present.
   A built NY to LA plan renders locally in 1.3s with no error boundary.
2. **No cross-project read left.** `urbanExplorerDb` is gone from
   `firebaseAdmin.ts`. Deleted with it: `urban-explorer/firestore.ts` (dead),
   `city_fallback.json` (a standby for a network call that no longer happens),
   and `src/app/test/page.tsx`, a debug route that was live in production on a
   200 and enumerated Firestore collections.
3. **Corridor query speed.** 0.32 ms cold, 0.07 ms warm over all 15,185 rows,
   against a 10 ms bar. Asserted in the test suite, not just measured once.
4. **Green.** Lint, types, and 229 tests.

Also found: **every one of the 15,185 waypoints has a description**, the field
the old projection dropped. Step 12 renders it. And Amarillo is in the atlas
with 5 waypoints, none of which is the Big Texan or Cadillac Ranch, which is
the roadside gap measured rather than argued.

**Second weakness, beyond the one above:** `data/atlas.sqlite` is 7.3 MB and
committed. Every re-export writes another 7.3 MB blob into git history. That is
fine for now and will not be fine at a weekly refresh. Git LFS or a build-time
export is the answer when it starts hurting; I am not doing it pre-emptively,
but it should not come as a surprise later.

## CI caught what Gate 1 could not

`validate` failed on the first push while everything passed locally. Two causes,
both worth more than the fix:

1. **CI ran Node 20; production builds on `google-22-full`, which is Node 22.**
   CI has been validating against a different Node major than the app ships on,
   independent of this change. Fixed by moving CI to 22 and pinning
   `engines.node: ">=22"` so it cannot drift silently again.
2. **Two lockfiles, one source of truth.** `bun add` updated `bun.lock` and
   `package.json`; CI installs with `npm ci` against `package-lock.json`, which
   was left stale. Synced.

Gate 1 could not have caught either, because it runs on this laptop where the
native module was already built by bun and Node is 25. The general lesson:
a local gate cannot verify the environment it is not running in.

## Council round 2 (CONDITIONAL), and what changed

Three required inline explanations, all added: the 256 MB `mmap_size` (an
address-space reservation, not an allocation, so it does not fight the 512 MiB
container limit), why inactive waypoints are filtered at export rather than at
query time, and that `UE_PROJECT` / `UE_DB` are overridable for staging drift
checks.

Two deferred items taken because they were not cosmetic:

- **Atomic export.** Writes to `atlas.sqlite.tmp` and `rename(2)`s over the
  target, so a crashed or concurrent export cannot leave a half-written atlas
  where a reader will open it.
- **Staleness is now sayable.** `atlasStaleness()` and `warnIfAtlasStale()`;
  `/health` renders the export date and age, and the first open logs a warning
  past 30 days. This directly addresses the weakness declared above. It does not
  *solve* it, since nothing pages on it, but it stops the snapshot from being
  silently ancient.

Not taken: prepared-statement caching. The query being optimised measures
0.07 ms warm, so the cache would cost complexity to save nothing measurable.

## Council round 3 (BLOCK), and what changed

Seven required remediations, all applied. The substantive one:

**R-tree desync on a REPLACE.** `insert or replace into waypoints` assigns a new
rowid on conflict, while the R-tree row was already written against the old one.
I checked the current file first: 15,185 waypoints, 15,185 R-tree rows, 0
orphans, so nothing is wrong today, because Firestore document ids are unique
and no conflict occurs. The council is still right that the pattern fails
*silently* if that ever changes: corridor queries would return the wrong places
with no error anywhere. Now deduped by id before the transaction, and the export
verifies the join and refuses to publish the file if it does not hold. Taking
the related deferred item was the real fix; the dedupe alone would not have
caught a desync from any other cause.

Also: enum narrowing with a logged fallback on `type` and `tier` reads, a bound
parameter ceiling asserted next to the query, a try/catch in `allCities` so a
locked file degrades to "no candidates" rather than an error page, and comments
on the 30 day staleness threshold and the 250 city test floor.

On EXDEV: `TMP` is always `${OUT}.tmp`, same directory and therefore same
filesystem, so a cross-device rename is not reachable by construction. Handled
anyway, with a comment saying so, because a future `ATLAS_OUT` could change it
and the failure would otherwise be a lost export.
