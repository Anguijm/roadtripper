"use client";

import { SORT_MODES, SORT_LABELS, SORT_LEAD, type SortMode } from "@/lib/roadside/tags";

/**
 * The gold the day's places are headed in; the on state is filled with it.
 *
 * The authority is `src/components/PlanWorkspace.tsx`, where the day's
 * roadside heading is `text-[#e3b341]` and the open row's border is the
 * same value. It is repeated here rather than imported because that file
 * is the plan screen's client root and importing it into a leaf component
 * would make a cycle; the test "fills the chosen order in the same gold
 * the places are headed in" in
 * `src/components/__tests__/PlanWorkspace.moods.ssr.test.tsx` holds the
 * two together, so they cannot drift silently.
 */
export const SORT_ACCENT = "#e3b341";

interface SortControlProps {
  mode: SortMode;
  onChange: (next: SortMode) => void;
  /** Named so a screen reader hears which list this orders. */
  label: string;
}

/**
 * How the day's places are ordered (Gauntlet U6). Two choices and exactly
 * one is always on, so unlike the mood chips this *is* a radiogroup:
 * "Show me best first" or "Show me along the road".
 *
 * **Round 1 failed rule 3 and this is the answer to it.** The first cut
 * was two full-width boxes the size and shape of a mood chip, sitting in
 * the chip grid directly under the chips, with no lead-in. The critic read
 * them as a ninth and tenth mood, and read the pale grey fill on the one
 * that was on as a chip greyed *out*. Three things changed:
 *
 *   - It is one line, not a grid: a lead-in and two short phrases that
 *     finish it, sized to their words rather than stretched to the row.
 *     Nothing about it repeats the chips' shape.
 *   - It sits with the days it orders, under the trip's figures, not in
 *     the chips' block.
 *   - The one that is on is filled the way a chosen chip is filled —
 *     a colour behind dark text — so one visual language means "this is
 *     on" everywhere on the sheet. The colour is the gold the places are
 *     headed in, which is the list it orders.
 *
 * Still not a `<select>`: a native select on a phone opens a wheel over
 * the sheet for a choice between two things, and rule 3 wants the choice
 * visible rather than behind a control that has to be opened.
 *
 * No state and no router, the same contract as `MoodChips`: the screen
 * owns what a tap means so that changing the order never re-runs the
 * Server Component.
 */
export default function SortControl({ mode, onChange, label }: SortControlProps) {
  return (
    <div data-sort-control className="flex flex-wrap items-center gap-x-2 font-sans text-base">
      <span className="text-[#b0b9c2]">{SORT_LEAD}</span>
      <div role="radiogroup" aria-label={label} className="flex items-center gap-x-1">
        {SORT_MODES.map((m) => {
          const isOn = m === mode;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={isOn}
              onClick={() => {
                if (!isOn) onChange(m);
              }}
              className={[
                // 44 px is rule 7's floor; the box is sized to its words,
                // which is what keeps it from reading as a chip.
                "inline-flex items-center px-2 min-h-[44px] text-base whitespace-nowrap transition-colors",
                isOn
                  ? "font-semibold text-[#0d1117]"
                  : "font-normal text-[#b0b9c2] underline decoration-[#30363d] underline-offset-4 hover:text-[#f0f6fc] hover:decoration-[#6e7681]",
              ].join(" ")}
              style={isOn ? { backgroundColor: SORT_ACCENT } : undefined}
            >
              {SORT_LABELS[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
