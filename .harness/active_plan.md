<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `docs/u21-backlog`

## Ship rule (written before the work)

The operator, on U17 (2026-10-08): Oklahoma City from Amarillo on the way
to Austin is fine "if you have five days to get to Austin… maybe listed as
an option, but at the bottom of the list". Going west first (Albuquerque,
El Paso) is out: "go east to go west doesn't make a lot of sense".

Ships when:

- **Who sees detours.** A dated trip with at least one spare day is
  offered towns up to a detour ratio of 1.5. Spare days are the days
  between the dates, minus the days already used by stops, minus the days
  the rest of the drive needs. Oklahoma City is at 1.45 on Amarillo →
  Austin. Below a ratio of 1.25 a town counts as "on the way" (U17).
- **Where they go.** Those towns sit after every on-the-way town, in the
  title, the list and the map's naming order, and their row says "out of
  the way".
- **Unchanged.** An undated trip, or one with no spare day, sees exactly
  what U17 shows.
- **Never further back.** A town that doesn't bring you closer to the
  destination is still never offered, so going west first (Albuquerque, El
  Paso) never appears.

Also required:

- tests: the spare-day count, the tagging, the filter and order on the
  sheet, the row's words
- mutation proofs before the push
- a live run, dated with spare days vs undated, on Amarillo → Austin
- the critic's approval

**Cost:** $0. The free drive graph serves it. When the graph misses, the
paid fallback is capped at MAX_RADIAL_FAN_OUT either way, and it now sorts
on-the-way towns first so a detour never displaces one.

**Weakest part:** 1.5 is a second tuning number, and "one spare day" is a
guess at when a detour is welcome. Spare days are counted at the budget's
pace, so a trip whose stops already eat the slack loses its detours as
stops are added. That is intended, but it may surprise someone.

## Built

- **`progress.ts`:** `makesProgress` now takes a ratio. Added `MAX_DETOUR_RATIO_WITH_SLACK = 1.5` and `isOutOfTheWay` (above 1.25).
- **`radial.ts`:** fetches up to 1.5 and tags `outOfTheWay` with `tagOutOfTheWay`. The paid fallback's cap now sorts on-the-way towns first.
- **`recommend.ts`:**
  - `waypointCities` puts on-the-way towns first before the 10-town places cap. Without it, Oklahoma City could have taken a slot from a town on the way, which only reading the code revealed.
  - `cityContextFor` carries the tag.
- **`trip-state.ts`:** `spareDays` counts dates − days used − days still needed, with visits folded as the deadline does. It returns null when undated.
- **`detours.ts`:** `offeredTowns` (filter and order: out of the way last) and `onlyOffered` (the map's towns).
- **`PlanWorkspace.tsx`:** `roomForDetours = spareDays ≥ 1`. `effectiveWaypointFetch` is the offered set, so the title, days and map can't disagree.
- **`scoring.ts`:** the list sorts out-of-the-way towns last.
- **`RecommendationList.tsx`:** the row says "· out of the way".
- **The server action's contract is unchanged:** the tag rides on existing data.

## Mutation proofs, before push

All 17 are caught in the end:

- slack limit set to strict
- never tagged
- always offered
- not last in the title
- not last in the list
- stops use no days
- undated has slack
- sheet ignores slack
- map shows unoffered towns
- sheet skips `onlyOffered`
- row unmarked
- tag dropped in `recommend`
- cap not ordered
- …plus the reruns

Four **survived first** and were fixed:

| survivor | why it survived | fix |
|---|---|---|
| list order | the sheet already reorders | direct `buildRankedGroupsWith` test |
| map filter | the map is never rendered | pure `onlyOffered` + source guard |
| tag in recommend | no test reached it | pure `cityContextFor` test |
| sheet call site | — | source guard |

## Live (dev server, Amarillo → Austin, 4 h)

| dates | towns |
|---|---|
| none | Lubbock, Abilene, San Angelo |
| Oct 20–24 (3 spare) | Lubbock, Abilene, San Angelo, **Oklahoma City · out of the way**, last |
| Oct 20–21 (0 spare) | Lubbock, Abilene, San Angelo |

## Gates

tsc, eslint, vitest (777) and next build are all clean.

## Critic: APPROVE (round 1)

Two of its points were applied, each with a test and a caught mutation:

- **Wrapping.** "· out of the way" stays whole (`whitespace-nowrap`), so "way" never sits alone on a line.
- **Title count.** The title counts only towns on the way ("Lubbock, Abilene and 1 more fit today"). A detour is offered in the list, not counted as today's road.

Two went to the backlog:

- a line saying why a detour appeared ("you have 3 days to spare")
- "★ The pick" showing on a detour town's places
