/**
 * Client-safe constants for the today screen. Kept apart from plan.ts, which
 * is server-only because it reads SQLite.
 */

/** Hours of driving you can spend today. Also the daily-budget presets in
 *  src/components/DriveBudgetSelector.tsx, which imports this list. */
export const HOURS_PRESETS = [2, 3, 4, 5, 6, 8] as const;
export type HoursPreset = (typeof HOURS_PRESETS)[number];

/** "I have five hours" is the sentence this screen exists to answer. */
export const DEFAULT_HOURS: HoursPreset = 5;

/**
 * The today screen's and the car's day lengths: HOURS_PRESETS plus 10 and 12
 * (2026-11-14: John drives 10 to 12 hours some days), with NO_LIMIT beside
 * them. /plan's daily budget keeps HOURS_PRESETS: a trip is split into days
 * by it, and no limit would make any trip one day.
 * Changing it: the hours row in docs/car-api.md (the car reads it), the
 * chips' two rows in src/components/TodayStart.tsx, and the tests in
 * src/lib/today/__tests__/api.test.ts and src/components/__tests__/.
 */
export const TODAY_HOURS = [...HOURS_PRESETS, 10, 12] as const;
/**
 * `hours=any`: no limit. A word, not 0, because a blank value reads as 0
 * (Number("")) and must stay the default.
 */
export const NO_LIMIT = "any";
/** A day's length: hours, or null for no limit. */
export type TodayHours = number | null;

/** One of TODAY_HOURS, null for NO_LIMIT, anything else (blank and missing included) the default, 5. */
export function todayHoursFrom(raw: unknown): TodayHours {
  const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (s === NO_LIMIT) return null;
  const n = Number(s);
  return (TODAY_HOURS as readonly number[]).includes(n) ? n : DEFAULT_HOURS;
}

/** The URL's spelling of a day's length: "5", or "any". */
export function hoursParam(h: TodayHours): string {
  return h === null ? NO_LIMIT : String(h);
}

/** Anything not in the presets, including garbage from the URL, becomes the default. */
export function hoursFrom(raw: unknown): HoursPreset {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return (HOURS_PRESETS as readonly number[]).includes(n) ? (n as HoursPreset) : DEFAULT_HOURS;
}

/**
 * A place name from a URL, from the start screen or a handoff link. Rendered
 * as text and cut at 80 characters: the longest place name the autocomplete
 * returns is well under that, and 80 is about one line under a header on a
 * phone. Shared by the home page and the today page so the two agree.
 */
export const MAX_PLACE_NAME_LENGTH = 80;

export function placeNameFrom(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.trim().slice(0, MAX_PLACE_NAME_LENGTH) : "";
  return s || fallback;
}

/**
 * A point from two URL strings, or null. `Number("")` is 0, so a link with
 * `?lat=&lng=` would otherwise land on Null Island; blank or missing is
 * "no point", and only a real number inside the world counts.
 */
export function pointFrom(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== "string" || typeof lng !== "string") return null;
  if (lat.trim() === "" || lng.trim() === "") return null;
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

/**
 * An estimated drive time, to the nearest 10 minutes and never under 10:
 * "about 8 h 7 min" promises a precision a straight line does not have (the
 * U53 critic's note). The minutes still sort by the exact estimate.
 */
export function aboutMinutes(minutes: number): number {
  return Math.max(10, Math.round(minutes / 10) * 10);
}

/** One-way drive time as people say it: "45 min", "2 h", "2 h 10 min". */
export function formatDrive(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}
