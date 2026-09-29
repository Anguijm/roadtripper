# U6: The eight moods, two at a time, and the order of the list

## Deliverables

1. The mood chips offer the **eight moods** from `src/lib/roadside/tags.ts`
   (Outdoors, History, Art, Museums, Oddities, Machines, Food, Sports),
   not the five personas.
2. **Two at a time.** A tap adds a mood; a tap on a chosen one removes it;
   choosing a third drops the one chosen longest ago, so a tap always does
   something visible. Nothing is ever silently refused.
3. A **sort control** beside the day's places: "Best first" or "Along the
   road".
4. The day's places worth pulling over for are ordered by the chosen moods
   through `rankFor`, using the tag scores the store now carries.
5. The towns' places follow the same chosen moods, through the waypoint
   types each mood maps to. Two moods map to no waypoint type
   (Machines, Sports); those fall back to the existing neutral order
   rather than emptying the list.

## Acceptance

- Screenshots at 390 px: the plan sheet with no mood chosen, with one, and
  with two; the sort control in both states. Every chip whole, no sideways
  scroll, 44 px targets.
- The chips are a multi-select group, not a radiogroup: a screen reader is
  told each chip is pressed or not, and that at most two may be on.
- SSR tests: the component with none, one and two chosen; a third tap
  dropping the oldest; the roadside list reordering under a mood; the sort
  control switching the order.
- Gate 1; the council on the code; cost $0.

## Constraints

- No change to what the app fetches (quality bar, hard stop 1). This
  changes what the screens order and say, not what they call.
- No change to the store's scores or the line (hard stop 2).
- The glossary stands: "I'm in the mood for", never "persona".
