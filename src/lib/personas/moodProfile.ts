import type { WaypointType } from "@/lib/urban-explorer/types";
import { MOODS, MOOD_CONFIG, type MoodId } from "@/lib/roadside/tags";
import type { PersonaConfig } from "./types";
import { DEFAULT_PERSONA_ID, PERSONAS } from "./index";

/**
 * What each mood means for a town's places.
 *
 * The roadside stops are ranked from real tag scores: a model read every
 * one of them against the eighteen questions and the store holds the
 * answers. The towns' places have none of that. They come from the
 * urban-explorer atlas with one of nine coarse types, so a mood can only
 * be mapped onto those types by hand.
 *
 * The operator ruled on 2026-09-30 that the moods should be the one
 * control on the screen and should be mapped where they fit, knowing what
 * does not fit:
 *
 *   - Six moods map cleanly enough to be worth having.
 *   - `history`, `art` and `museums` all land on `culture` and `landmark`,
 *     because the atlas has no finer word. Choosing between those three
 *     will order a town's places identically. That is a real loss and it
 *     is accepted rather than hidden behind a difference that is not
 *     there.
 *   - `machines` and `sports` map to nothing at all. The atlas has no type
 *     for a locomotive or a ballpark.
 *
 * An empty mapping is not an empty list. `typeWeight` in
 * `src/lib/routing/scoring.ts` returns 0.2 for the "other" tier — a floor
 * written there so non-matching places still appear, with its own note
 * saying a floor of 0 would make them score 0 and silently disappear — so
 * every place scores the same multiplier and the town's list falls back to
 * trending score within detour, which is the order it had before any mood
 * was chosen. The roadside stops, which are what Machines and Sports are
 * actually about, still rank on their tag scores.
 */
export const MOOD_WAYPOINTS: Readonly<
  Record<MoodId, { primary: readonly WaypointType[]; secondary: readonly WaypointType[] }>
> = {
  outdoors: { primary: ["nature", "viewpoint"], secondary: ["landmark", "hidden_gem"] },
  history: { primary: ["landmark", "culture"], secondary: ["hidden_gem"] },
  art: { primary: ["culture"], secondary: ["landmark", "hidden_gem"] },
  museums: { primary: ["culture", "landmark"], secondary: ["hidden_gem"] },
  oddities: { primary: ["hidden_gem"], secondary: ["landmark", "culture"] },
  machines: { primary: [], secondary: [] },
  food: { primary: ["food", "drink"], secondary: ["shopping", "culture"] },
  sports: { primary: [], secondary: [] },
} as const;

/** The moods that order a town's places at all; the rest leave it in its neutral order. */
export const MOODS_THAT_MOVE_TOWNS: readonly MoodId[] = MOODS.filter(
  (m) => MOOD_WAYPOINTS[m].primary.length > 0
);

/**
 * A scoring profile for the chosen moods, in the shape `scoreWaypoint`
 * already takes.
 *
 * Two moods union their types, and a type that is primary for either is
 * primary for the pair: asking for Food and Outdoors should put a diner
 * and a canyon both near the top, not average them into the middle. A type
 * that is only ever secondary stays secondary.
 *
 * With nothing chosen the profile is the default persona's, so the screen
 * at rest looks exactly as it did before this component — the chips start
 * empty and the towns' places must not reshuffle merely because the moods
 * arrived.
 *
 * `preferredVibes` is deliberately empty for any chosen mood. The vibe
 * bonus was tuned per persona against four vibe classes that mean nothing
 * in the moods' vocabulary, and inventing a mapping for it would be a
 * second guess stacked on the first. Its absence costs at most a 1.2x
 * nudge and keeps this mapping to one honest claim.
 */
export function waypointProfileForMoods(chosen: readonly MoodId[]): PersonaConfig {
  if (chosen.length === 0) return PERSONAS[DEFAULT_PERSONA_ID];
  const primary = new Set<WaypointType>();
  const secondary = new Set<WaypointType>();
  for (const mood of chosen) {
    const m = MOOD_WAYPOINTS[mood];
    if (!m) continue;
    for (const t of m.primary) primary.add(t);
    for (const t of m.secondary) secondary.add(t);
  }
  // Primary wins over secondary when the two moods disagree about a type.
  for (const t of primary) secondary.delete(t);
  return {
    id: DEFAULT_PERSONA_ID,
    label: "",
    glyph: "",
    primaryTypes: [...primary],
    secondaryTypes: [...secondary],
    preferredVibes: [],
    // The first mood chosen, which is what paints the route line on the
    // plan sheet. First and not last, so adding a second mood never
    // repaints the road the first one painted. This returned the default
    // persona's colour until council round 4 on #94, which meant the line
    // never changed at all while a comment at the use site said it did.
    accentColor: MOOD_CONFIG[chosen[0]].accentColor,
  };
}


/**
 * The mood a link written before U6 was asking for.
 *
 * A trip saved before U6 carries a `personaId`, and `TripCard` still puts
 * it in the resume link as `?persona=`. The plan page stopped reading that
 * parameter, so reopening such a trip quietly lost what the person had
 * chosen. This reads it once, at the URL, and nowhere else.
 *
 * **Three of these are judgement, not derivation, and saying so is the
 * point.** Outdoors and Food are the same idea under two names. The other
 * three are not: "Culture" used the atlas types `culture` and `landmark`,
 * which History *and* Museums both map to exactly, so the tie is broken by
 * the word a person read on the chip; "Nerd" used `hidden_gem` and
 * `culture`, which is Oddities and Art between them, and Museums is what
 * the label meant to most people; "Gear" used `landmark` and `viewpoint`,
 * which no mood matches, and Machines is what the word meant.
 *
 * A worse mood than none is possible here. None is not free either — it
 * discards a choice the person made — so the guess is made, written down,
 * and confined to the one line that reads an old link. When old links have
 * aged out this function and its call site delete together.
 */
const LEGACY_PERSONA_MOOD: Readonly<Record<string, MoodId>> = {
  outdoorsman: "outdoors",
  foodie: "food",
  culture: "history",
  nerd: "museums",
  gearhead: "machines",
};

export function moodsFromLegacyPersona(raw: unknown): MoodId[] {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string") return [];
  const mood = LEGACY_PERSONA_MOOD[id];
  return mood ? [mood] : [];
}
