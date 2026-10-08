<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u19-day-end-names`

## Ship rule (written before the work)

A day cut where the budget runs out is named "near X" only when an *atlas*
town is within 30 km. I measured it on 9,064 day ends: every trip between
atlas metros of 5–20 h, at 4, 6 and 8 h budgets. Only 13 % are named; the
other 87 % say "on the road". Adding curated towns barely moves that. Each
added town gains about 0.2 %, and the 26 now being ingested add under one
point. With GeoNames towns of 5,000 people or more, it is 72 %.

This unit ships when a cut day's end can be named from a public town list
(GeoNames `cities5000`, US, population ≥ 5,000, CC BY 4.0) as well as from
the atlas:

- **Naming:** Amarillo → Austin at 4 h, with no atlas town near the cut,
  reads "Day 1 · Amarillo to near <a real town on US-84> · 4 h".
- **Unchanged:** the towns that fit (still atlas only, with their places).
- **Precedence:** an atlas town within reach still wins over a list town at
  the same distance.

It also needs:

- tests: list towns name a cut; an atlas town wins a tie; a list town off
  the road (> 15 km) never names a cut; the server keeps only towns near the
  road
- mutation proofs before the push
- a live run
- the critic's approval
- an attribution line for GeoNames on the plan page

**Cost:** $0. The list is a static file read on the server. There are no API
calls, and no new data reaches the client beyond the few dozen towns near
the route.

**Weakest part:** a GeoNames "town" is a census place. Some are suburbs or
places with no services, so a day "near X" could name a place with nowhere
to sleep. Population ≥ 5,000 is the guard, and it is a guess. Straight-line
nearness also stands in for roads.

## Built

- `scripts/build-places.mjs` builds `src/lib/plan/places-us.json`: 7,110 US towns of 5,000 people or more from GeoNames `cities5000`. Neighbourhoods (PPLX) and abandoned or historical places are dropped.
- `src/lib/plan/places.ts` is server-only. `placesNearRoute` uses the corridor tiles' boxes, then an exact projection at 15 km (ON_ROAD_KM). `placesForRoute` is called once per render in `page.tsx`. A built client bundle has 0 copies of the list, and the server bundle has 1.
- In `days.ts`, a new input `places` names a cut only when the atlas leaves it "on the road", so an atlas town within reach always wins.
- The sheet shows "Town names from GeoNames" (CC BY 4.0) whenever the route has list towns.

## Mutation proofs, before push

| mutation | result |
|---|---|
| list never consulted | 2 red |
| list mixed with atlas, no precedence | 1 red |
| no off-road filter | 1 red |
| list not passed to the days | 1 red |
| no credit | 1 red |
| page not wired | 1 red (source guard) |
| exact distance ×4 | **survived**, then caught (1 red) by a new diagonal-road test. On a straight N–S test road the padded box already enforces 15 km, so the exact check was unreachable. |
| `out.has` skip removed | survives. This is an equivalent mutant: the Map is keyed by row, so a town cannot be listed twice. The skip only saves work. |

## Gates

tsc, eslint, vitest (753) and next build are all clean.

## Live (dev server, real routes)

| trip | before (atlas only) | after |
|---|---|---|
| Amarillo → Austin, 4 h | 4 h down the road from Amarillo | **Amarillo to near Sweetwater · 4 h** |
| Kansas City → Denver, 4 h | 4 h down the road | **Kansas City to near Hays · 4 h** |
| Chicago → Nashville, 4 h | (on the road) | **Chicago to near Seymour · 4 h** |
| all three, 6 h | on the road | on the road |

All three 6 h cases still say "on the road", and each one is legitimate. Chicago → Nashville's 6 h cut is 54 km past Elizabethtown and 46 km short of Bowling Green, both outside the 30 km "near". Kansas City → Denver's falls between towns under 5,000 people.

Widening `NEAR_CUT_KM` would make "near" untrue, so it is left alone.

## Critic: APPROVE (round 1)

The critic asked whether U18's "Wichita is the last town before your 4 h are up" was meant to disappear on Kansas City → Denver. It was. U18's line shows only when the day ends on open road (`endKind: "hours"`). This day now ends near Hays, so the line has nothing to explain, and Wichita is well off the I-70 road anyway. Its tests, which use a list with no towns, still cover the open-road case.

Noted, out of scope: the zoom controls clip "Kansas City" on the map, and "39 min away" doesn't say from where.
