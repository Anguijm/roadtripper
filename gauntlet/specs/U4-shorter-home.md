# U4: A shorter home

## Deliverables
1. The home screen asks three things above the fold on a phone: where from, where to,
   how many hours a day, then one large button, "Plan the trip". Dates and the mood
   fold under "More", open by default only when the URL already carries them.
2. One line under the title says what comes back, in a sentence with a real example
   from the store ("Places like the Cadillac Ranch and the Big Texan, along your road").
3. "Use where I am" sits inside the from field as a small control, not a second button.

## Acceptance
- A screenshot at 390 px shows the three fields and the button without scrolling, the
  button enabled once from and to are set, the example line present.
- The existing home SSR tests pass with the new markup; a new one asserts the fold is
  closed without date params and open with them.
- Gate 1; cost $0.

## Constraints
- No change to what the plan page receives; the URL contract stays.
