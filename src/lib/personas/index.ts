import { PersonaIdSchema, type PersonaConfig, type PersonaId } from "./types";

export type { PersonaId, PersonaConfig, RankedWaypoint } from "./types";
export { PersonaIdSchema } from "./types";

/**
 * Persona definitions come from Plans/partitioned-prancing-beacon.md
 * (Session 5 mapping table). Tweaking these is copy work — no code changes
 * required downstream because every consumer reads through `getPersona`.
 */
export const PERSONAS: Readonly<Record<PersonaId, PersonaConfig>> = {
  outdoorsman: {
    id: "outdoorsman",
    label: "Outdoorsman",
    glyph: "▲",
    primaryTypes: ["nature", "viewpoint"],
    secondaryTypes: ["landmark", "hidden_gem"],
    preferredVibes: ["FLUID_TROPIC", "BRUTAL_GRIT"],
    accentColor: "#3fb950",
  },
  foodie: {
    id: "foodie",
    label: "Foodie",
    glyph: "◆",
    primaryTypes: ["food", "drink"],
    secondaryTypes: ["shopping", "culture"],
    preferredVibes: ["DECAY_CHIC", "FLUID_TROPIC"],
    accentColor: "#d29922",
  },
  gearhead: {
    id: "gearhead",
    label: "Gearhead",
    glyph: "■",
    primaryTypes: ["landmark", "viewpoint"],
    secondaryTypes: ["hidden_gem", "nature"],
    preferredVibes: ["BRUTAL_GRIT", "NEON_GRID"],
    accentColor: "#f85149",
  },
  culture: {
    id: "culture",
    label: "Culture",
    glyph: "●",
    primaryTypes: ["culture", "landmark"],
    secondaryTypes: ["food", "hidden_gem"],
    preferredVibes: ["DECAY_CHIC", "NEON_GRID"],
    accentColor: "#bc8cff",
  },
  nerd: {
    id: "nerd",
    label: "Nerd",
    glyph: "◇",
    primaryTypes: ["hidden_gem", "culture"],
    secondaryTypes: ["shopping", "food"],
    preferredVibes: ["NEON_GRID", "DECAY_CHIC"],
    accentColor: "#00ffff",
  },
} as const;

export const DEFAULT_PERSONA_ID: PersonaId = "culture";

export const PERSONA_ORDER: readonly PersonaId[] = [
  "culture",
  "foodie",
  "nerd",
  "gearhead",
  "outdoorsman",
] as const;

/**
 * Validate an unknown value as a PersonaId. Falls back to
 * DEFAULT_PERSONA_ID on any parse failure — safe for URL params, form
 * values, and client events.
 */
export function parsePersonaId(id: unknown): PersonaId {
  const parsed = PersonaIdSchema.safeParse(id);
  return parsed.success ? parsed.data : DEFAULT_PERSONA_ID;
}

/** Look up a persona config from an unvalidated id. */
export const getPersona = (id: unknown): PersonaConfig =>
  PERSONAS[parsePersonaId(id)];
