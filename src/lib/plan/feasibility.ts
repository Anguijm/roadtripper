/**
 * "Two nights here and you still make Austin by Oct 14."
 *
 * Given where you are, a city you might stop in, the trip's destination and
 * its deadline, how long can you stay in that city and still arrive on
 * time? Pure arithmetic in whole days, with the same overnight quantization
 * the plan page uses: a leg costs ceil(minutes / daily budget) driving days,
 * because you cannot spend half a night on the road.
 *
 * Day 0 is today. Reaching the city takes ceil(a / b) driving days, so you
 * arrive on day ceil(a / b) - 1 (today, if it fits in one day's budget).
 * Each night there is a day. Leaving on the morning after the last night,
 * the destination is ceil(c / b) driving days away, so you arrive on
 * (arrival day at city) + nights + ceil(c / b) - 1. That must be on or
 * before the deadline, day D. Solving for nights gives maxNights below.
 */

import { formatDeadline } from "./deadline";

export interface FeasibilityInput {
  /** Whole days from today to the deadline; 0 means the deadline is today. */
  daysToDeadline: number;
  /** Minutes of driving per day. */
  budgetMinutes: number;
  /** Minutes from where you are to the city. */
  minutesToCity: number;
  /** Minutes from the city to the destination. 0 means the city is the destination. */
  minutesCityToDestination: number;
}

/** Driving days a leg costs; a zero-length leg costs none. */
const drivingDays = (minutes: number, budgetMinutes: number) =>
  minutes <= 0 ? 0 : Math.ceil(minutes / budgetMinutes);

/**
 * Nights you can spend in the city and still make the deadline. 0 means
 * pass through today; negative means you miss it by that many days even
 * driving straight on.
 */
export function maxNights(i: FeasibilityInput): number {
  if (!(i.budgetMinutes > 0)) throw new Error("budgetMinutes must be positive");
  const arriveAtCityDay = Math.max(0, drivingDays(i.minutesToCity, i.budgetMinutes) - 1);
  const daysOnFromCity = drivingDays(i.minutesCityToDestination, i.budgetMinutes);
  // Leaving on day (arrive + nights), arriving on day (arrive + nights + daysOn - 1) <= D.
  // With daysOn = 0 the city is the destination and every day until D is a night.
  return i.daysToDeadline - arriveAtCityDay - Math.max(0, daysOnFromCity - 1);
}

export type Feasibility =
  | { kind: "nights"; nights: number }
  | { kind: "pass-through" }
  | { kind: "late"; daysLate: number };

export function feasibility(i: FeasibilityInput): Feasibility {
  const n = maxNights(i);
  if (n > 0) return { kind: "nights", nights: n };
  if (n === 0) return { kind: "pass-through" };
  return { kind: "late", daysLate: -n };
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "two", "ten", "11". Small numbers as words because the line is spoken. */
export function numberWord(n: number): string {
  return n >= 0 && n <= 10 ? WORDS[n] : String(n);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The one sentence. `estimated` is true when the minutes to the destination
 * came from the graph's pace rather than a stored pair, and the sentence
 * says so up front rather than presenting a guess as exact.
 */
export function feasibilityLine(
  f: Feasibility,
  opts: { toName: string; endDate: string; estimated: boolean }
): string {
  const by = `${opts.toName} by ${formatDeadline(opts.endDate)}`;
  const lead = opts.estimated ? "Roughly " : "";
  switch (f.kind) {
    case "nights": {
      const stay = f.nights === 1 ? "one night" : `${numberWord(f.nights)} nights`;
      return capitalise(`${lead}${stay} here and you still make ${by}.`);
    }
    case "pass-through":
      return capitalise(`${lead}pass through today and you still make ${by}.`);
    case "late": {
      const late = f.daysLate === 1 ? "one day" : `${numberWord(f.daysLate)} days`;
      return capitalise(`${lead}stop here and you miss ${opts.toName}: ${late} late even driving straight on.`);
    }
  }
}
