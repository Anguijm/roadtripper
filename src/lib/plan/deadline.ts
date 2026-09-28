/**
 * What an arrival date means, in one place.
 *
 * The picker has two modes: a date range, or "arrive by" a date with the
 * departure derived from the route. Every screen that shows or passes on a
 * deadline goes through here, so "Arrive in Austin by Oct 14, 6 days left"
 * reads the same on the plan header, the saved-trip card and the today
 * screen. Pure and client-safe: dates are strings, "today" is passed in.
 */

export type DateMode = "range" | "arrival";

/** Anything but the exact word "arrival" is a range, including garbage from a URL. */
export function parseDateMode(raw: unknown): DateMode {
  return raw === "arrival" ? "arrival" : "range";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string that is a real calendar date, or undefined. */
export function parseIsoDate(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !ISO_DATE.test(raw)) return undefined;
  const d = new Date(raw + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return undefined;
  // Reject 2026-02-31 and friends: Date accepts them by rolling over.
  return d.toISOString().slice(0, 10) === raw ? raw : undefined;
}

/** Today as YYYY-MM-DD in UTC. The server's day, which is the honest one to
 *  compute from; the line always shows the date itself, so the count is a
 *  convenience and the date is the truth. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Today as YYYY-MM-DD in the running clock's own zone: the day the person
 * would name. The plan sheet's arrival count is from here (Gauntlet U3,
 * round 2): the UTC day said "sixteen days from now" on an evening in
 * Japan where it was already the 29th and fifteen. The page passes the
 * server's local day for the first paint and the sheet re-reads the
 * browser's once mounted; the date itself is always shown, so the count
 * is a convenience and the date is the truth.
 */
export function localTodayIso(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Milliseconds in a day. Both dates are pinned to UTC midnight, so the
 *  difference is an exact multiple of this except for leap seconds, which
 *  JavaScript's Date does not have; the round() is belt and braces. Local
 *  midnight would break this twice a year, when a DST day is 23 or 25 hours. */
const DAY_MS = 86_400_000;

/** Whole calendar days from `today` to `endDate`. Negative when it has passed. */
export function daysUntil(endDate: string, today: string): number {
  const ms = new Date(endDate + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / DAY_MS);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 14". The year is left off; a road trip is not a year away. */
export function formatDeadline(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

/** "6 days left", "tomorrow", "today", "2 days ago". */
export function daysLeftPhrase(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `${days} days left`;
  if (days === -1) return "yesterday";
  return `${-days} days ago`;
}

/** The one line every screen uses: "Arrive in Austin by Oct 14, 6 days left". */
export function deadlineLine(opts: { toName: string; endDate: string; today: string }): string {
  return `Arrive in ${opts.toName} by ${formatDeadline(opts.endDate)}, ${daysLeftPhrase(daysUntil(opts.endDate, opts.today))}`;
}

// ── The plan sheet's arrival sentence (Gauntlet U3) ─────────────────────

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 14", and with the year when it is not this year: "January 5, 2027". */
export function longDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-");
  const date = `${LONG_MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
  return y === today.slice(0, 4) ? date : `${date}, ${y}`;
}

const COUNT_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

/** A count as a person says it: words up to twenty, digits past that. */
export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** "six days from now", "tomorrow", "today", "yesterday", "three days ago", "25 days from now". */
export function daysFromNowPhrase(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `${countWord(days)} days from now` : `${countWord(-days)} days ago`;
}

/** The plan sheet's deadline: "Arrive in Austin by October 14, six days from now". */
export function arrivalSentence(opts: { toName: string; endDate: string; today: string }): string {
  return `Arrive in ${opts.toName} by ${longDate(opts.endDate, opts.today)}, ${daysFromNowPhrase(daysUntil(opts.endDate, opts.today))}`;
}
