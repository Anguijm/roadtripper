<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/matrix-many-origins`

## Goal

Finish the drive graph on the free ORS tier in one day. ORS counts requests
against its daily quota, not pairs, and allows 3,500 pairs per request. The
first build sent one request per city and emptied the day after 13 cities
(190 of 5,132 pairs). This branch packs many origins into each request: a
planner (`scripts/lib/matrix-plan.mjs`) groups origins that share neighbours
under the provider's cap, both providers gain `durationsMatrix(sources,
destinations)`, and the build loop stops on a 403 so a quota hit ends the run
instead of spamming failures. A dry run on 2026-09-27 planned the remaining
4,942 pairs as 5 ORS requests, reused the stored factor for zero calibration
requests, hit today's 403 on the first request and exited 2 with nothing lost.

## Ship rule

- Every pair the build still needs is promised by exactly one request, and no
  request exceeds the provider's cap. Tested on the real atlas.
- Zero ORS requests spent on calibration when resuming.
- A 403 stops the run; a non-quota 4xx splits the request by origin and retries.

**Cost:** $0. ORS is free; the Google path is unchanged in price and now paced
at 20 ms per element so a full 625-element request cannot trip the 3,000 a
minute quota.

**Weakest part:** ORS's 3,500 cap is documented as origins times destinations
("e.g. 50 x 50"). If it turns out to also cap total locations, a request of
40 origins and 90 destinations is refused with a 400, the splitter halves it by
origin until it fits, and in the worst case degrades to one origin per request,
which is the old shape and the old quota problem. The first real run at
22:30 Japan time on 2026-09-27 settles it; nothing can be proven before the
window reopens.

## Council round 1 on #49 (BLOCK, bugs 4), and what changed

- the pause now runs on every path that sent a request, including a rejected one that was re-queued as smaller ones
- `splitRequest` in matrix-plan.mjs carries forward only the pairs the refused request promised, never an origin's whole neighbour list; tested, including a trimmed promise that must not grow back
- city ids are cast to strings before `localeCompare`; tested with numeric ids
- both providers throw on a 200 whose body is not the expected grid or element array, instead of writing an all-null grid that reads as "everything unroutable"; tested for both
- both fetches carry a two-minute abort signal; tested that the signal is sent
- exit codes documented at the exit: 0 complete, 1 failed requests (a human looks), 2 quota closed (safe to rerun unattended, which the scratchpad waiter does)
- the 5-degree longitude band is named `BAND_DEGREES` and its trade-off is explained
- Pushed back on the CI item: no workflow or deploy step runs this script (grep of .github/workflows and apphosting.yaml finds nothing). The atlas is a committed file; a partial graph shows as an absent `drive_graph_built_at`, which the health page already reports. There is no exit code for CI to catch.
