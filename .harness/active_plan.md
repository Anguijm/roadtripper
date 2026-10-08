<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u31-one-primary-per-screen`

## Ship rule (written before the work)

U30's critic: since U25 every town's "+ Stop here" is filled, so a
screen showing two towns has two equally loud primary actions (rule 3:
one obvious action per screen).

The thing to do next is to choose where today ends, and the natural
choice is the town nearest where the day's driving runs out.

Ships when:

- **One filled button.** On the day that holds the towns, only the town
  whose place along the road is nearest that day's end gets the filled
  "+ Stop here". Out-of-the-way towns (U21) are never it.
- **The rest.** Every other town's "+ Stop here" is an accent outline,
  U25 round 1's look: still clearly an action, not the primary.
- **No night to choose.** When the day ends at the destination, no
  button is filled.
- **Unchanged.** "✓ Added" and disabled stay as they are.

Also required:

- the choice is a pure, tested function
- an SSR test that exactly one button is filled, and the right one
- mutation proofs
- a screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** "nearest the day's end" is by distance along the road;
a town 10 km short of the cut is chosen over one 12 km past it, though a
person might prefer driving the extra few minutes.

## Built

- `days.ts`: `primaryTownId(day, shown, outOfTheWay)` is pure. It returns the shown, on-the-way town nearest `day.endKm`, or null when the day ends at a stop or at the destination.
- `RecommendationList.tsx`: a `primaryCityId` prop.
  - When it is undefined, every town's button is filled, as on a list that stands alone.
  - Otherwise only the primary town's Stop here is filled, and the others get an accent outline.
- `PlanWorkspace.tsx`: computes the primary town per day from `outOfTheWayIds`.

## Mutation proofs

All 5 are caught:

- detour towns can be primary
- the end day has a primary
- nearest the start instead of the end
- every button filled
- primary not passed

## Gates

tsc, eslint, vitest (798) and next build are clean.

## Live (Amarillo → Austin)

| budget | filled |
|---|---|
| 4 h, undated | Abilene only, nearest the "near Sweetwater" cut |
| 4 h, dated | Abilene only; Oklahoma City (out of the way) is outlined |
| 8 h (one day) | none |

## Critic, round 1: REJECT (evidence)

The screenshot showed only Abilene, the one button that stays filled, so it couldn't separate before from after. Round 2's shots scroll the sheet's own scroll box so that Lubbock's pinned header (outlined) and Abilene's card (filled) are on one screen, with the same script for before and after. No code changed.

## Critic, round 2: APPROVE

Rule 3 is met: Abilene's is the one filled action, and Lubbock's outline still reads as a button. Out of scope, noted: the sticky town header lets text from the card above peek through behind it.
