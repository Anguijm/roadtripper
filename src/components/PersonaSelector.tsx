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
      aria-label="Choose persona"
      className="flex gap-2 overflow-x-auto"
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
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-widest border transition-colors whitespace-nowrap",
              isActive
                ? "font-semibold text-[#0d1117] border-transparent"
                : "font-normal text-[#b0b9c2] bg-transparent border-[#30363d] hover:border-[#6e7681]",
            ].join(" ")}
            style={
              isActive ? { backgroundColor: persona.accentColor } : undefined
            }
          >
            <span aria-hidden className="text-sm leading-none">
              {persona.glyph}
            </span>
            <span>{persona.label}</span>
          </button>
        );
      })}
    </div>
  );
}
