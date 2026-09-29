import { describe, it, expect } from "vitest";
import { MOOD_WAYPOINTS, MOODS_THAT_MOVE_TOWNS, moodsFromLegacyPersona, waypointProfileForMoods } from "../moodProfile";
import { PersonaIdSchema } from "../types";
import { PERSONAS, DEFAULT_PERSONA_ID } from "../index";
import { MOODS, MOOD_CONFIG, type MoodId } from "@/lib/roadside/tags";
import { tierForType, typeWeight } from "@/lib/routing/scoring";

/**
 * What a chosen mood means for a town's places (Gauntlet U6). The roadside
 * stops rank on real tag scores; the towns' places have none, so the
 * operator ruled on 2026-09-30 that the moods map onto the atlas's nine
 * coarse waypoint types where they fit, knowing what does not.
 */

describe("the moods mapped onto a town's waypoint types", () => {
  it("covers all eight moods, so a new one cannot be added without deciding", () => {
    expect(Object.keys(MOOD_WAYPOINTS).sort()).toEqual([...MOODS].sort());
  });

  it("paints the route line with the first mood chosen, not the last and not a default", () => {
    // The plan sheet reads `accentColor` off this profile for the road.
    // First, so adding a second mood never repaints the road the first one
    // painted; it returned the default persona's colour until council
    // round 4 on #94, so the line never changed while a comment said it did.
    for (const mood of MOODS) {
      expect(waypointProfileForMoods([mood]).accentColor, mood).toBe(MOOD_CONFIG[mood].accentColor);
    }
    expect(waypointProfileForMoods(["food", "outdoors"]).accentColor).toBe(MOOD_CONFIG.food.accentColor);
    expect(waypointProfileForMoods(["outdoors", "food"]).accentColor).toBe(MOOD_CONFIG.outdoors.accentColor);
  });

  it("is the default persona's profile with nothing chosen, so the sheet at rest is unchanged", () => {
    expect(waypointProfileForMoods([])).toEqual(PERSONAS[DEFAULT_PERSONA_ID]);
  });

  it("unions two moods, and a type that is primary for either is primary for the pair", () => {
    // Asking for food and outdoors should put a diner and a canyon both
    // near the top, not average them into the middle.
    const both = waypointProfileForMoods(["food", "outdoors"]);
    for (const t of ["food", "drink", "nature", "viewpoint"] as const) {
      expect(both.primaryTypes, t).toContain(t);
    }
    // `culture` is secondary for food and absent for outdoors, so it stays
    // secondary; `landmark` is secondary for outdoors and stays secondary.
    expect(both.secondaryTypes).toContain("culture");
    expect(both.primaryTypes).not.toContain("culture");
    // Nothing is in both lists.
    for (const t of both.primaryTypes) expect(both.secondaryTypes, t).not.toContain(t);
  });

  it("promotes a type to primary when one mood says primary and the other says secondary", () => {
    // museums has culture primary; food has culture secondary.
    const pair = waypointProfileForMoods(["museums", "food"]);
    expect(pair.primaryTypes).toContain("culture");
    expect(pair.secondaryTypes).not.toContain("culture");
  });

  it("names the moods that move a town's list, and the two that do not", () => {
    expect([...MOODS_THAT_MOVE_TOWNS].sort()).toEqual(
      ["art", "food", "history", "museums", "oddities", "outdoors"].sort()
    );
    for (const mood of ["machines", "sports"] as const) {
      expect(MOOD_WAYPOINTS[mood].primary, mood).toEqual([]);
      expect(MOOD_WAYPOINTS[mood].secondary, mood).toEqual([]);
    }
  });

  it("leaves a town's list in its neutral order for an unmapped mood, rather than emptying it", () => {
    // The whole reason the operator could accept the gap: `typeWeight`'s
    // "other" tier is a non-zero floor, written so non-matching places
    // still appear. Every type scores the same multiplier, so the list
    // falls back to trending-within-detour — the order it had before any
    // mood was chosen.
    const profile = waypointProfileForMoods(["machines"]);
    const types = ["landmark", "food", "drink", "nature", "culture", "shopping", "nightlife", "viewpoint", "hidden_gem"] as const;
    const weights = types.map((t) => typeWeight(tierForType(t, profile)));
    expect(new Set(weights).size).toBe(1);
    expect(weights[0]).toBeGreaterThan(0);
  });

  it("orders History, Art and Museums alike, which is the loss the operator accepted", () => {
    // The atlas has no finer word than culture and landmark for these
    // three. Written down as a test so nobody later reads the identical
    // ordering as a bug and 'fixes' it into a difference the data cannot
    // support.
    const of = (m: MoodId) => {
      const p = waypointProfileForMoods([m]);
      return [...p.primaryTypes].sort().join(",");
    };
    expect(of("history")).toBe(of("museums"));
    expect(of("art")).toBe("culture");
    expect(of("history")).toBe("culture,landmark");
  });

  it("ignores a mood that is not one, rather than throwing", () => {
    const profile = waypointProfileForMoods(["food", "banana" as MoodId]);
    expect(profile.primaryTypes).toContain("food");
  });
});


describe("a link written before the moods existed", () => {
  it("gives every one of the five old personas a mood, so none of them opens with nothing", () => {
    // If a persona is ever added to the old enum without a mood here, a
    // trip saved under it would quietly lose its choice, which is the bug
    // this exists to stop.
    for (const id of PersonaIdSchema.options) {
      expect(moodsFromLegacyPersona(id), id).toHaveLength(1);
      expect(MOODS, id).toContain(moodsFromLegacyPersona(id)[0]);
    }
  });

  it("keeps the two that are the same idea under two names", () => {
    expect(moodsFromLegacyPersona("outdoorsman")).toEqual(["outdoors"]);
    expect(moodsFromLegacyPersona("foodie")).toEqual(["food"]);
  });

  it("makes a judgement on the other three, and this is it written down", () => {
    // Not derivable: "Culture" used culture+landmark, which History and
    // Museums both map to exactly; "Nerd" used hidden_gem+culture, which
    // is Oddities and Art between them; "Gear" used landmark+viewpoint,
    // which no mood matches. These are the words, not the types.
    expect(moodsFromLegacyPersona("culture")).toEqual(["history"]);
    expect(moodsFromLegacyPersona("nerd")).toEqual(["museums"]);
    expect(moodsFromLegacyPersona("gearhead")).toEqual(["machines"]);
  });

  it("reads nothing out of anything that is not one of the five", () => {
    for (const raw of ["banana", "", undefined, null, 42, {}, [], ["banana"]]) {
      expect(moodsFromLegacyPersona(raw), JSON.stringify(raw)).toEqual([]);
    }
    // A repeated parameter takes the first, the same as a repeated moods one.
    expect(moodsFromLegacyPersona(["foodie", "nerd"])).toEqual(["food"]);
  });

  it("never returns more than one, since an old link only ever chose one", () => {
    for (const id of PersonaIdSchema.options) {
      expect(moodsFromLegacyPersona(id).length, id).toBeLessThanOrEqual(1);
    }
  });
});
