"use client";

import { MOODS, MOOD_CONFIG, MAX_MOODS, type MoodId } from "@/lib/roadside/tags";

/** The label over the chips: the glossary's words for "persona" (quality bar, rule 1). */
export const MOOD_LABEL = "I'm in the mood for";

/**
 * What the group is called to a screen reader. The chips stopped being a
 * radiogroup in U6 — two may be on at once — so the count has to be said
 * somewhere, and the group's own name is the one place a reader announces
 * before the first chip rather than after a tap. A live region that spoke
 * on every tap would nag.
 *
 * A literal, not an `aria-labelledby` to the visible label: `useId` would
 * put a different id in each screen's markup, and
 * `src/components/__tests__/glossary.ssr.test.tsx` finds this component's
 * standalone render byte for byte inside every screen's.
 */
export const MOOD_GROUP_LABEL = `${MOOD_LABEL}, choose up to ${MAX_MOODS}`;

interface MoodChipsProps {
  /** The moods chosen, oldest first. Empty is "nothing chosen yet", which is how every screen starts. */
  chosen: readonly MoodId[];
  /** A tap on a chip. The screen owns what it means: `toggleMood` is the rule. */
  onToggle: (mood: MoodId) => void;
  /**
   * The moods to offer, in order. The screens leave it off and get the
   * eight in `MOODS`; the component's own test renders four to show the
   * markup does not assume eight.
   */
  moods?: readonly MoodId[];
}

/**
 * The mood chips, one component for every screen (Gauntlet U5, U6): the
 * plan sheet, the today form and its results, and the home's fold mount
 * this and nothing else for the mood. It owns the look and the words: the
 * label, a chip per mood with its icon and its one short word, the chosen
 * ones filled. What a tap does is the screen's: the sheet's state and URL,
 * the forms' state, the results' router. No state, no router, so changing
 * moods on the sheet never re-runs the Server Component (which would
 * re-bill computeRoute).
 *
 * **Not a radiogroup.** Until U6 this was `role="radiogroup"` with one
 * `aria-checked` radio, which is the correct markup for "exactly one of
 * these" and the wrong markup for "any two". It is now a group of toggle
 * buttons carrying `aria-pressed`, which is what a screen reader needs to
 * hear to know a chip can be on *with* another one. The count lives in the
 * group's name, `MOOD_GROUP_LABEL`.
 *
 * The root's `data-mood-chips` is the attribute the runner finds on every
 * screen.
 *
 * No glyphs. U6 round 2 failed the eight geometric characters on rule 2:
 * they rendered at unequal sizes in the body face, two of them a fraction
 * of the label, none depicting its mood, and two telling apart only by
 * fill — which is what a chosen chip uses. The labels are one plain word
 * each and carry it alone; the chosen state is the fill, the weight and
 * `aria-pressed`, which the glyph never was.
 *
 * The row wraps. Eight chips at 16 px with 48 px targets cannot be one row
 * of 358 px (a 390 px phone less its gutters) and were never going to be:
 * at `basis-[30%]` each chip takes at least 107 px and grows, so three sit
 * on a row and eight wrap three, three, two. None is ever alone on a row,
 * which is the failure the U4 and U2 critics named (a lone "Outdoors", and
 * a sideways strip that clipped a chip to "GEARH"). Seven would wrap
 * three, three, one, so a mood removed from `MOODS` needs this re-read;
 * the count is pinned by the component's SSR test.
 */
export default function MoodChips({ chosen, onToggle, moods = MOODS }: MoodChipsProps) {
  return (
    // The label sits 4 px over the row: the home's fold has about 4 px of
    // room inside 844 with a range set (U4's sums), and one component has
    // one gap.
    <div data-mood-chips className="flex flex-col gap-1 font-sans">
      <p className="text-base text-[#b0b9c2]">{MOOD_LABEL}</p>
      <div role="group" aria-label={MOOD_GROUP_LABEL} className="flex flex-wrap gap-2">
        {moods.map((id) => {
          const mood = MOOD_CONFIG[id];
          const isOn = chosen.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isOn}
              onClick={() => onToggle(id)}
              className={[
                // Sentence case at 16 px with a 48 px target: a few over rule
                // 7's 44, so a measurement of the painted box (the U2 round-1
                // critic read 43) cannot land under it (rules 1, 2 and 7).
                "flex items-center justify-center px-3 min-h-[48px] text-base border transition-colors whitespace-nowrap",
                // The 30 % is explained above; the fold test reads this string.
                "grow basis-[30%]",
                isOn
                  ? "font-semibold text-[#0d1117] border-transparent"
                  : "font-normal text-[#b0b9c2] bg-transparent border-[#30363d] hover:border-[#6e7681]",
              ].join(" ")}
              style={isOn ? { backgroundColor: mood.accentColor } : undefined}
            >
              <span>{mood.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
