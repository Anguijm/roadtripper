/**
 * The sentences the plan sheet builds from its data, and the plain word for
 * a kind of place (Gauntlet U2; quality bar, rule 1: every label is a
 * sentence a person in a car would say). Pure and client-safe.
 */

import type { WaypointType } from "@/lib/urban-explorer/types";

/**
 * The most town names the sentence says before "and N more". Two, because
 * the sentence is the sheet's title on a phone: a line of the sheet at 16
 * px in the body face holds about 40 characters (36 on a 320 px phone), and
 * the sentence also carries "fit today" or, after a stop, "fit in day 2".
 * Two names with the count and the day ("Lubbock, Abilene and 3 more fit
 * in day 2", 42 characters) is one line, two on the narrower phones. Every
 * name past two adds a comma and ten to fifteen characters, so three names
 * with long towns ("Wichita Falls, San Angelo, Big Spring and 2 more fit in
 * day 2", 66 characters) wrap to two or three lines, and three names in a
 * row with commas read as a list, not as a sentence a person would say
 * (quality bar, rule 1).
 */
const NAMED_TOWNS = 2;

/**
 * The sheet's header: "Lubbock and Abilene fit today", "Lubbock, Abilene
 * and 3 more fit today", "Nothing fits today; drive on to Austin". After a
 * stop the towns that fit are counted from that stop, so they are the next
 * day's, and the sentence names the day the sheet lists them under
 * (Gauntlet U3, round 3: "Fort Worth fits today after Lubbock" stood over
 * a list that put Fort Worth in day 2): "Abilene fits in day 2", "Nothing
 * fits in day 2; drive on to Austin". Day 1 is "today", as U2 wrote it.
 * Never a count or a minutes figure as a label.
 */
export function fitsTodayLine(towns: readonly string[], toName: string, day = 1): string {
  const when = day > 1 ? `in day ${day}` : "today";
  if (towns.length === 0) return `Nothing fits ${when}; drive on to ${toName}`;
  if (towns.length === 1) return `${towns[0]} fits ${when}`;
  const named = towns.slice(0, NAMED_TOWNS);
  const rest = towns.length - named.length;
  const list =
    rest > 0
      ? `${named.join(", ")} and ${rest} more`
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${list} fit ${when}`;
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
