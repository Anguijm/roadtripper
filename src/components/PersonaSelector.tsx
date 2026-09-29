"use client";

import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import type { PersonaId } from "@/lib/personas/types";

interface PersonaSelectorProps {
  /** Null is "nothing chosen yet": the home's fold, where a mood is optional (Gauntlet U4). */
  activePersonaId: PersonaId | null;
  onChange: (next: PersonaId) => void;
  /**
   * The chips share the row's width: each takes at least 30 % of it and
   * grows, so five wrap three then two at any row width (three are 90 % of
   * the row, four are 120 %), never one chip alone on a row (the home's
   * fold, Gauntlet U4: the round-1 critic saw "Outdoors" alone on a second
   * row). The plan and today screens leave it off and keep the natural row;
   * fitting five on one row there is U5's.
   *
   * Changing the 30 %: the split changes with it (25 % is four then one,
   * the one alone again). src/app/__tests__/home.fold.ssr.test.tsx reads
   * the literal `grow` and `basis-[30%]` on all five chips with the fold
   * open, so any other value fails it by string, and
   * src/app/__tests__/stylesheet.test.ts pins that the `.basis-[30%]` rule
   * is compiled; neither lays the row out, and the three-then-two on the
   * phone is the runner's screenshot at 390 by 844.
   */
  fill?: boolean;
}

/**
 * Dumb radiogroup — owns no state, no router. The parent lifts persona
 * into its own React state so swapping personas doesn't re-run the
 * Server Component (which would re-bill computeRoute).
 */
export default function PersonaSelector({
  activePersonaId,
  onChange,
  fill = false,
}: PersonaSelectorProps) {
  return (
    <div
      role="radiogroup"
      // The glossary's words for "persona" (quality bar, rule 1).
      aria-label="I'm in the mood for"
      // Wraps to a second row on a phone: five chips at 16 px do not fit
      // 390 px, and a strip that scrolled sideways clipped the last one to
      // "GEARH" (round-1 critic, rule 7: no horizontal scroll, nothing
      // truncated). The chip words are one short word each (Culture, Food,
      // Nerd, Gear, Outdoors; Gauntlet U2), from src/lib/personas/index.ts.
      className="flex flex-wrap gap-2 font-sans"
    >
      {PERSONA_ORDER.map((id) => {
        const persona = PERSONAS[id];
        const isActive = id === activePersonaId;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              if (id !== activePersonaId) onChange(id);
            }}
            className={[
              // Sentence case at 16 px with a 48 px target: a few over rule
              // 7's 44, so a measurement of the painted box (the round-1
              // critic read 43) cannot land under it (rules 1 and 7).
              "flex items-center gap-1.5 px-3 min-h-[48px] text-base border transition-colors whitespace-nowrap",
              // The 30 % is explained at the fill prop; the fold test reads this string.
              fill ? "grow basis-[30%] justify-center" : "",
              isActive
                ? "font-semibold text-[#0d1117] border-transparent"
                : "font-normal text-[#b0b9c2] bg-transparent border-[#30363d] hover:border-[#6e7681]",
            ].join(" ")}
            style={
              isActive ? { backgroundColor: persona.accentColor } : undefined
            }
          >
            <span aria-hidden className="text-base leading-none">
              {persona.glyph}
            </span>
            <span>{persona.label}</span>
          </button>
        );
      })}
    </div>
  );
}
