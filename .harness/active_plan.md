<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u43-see-it-on-the-map-looks-tappable`

## Ship rule (written before the work)

About six critics (U31 to U42): "See it on the map" under each day's
heading is low-contrast grey and doesn't look tappable. The whole heading
is already a 44 px button (U3), so only its look misleads.

Ships when the line reads as a link, in the sheet's own link style (the
sort control's "along the road"):

- **Underlined.** An underline in #6e7681, offset 4.
- **Brighter.** #b0b9c2 instead of #8b949e.
- **Unchanged.** The words, the button and its 44 px stay as they are,
  and "See the whole trip" gets the same style.

Also required:

- an SSR test pins the style
- a mutation proof
- a screenshot
- the critic's approval

**Cost:** $0.

**Weakest part:** the underline is on the hint, while the whole heading
is the tap target. A tap on the heading text works too, but only the
hint looks like it does.

## Built

In `PlanWorkspace.tsx`, the hint is now `<span data-day-map-hint class="block text-[#b0b9c2]">` wrapping an underlined span (`decoration-[#6e7681] underline-offset-4`). An SSR pin checks it, and the mutation that drops the underline is caught.

## Gates

tsc, eslint, vitest (808) and next build are clean.

## Critic: APPROVE (round 1)

The hint reads as tappable, and nothing regressed. Next, noted: the lead place has no kind line and a different indent from the other places.
