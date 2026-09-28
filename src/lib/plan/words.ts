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
 * Lubbock · 3 h 20 min"; a day cut where the budget runs out, "Day 1 ·
 * Amarillo to near Snyder · 4 h", then "Day 2 · near Snyder to Austin ·
 * 3 h 50 min"; the drive left off while the stretch's route is not known.
 * Round 4's "Days 1 and 2 · Amarillo to Austin · 7 h 50 min, over the 4 h
 * you wanted" told the count and not where day 1 ended; the cut in
 * days.ts now says where, so no heading is ever over the budget. The
 * figures are set in the mono face by the caller (Figures).
 */
export function dayHeadingLine(day: Pick<TripDay, "index" | "fromName" | "toName" | "minutes">): string {
  let line = `Day ${day.index + 1} · ${day.fromName} to ${day.toName}`;
  if (day.minutes !== null) line += ` · ${formatDurationPlain(Math.round(day.minutes * 60))}`;
  return line;
}

/** Where a night is spent, after "a night" or "nights": "in Lubbock" at a stop, "near Snyder" or "at mile 176" at a cut. */
function nightAt(day: Pick<TripDay, "toName" | "endKind">): string {
  if (day.endKind === "near") return day.toName;
  if (day.endKind === "mile") return `at ${day.toName}`;
  return `in ${day.toName}`;
}

/**
 * The trip's shape in one line under the sheet's numbers, for a trip of
 * two or more days: "Two days, with a night near Snyder", "Three days,
 * with nights in Lubbock and Abilene", "Three days, with nights in Lubbock
 * and near Llano". The count is the days, in words (digits past twenty);
 * the nights are where each day but the last ends, in order, a stop's
 * town or a cut's place; nights all in towns share one "in". Not a second
 * telling of any day (round 4: the strip of day rows repeated each
 * heading): where a day ends and what fits in it is the day's own heading
 * and section. Null for one day, whose heading is a few lines down.
 */
export function tripShapeLine(days: ReadonlyArray<Pick<TripDay, "toName" | "endKind">>): string | null {
  if (days.length < 2) return null;
  const ends = days.slice(0, -1);
  const allInTowns = ends.every((d) => d.endKind === "stop" || d.endKind === "end");
  const nights = allInTowns ? ends.map((d) => d.toName) : ends.map(nightAt);
  const list = nights.length === 1 ? nights[0] : `${nights.slice(0, -1).join(", ")} and ${nights[nights.length - 1]}`;
  const count = countWord(days.length);
  return `${count[0].toUpperCase()}${count.slice(1)} days, with ${nights.length === 1 ? "a night" : "nights"} ${allInTowns ? "in " : ""}${list}`;
}
