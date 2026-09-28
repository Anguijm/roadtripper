/**
 * The sentences the plan sheet builds from its data, and the plain word for
 * a kind of place (Gauntlet U2; quality bar, rule 1: every label is a
 * sentence a person in a car would say). Pure and client-safe.
 */

import type { WaypointType } from "@/lib/urban-explorer/types";

/** The most town names the sentence says before "and N more". */
const NAMED_TOWNS = 2;

/**
 * The sheet's header: "Lubbock and Abilene fit today", "Lubbock, Abilene
 * and 3 more fit today", "Nothing fits today; drive on to Austin". After a
 * stop the sentence says where it counts from: "Abilene fits today after
 * Lubbock", "Nothing fits today after Lubbock; drive on to Austin". Never a
 * count or a minutes figure as a label.
 */
export function fitsTodayLine(towns: readonly string[], toName: string, after?: string | null): string {
  const from = after ? ` after ${after}` : "";
  if (towns.length === 0) return `Nothing fits today${from}; drive on to ${toName}`;
  if (towns.length === 1) return `${towns[0]} fits today${from}`;
  const named = towns.slice(0, NAMED_TOWNS);
  const rest = towns.length - named.length;
  const list =
    rest > 0
      ? `${named.join(", ")} and ${rest} more`
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${list} fit today${from}`;
}

/** The kind of a place in sentence case: "Hidden gem", never "HIDDEN_GEM". */
const KIND_WORDS: Record<WaypointType, string> = {
  landmark: "Landmark",
  food: "Food",
  drink: "Drink",
  nature: "Nature",
  culture: "Culture",
  shopping: "Shopping",
  nightlife: "Nightlife",
  viewpoint: "Viewpoint",
  hidden_gem: "Hidden gem",
};

export function kindWord(type: WaypointType): string {
  return KIND_WORDS[type] ?? "Place";
}
