<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/drive-time-graph`
Stacked on `feat/remove-clerk`, which is stacked on `feat/atlas-sqlite`.

## Goal

Stop paying a live API to recompute drive times that barely change, and make
candidate generation work with no signal.

Today every plan load calls `computeRouteMatrix` with up to 50 destinations:
$0.25 a load, a network round trip in the path between opening the app and
seeing where you can go, and nothing at all when there is no bar of service.

Drive time between two cities is a staleness-tolerant dataset. It belongs in
the atlas next to the places.

## Change

1. `city_drive_times` table in the atlas: `from_city_id`, `to_city_id`,
   `minutes`, `meters`, plus provenance.
2. `scripts/build-drive-graph.mjs`: for each city, the cities within a day's
   drive by haversine, resolved through a routing provider in batches.
3. Provider is pluggable. OpenRouteService is the default because it is free
   and the whole job fits inside its daily allowance. Google Routes is the
   alternate.
4. Calibration, not blind trust. OSM-derived times measured 18.3% slower than
   Google across 20 spread pairs, consistently in one direction. The build
   samples pairs against Google, derives the factor, stores it with the data,
   and applies it. It is re-derived on every rebuild rather than hardcoded.
5. `radial.ts` reads the graph instead of calling the matrix API.

## Risk surface

- Files: new script, new table, `src/lib/atlas/queries.ts`, `radial.ts`.
- If a pair is missing from the graph, the city simply is not offered. That is
  a silent omission, so the build reports coverage and the read layer can say
  when it falls through.
- Rollback: revert. The Routes API path is one commit away.

## Ship rule (declared before the work)

1. The graph covers every continental US city pair within a day's drive, and
   the build prints coverage rather than leaving it to be assumed.
2. A calibrated lookup lands within 10% of Google on a held-out sample that was
   not used to derive the calibration factor.
3. `findCitiesInRadius` makes zero Routes API calls on a cache-cold request,
   proven by counting calls in a test.
4. Lint, types, and the full suite green.

**Cost:** $0 for the graph itself via OpenRouteService, whose free allowance is
2,500 requests a day against the ~191 this needs. Calibration and the held-out
check use Google at about $0.005 a pair, so under $0.50 for a generous sample.
Against that it removes a $0.25 call from every cache-cold plan load, which is
most of them in real use because each morning starts somewhere new.

## Result

The pipeline is built and proven; the dataset is not populated.

| Ship rule | State |
| --- | --- |
| 1. Coverage reported, not assumed | **Built.** The script prints pairs written over pairs planned, plus unroutable and failed counts. Verified at 30/30 on a two-city run. |
| 2. Calibrated lookup within 10% on a held-out sample | **Built, unexercised.** The build derives the factor from one sample, tests it on a disjoint one, and *refuses to publish* if the held-out mean exceeds 10%. It has not run, because the provider is unreachable. |
| 3. Zero Routes API calls on a cache-cold request | **Met and counted.** `fetch` is replaced by a spy that throws; a graph-covered request makes zero calls, and an uncoverable origin is asserted to fall back rather than silently return nothing. |
| 4. Lint, types, suite green | **Met.** 264 tests, 0 lint errors. |

A two-city build against Google exercised every path end to end: 30 pairs,
100% coverage, 0 unroutable, 0 failed requests, about 15 cents.

## What blocked the full run

**IPv4 egress from this machine is dead.** `1.1.1.1:443` and `8.8.8.8:443` both
time out; only hosts with real IPv6 answer. OpenRouteService and GitHub resolve
to IPv4 only (their AAAA records are `::ffff:` synthetics), so both are
unreachable. Google and Overpass have real IPv6 and work fine, which is why the
Google-backed test run succeeded.

Consequences: the full graph is unbuilt and nothing can be pushed. Both are one
command each once the network returns.

**Cost:** $0 for the graph via OpenRouteService once reachable; about $0.15
spent proving the pipeline against Google. I did not spend the $25.66 to build
the whole thing through Google instead, because free was the point and the
blocker is temporary.

**Weakest part:** The graph in the shipped atlas holds **30 rows covering 2
cities**. Every test above passes against that, which is exactly the shape of
problem worth naming: a suite that is green on a near-empty dataset proves the
code and says nothing about the data. The read layer distinguishes "no rows"
from "nothing in range" and falls back rather than returning silence, so the app
degrades correctly rather than going quiet. But until the real build runs,
"candidate generation works offline" is true of two cities and of nowhere else.

Second, still untested: a single global calibration factor assumes OSM's error
is uniform, and the 20-pair sample suggested it is not (Salt Lake City to Park
City was 14.2% off, a short mountain hop). The held-out gate will fail the build
rather than ship a quietly optimistic graph, which is the right behaviour, but
whether it passes at all is unknown.

---

## Step 15 also landed here: deduplicating the atlas

Done on this branch rather than its own, because the network outage blocked the
drive-graph run and this needed no network.

**The rule is measured, not guessed.** Across the 1,056 same-name groups in
continental US cities, maximum separation inside a group is 0.27 km at the
median and 1.09 km at p90; 1,017 of 1,056 fall entirely within 2 km and only 4
spread past 5 km. So the pipeline emits one real place several times with
jittered coordinates and separately written descriptions, rather than recording
genuine branches. Same city plus same name plus within 2 km is one place; the
richest row wins (trending score, then description length, then id, so a
re-export is deterministic).

Result: **1,795 collapsed, 15,185 to 13,390 waypoints**, file 7.3 MB to 6.5 MB.
US duplication was 13.9%, worse than the 10.5% outside it. Dallas alone had 34.

## Three bugs found doing it, two of them mine and serious

1. **The atomic rename was destroying the drive graph.** Renaming a freshly
   built database over the old one discards everything the export does not
   itself write. A graph that takes hours to build was being wiped by a routine
   refresh of the places, with no error and no output. The export now reads the
   graph out first and writes it back, dropping pairs whose city no longer
   exists.
2. **The rename stranded the old `-wal` and `-shm` files.** The next process to
   open the atlas read-write tried to replay a WAL belonging to a different
   database and failed with "disk image is malformed" — while `integrity_check`
   on the file said ok. Genuinely confusing. They are removed before the rename.
3. **My clustering was order-dependent.** First-match-wins left an item in one
   cluster while it was still within 2 km of another, leaving exactly one
   colocated duplicate. Only caught because a test counted them rather than
   trusting the export's own tally. Now single-linkage with full merging.

I also found that several earlier edits to this script had silently not applied,
because I was doing string replacements without checking the anchors still
matched. The council-required EXDEV handler and the id-dedupe guard were both
absent from the file while I believed they were there. Every edit in this pass
asserts its own presence afterwards.

**Cost:** $0. Firestore is IPv6-reachable so the re-export worked; about $0.15
more on Google proving the graph carry-over end to end.

**Weakest part:** The invariant tests assert properties of the shipped file, so
they will pass on any atlas that happens to satisfy them, including one built by
a future export that is wrong in a new way. They caught the clustering bug only
because that bug happened to violate a property I had thought to check. Nothing
here tests the export *process*, and the two serious bugs above were both in the
process rather than the output.

---

## The real build (2026-09-26), and what the free tier actually allows

Network returned on the 26th. The full build through OpenRouteService got 13
cities in, then every remaining request returned `403 Quota exceeded`. The
matrix endpoint has its own daily quota, well below the 2,500 general requests
I had counted on, and a 2-location probe afterwards was refused outright. My
earlier claim that "191 requests fits in the daily allowance" was wrong.

**What did land is the part that mattered most.** Calibration ran to completion
before the wall: factor **1.1738**, held-out mean error **4.31%** on 12 pairs it
did not learn from, inside the 10% gate. That number is stored with the graph.

Coverage: **190 of 5,132 pairs (3.7%)**, 14 of 191 origins.

## Resume is now the default

A build must survive being run across days or finished by another provider.
Two rules, both enforced in the script:

1. Never fetch a pair the table already holds.
2. Never recalibrate on resume. Every stored minute was divided by one factor;
   a second calibration would make the graph internally inconsistent.

Plus a guard found by reasoning before running: the factor is provider-specific.
A resume through Google (the reference) applies no factor, and a resume through
any *other* provider than the one that derived the factor is refused. Proven
end to end for $0.09: Google filled exactly one missing city while the 13
ORS-built ones planned zero and the stored calibration stayed untouched.

**Cost so far:** about $0.25 total on Google across the pipeline test, the
carry-over proof, and the resume proof. $0 on ORS.

**Weakest part (updated):** The table records no per-row provenance. 172 rows
are ORS times divided by 1.1738 and 18 are Google's own; both are meant to be
Google-equivalent, which is what makes them safe to mix, but nothing in the
data lets anyone audit that later. A `provider` column is cheap and I did not
add it, because it touches the export's carry-over and I wanted this commit to
be the resume logic and nothing else. It should be the next change to the table.

Still true from before: 3.7% coverage means the offline claim holds for 14
cities. The read layer falls back correctly for the other 177, at $0.25 a call.

## Council round 1 on #45 (BLOCK), and what changed

- item 1: `import "server-only"` was already the first line of queries.ts; the council finding was false. Left as is.
- item 2: haversineKm clamped in queries.ts
- item 4: candidatesFromGraph returns a discriminated union
- item 5: factor guarded; item 6 (build): CALIBRATION_PAIRS/HELDOUT_PAIRS explained; haversine clamped
- item 6 (providers): pause constants explained; wrong 2,500/day claim corrected
- item 3: export documented as build-time only, never against a live server's file
