/**
 * The sentences the plan sheet builds from its data, and the plain word for
 * a kind of place (Gauntlet U2; quality bar, rule 1: every label is a
 * sentence a person in a car would say). Pure and client-safe.
 */

import type { WaypointType } from "@/lib/urban-explorer/types";
import type { TripDay } from "@/lib/plan/days";
import type { TripStatus } from "@/lib/plan/trip-state";
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

/**
 * The line under the home's title: what comes back, said with two real
 * places (Gauntlet U4, deliverable 2). "the" goes before each name and is
 * folded when the name already starts with it, so "The Big Texan Steak
 * Ranch" reads "the Big Texan Steak Ranch" in the middle of the sentence.
 * Pure; the names come from src/lib/roadside/examples.ts on the server.
 */
export function exampleLine(names: readonly [string, string]): string {
  const [a, b] = names.map(withThe);
  return `Places like ${a} and ${b}, along your road.`;
}

function withThe(name: string): string {
  const trimmed = name.trim();
  return /^the\s/i.test(trimmed) ? `the ${trimmed.slice(4).trimStart()}` : `the ${trimmed}`;
}

/**
 * The trip's driving budget, as the sheet says it (Gauntlet U11): the
 * header's second line, and the box under the figures when the budget is
 * tight or blown.
 *
 * **A trip only has a total budget when it has dates.** With dates, the
 * budget is the days times the hours a day, and "Tight" or "more driving
 * than fits" is a real statement about that whole trip. Without dates
 * there is no total: the trip takes as many days as it takes, and the day
 * list already says how many. Until U11 the sheet filled the gap by
 * treating an undated trip as *one day*, so every multi-day trip without
 * dates read as tight or over budget — "Tight: 5 h 57 min straight on to
 * Austin, with 2 h of driving left" on a three-day trip that was fine.
 *
 * Without dates, then, there is no box, and "left today" is what is left
 * of day 1's hours once day 1's own drive is done — not one day's hours
 * less every leg in the trip, which counted later days' driving as today's
 * and was only right by coincidence when the trip had one overnight.
 */
export function budgetWords(input: {
  /**
   * Whether the trip has dates, and if so how many days (U13: a union, so
   * an undated trip has no day count to be read by mistake).
   */
  trip: { dated: false } | { dated: true; days: number };
  budgetMinutesPerDay: number;
  /** The trip's budget status; an undated trip's is `empty` or `undated`. */
  status: TripStatus;
  /** Day 1's drive in minutes, or null while it is not known. */
  dayOneMinutes: number | null;
  toName: string;
}): { line: string; box: { kind: "warning" | "over_budget"; text: string } | null } {
  const fmt = (minutes: number) => formatDurationPlain(Math.round(minutes) * 60);
  const trip = input.trip;
  if (!trip.dated) {
    // Nothing planned yet, or day 1's drive not back from the server: the
    // day's whole budget is still there to spend.
    const left =
      input.status.kind === "empty" || input.dayOneMinutes === null
        ? input.budgetMinutesPerDay
        : Math.max(0, input.budgetMinutesPerDay - input.dayOneMinutes);
    return { line: `${fmt(left)} of driving left today`, box: null };
  }
  const span = trip.days === 1 ? "today" : `over ${trip.days} days`;
  const s = input.status;
  // A dated trip's status is never `undated`; read as nothing used yet if
  // it ever were, rather than letting the type through unhandled.
  if (s.kind === "empty" || s.kind === "undated") return { line: `${fmt(trip.days * input.budgetMinutesPerDay)} of driving left ${span}`, box: null };
  if (s.kind === "over_budget") {
    const text = `${fmt(s.overageMinutes)} more driving than fits ${span}`;
    return { line: text, box: { kind: "over_budget", text: `${text}.` } };
  }
  const line = `${fmt(s.remainingBudgetMinutes)} of driving left ${span}`;
  if (s.kind === "warning") {
    return {
      line,
      box: {
        kind: "warning",
        text: `Tight: ${fmt(s.directMinutesToDestination)} still to drive to ${input.toName}, and ${fmt(s.remainingBudgetMinutes)} of driving left ${span}.`,
      },
    };
  }
  return { line, box: null };
}
