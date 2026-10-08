<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u25-one-obvious-action`

## Ship rule (written before the work)

About five critics (U17, U18, U20, the atlas round, U24) said each town's
card has no single obvious action. "What's in Lubbock" and "+ Stop here"
are the same size, the same grey outline and the same weight (rule 3).
The thing to do next on the plan is to choose where the day ends:
"+ Stop here".

Ships when:

- **"+ Stop here" stands out** in the town's accent, as its border and its
  text, at medium weight. "✓ Added" stays filled in the accent, and a
  disabled "Stop here" stays dim with its reason beside it, as now.
- **"What's in" stays** the neutral grey outline.
- **Same size.** Both keep their size and 44 px height (rule 7), so a long
  town name still wraps inside "What's in".

Also required:

- an SSR test pins which button carries the accent
- mutation proofs
- a before/after screenshot
- the critic's approval

Not changed: the sort control's filled "best first", which two critics
called the loudest control. Its fill is U6's deliberate language for
"this one is on", the same as a chosen mood chip, and not an action.
Noted for the operator rather than undone.

**Cost:** $0.

**Weakest part:** the accent is the trip's route colour (purple by
default), so the emphasis is colour and weight, not size. A colour-blind
reader gets the weight alone.

## Built

In `RecommendationList.tsx`, an enabled "+ Stop here" now gets the `font-medium` class and the style `{ borderColor: accent, color: accent }`. "✓ Added" and the disabled state are unchanged. An SSR test pins the accent and weight on "Stop here", and pins that "What's in" has no inline style and keeps the neutral border.

## Mutation proofs

Both are caught: no accent, no weight.

## Gates

eslint, vitest (783) and next build are clean.

## Critic, round 1: REJECT

Fair. Rule 3 asks for the *largest* control, and an accent outline the same size as "What's in" still read as a matched pair. The accent purple also blends with the route, the dots and the list bars.

Round 2:

- "+ Stop here" is now the only filled control: accent background with dark text, `flex-[3]` against "What's in"'s `flex-[2]`, semibold, on the right.
- "✓ Added" becomes an accent outline, because the action is done.
- The SSR tests now pin the fill, the 3:2 split and the added outline. The old "both flex-1" regexes were updated.
- Mutations caught: outline again, same size, added filled.
- Gates: vitest (784) and next build are clean.

## Critic, round 2: APPROVE

It asked to see the "✓ Added" state before merging, so I added Winnemucca in headless Chrome, which made one live recompute. The screenshot shows "✓ Added" as an accent outline. The recompute worked: "Day 1 · Reno to Winnemucca · 2 h 26 min".

That run also exposed a separate wart, left for U26: after the stop, the title reads "Elko and Salt Lake City fit in day 2". The destination itself is offered as a town to stop in.
