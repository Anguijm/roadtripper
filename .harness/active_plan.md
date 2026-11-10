<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: data/toledo

## Ship rule (written before the work)

Toledo, Ohio. The roadtripper-car session found nothing between Ann Arbor
and Dayton on I-75, so a Detroit to Ohio drive could never stop there. John
picked the addition on 2026-11-10. Toledo is ingested upstream
(city-atlas-service `feat/toledo-oh`, the October path: every scraper, then
Gemini research with OpenStreetMap grounding). Here: `atlas:export` brings
it in, and the drive graph gains Toledo's pairs, so /today and /plan offer
it from Detroit.

## Done

- Export: 304 cities (was 303). Diffed against a copy taken first: Toledo
  is the only change, with 6 neighbourhoods and 17 places. No other row moved.
- Drive graph: 74 new pairs, 6,190 in all, coverage 100%. Google is the
  reference provider, so the stored ORS factor (1.1738) is untouched. Toledo
  to Detroit is 58 min, to Dayton 2 h 14.
- `--max-pairs=N` and `--plan-only` for `build-drive-graph.mjs`. Under
  Google's own 625 cap the planner packed Toledo's 74 pairs into 630 billed
  elements, because Google bills every origin x destination a request
  computes. A cap of 40 plans exactly 74. `requestCap` and `billedElements`
  in `scripts/lib/matrix-plan.mjs`, with tests on a synthetic top-up and on
  the real Toledo case.
- Two tests moved with the data. The U52 border test now starts from
  Buffalo: from Detroit, Toledo pushed Toronto out of the ten towns the
  answer carries. Toledo joins the OpenStreetMap towns allowed bare places.

## Mutation proofs

- `requestCap` ignoring the flag: 3 tests red. Restored, `cmp` clean.
- `billedElements` counting only wanted pairs: 2 red. Restored, `cmp` clean.
- No clamp to the provider's cap: 1 red. Restored, `cmp` clean.
- The border test from Buffalo, with each town's country blanked: red.
  Restored, `cmp` clean.

Cost: About 3 Gemini 2.5 Pro calls upstream (a few cents) and 74 Google
route-matrix elements (about $0.37). Nothing at run time.

Weakest part: Toledo has 17 places, under the pipeline's metro floor of 48
("degraded"). Eight are OpenStreetMap listings with no description, and two
Gemini details (the Botanical Garden's 60 acres, the zoo bridge "vantage
point") are in no source. It fixes the I-75 gap as a stop, but it is a
thinner Toledo than the city deserves.
