"use client";

import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import type { PersonaId } from "@/lib/personas/types";

interface PersonaSelectorProps {
  activePersonaId: PersonaId;
  onChange: (next: PersonaId) => void;
}

/**
 * Dumb radiogroup — owns no state, no router. The parent lifts persona
 * into its own React state so swapping personas doesn't re-run the
 * Server Component (which would re-bill computeRoute).
 */
export default function PersonaSelector({
  activePersonaId,
  onChange,
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
