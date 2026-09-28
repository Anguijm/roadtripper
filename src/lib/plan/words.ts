/**
 * The sentences the plan sheet builds from its data, and the plain word for
 * a kind of place (Gauntlet U2; quality bar, rule 1: every label is a
 * sentence a person in a car would say). Pure and client-safe.
 */

import type { WaypointType } from "@/lib/urban-explorer/types";
import type { TripDay } from "@/lib/plan/days";
import { formatDurationPlain } from "@/lib/routing/format";
import { countWord } from "@/lib/plan/deadline";

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

// ── The days (Gauntlet U3) ──────────────────────────────────────────────

/**
 * A day's heading, a sentence with its figures: "Day 1 · Amarillo to
 * Lubbock · 3 h 20 min"; a day cut where the budget runs out with a town
 * near, "Day 1 · Amarillo to near Snyder · 4 h", then "Day 2 · near
 * Snyder to Austin · 3 h 50 min"; a cut with no town near, said in hours
 * as a person says it, "Day 1 · 4 h down the road from Amarillo", then
 * "Day 2 · on to Austin · 3 h 37 min", and a second cut in a row "Day 2 ·
 * another 4 h down the road" (round 6: round 5's "Amarillo to mile 259"
 * was a number a person in a car would not say). The drive is left off
 * while the stretch's route is not known. Round 4's "Days 1 and 2 ·
 * Amarillo to Austin · 7 h 50 min, over the 4 h you wanted" told the
 * count and not where day 1 ended; the cut in days.ts says where, so no
 * heading is ever over the budget. The figures are set in the mono face
 * by the caller (Figures).
 */
export function dayHeadingLine(day: Pick<TripDay, "index" | "fromKind" | "fromName" | "endKind" | "toName" | "minutes">): string {
  const n = `Day ${day.index + 1}`;
  const drive = day.minutes !== null ? formatDurationPlain(Math.round(day.minutes * 60)) : null;
  if (day.endKind === "hours") {
    // A cut day always has its drive (the budget); "a day" is belt and braces.
    const hours = drive ?? "a day";
    return day.fromKind === "hours" ? `${n} · another ${hours} down the road` : `${n} · ${hours} down the road from ${day.fromName}`;
  }
  const where = day.fromKind === "hours" ? `on to ${day.toName}` : `${day.fromName} to ${day.toName}`;
  return drive ? `${n} · ${where} · ${drive}` : `${n} · ${where}`;
}

/** Where a night is spent, after "a night" or "nights": "in Lubbock" at a stop, "near Snyder" at a cut with a town near. */
function nightAt(day: Pick<TripDay, "toName" | "endKind">): string {
  return day.endKind === "near" ? day.toName : `in ${day.toName}`;
}

/**
 * The trip's shape in one line under the sheet's numbers, for a trip of
 * two or more days: "Two days, with a night near Snyder", "Three days,
 * with nights in Lubbock and Abilene", "Three days, with nights in Lubbock
 * and near Llano", and for a cut with no town near, a night on the road:
 * "Two days, with a night on the road", "Three days, with a night in
 * Lubbock and one on the road", "Four days, with nights in Lubbock and
 * Abilene, and one on the road". The count is the days, in words (digits
 * past twenty); the nights are where each day but the last ends, a stop's
 * town or a cut's place first, then the nights on the road counted;
 * nights all in towns share one "in". Not a second telling of any day
 * (round 4: the strip of day rows repeated each heading): where a day
 * ends and what fits in it is the day's own heading and section. Null for
 * one day, whose heading is a few lines down.
 */
export function tripShapeLine(days: ReadonlyArray<Pick<TripDay, "toName" | "endKind">>): string | null {
  if (days.length < 2) return null;
  const ends = days.slice(0, -1);
  const named = ends.filter((d) => d.endKind !== "hours");
  const onRoad = ends.length - named.length;
  const count = countWord(days.length);
  const head = `${count[0].toUpperCase()}${count.slice(1)} days, with`;
  if (named.length === 0) return `${head} ${onRoad === 1 ? "a night" : `${countWord(onRoad)} nights`} on the road`;
  const allInTowns = named.every((d) => d.endKind === "stop" || d.endKind === "end");
  const nights = allInTowns ? named.map((d) => d.toName) : named.map(nightAt);
  const list = nights.length === 1 ? nights[0] : `${nights.slice(0, -1).join(", ")} and ${nights[nights.length - 1]}`;
  const line = `${head} ${nights.length === 1 ? "a night" : "nights"} ${allInTowns ? "in " : ""}${list}`;
  if (onRoad === 0) return line;
  return `${line}${nights.length > 1 ? "," : ""} and ${onRoad === 1 ? "one" : countWord(onRoad)} on the road`;
}

/**
 * The label over a day's towns: "Towns that fit today", "Towns that fit
 * in day 2". The glossary's own phrase for what the planner calls
 * candidates, said once over the rows so a town the planner offers from
 * hours off the road (Oklahoma City from Amarillo) reads under Day 1 as a
 * choice of where the day ends, not as a place along its road (round 6,
 * rule 5). Day 1 is "today", as the sheet's title says it.
 */
export function townsFitHeading(day = 1): string {
  return day > 1 ? `Towns that fit in day ${day}` : "Towns that fit today";
}
