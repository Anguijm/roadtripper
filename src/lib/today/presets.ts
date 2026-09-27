/**
 * Client-safe constants for the today screen. Kept apart from plan.ts, which
 * is server-only because it reads SQLite.
 */

/** Hours of driving you can spend today. Same presets as the daily budget. */
export const HOURS_PRESETS = [2, 3, 4, 5, 6, 8] as const;
export type HoursPreset = (typeof HOURS_PRESETS)[number];

/** "I have five hours" is the sentence this screen exists to answer. */
export const DEFAULT_HOURS: HoursPreset = 5;

/** Anything not in the presets, including garbage from the URL, becomes the default. */
export function hoursFrom(raw: unknown): HoursPreset {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return (HOURS_PRESETS as readonly number[]).includes(n) ? (n as HoursPreset) : DEFAULT_HOURS;
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
