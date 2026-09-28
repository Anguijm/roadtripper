/**
 * Client-safe formatters for distance and duration. Extracted from
 * directions.ts (which carries `import "server-only"`) so that client
 * components can re-render totals after a recompute.
 *
 * NO server-only imports here. NO Firebase Admin imports.
 */

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * A duration as a person says it: "4 h", "1 h 20 min", "45 min". For the
 * sentences on the plan sheet (the quality bar's glossary: "4 h of driving
 * left today"); `formatDuration` keeps the compact "4h 20m" for the tables.
 */
export function formatDurationPlain(seconds: number): string {
  // A negative duration (a budget overrun) is the absolute value with one
  // leading minus: "-1 h 30 min", never "-1 h -30 min". Under a minute
  // either way is "0 min", with no sign on a zero.
  const total = Math.abs(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const sign = seconds < 0 && (hours > 0 || minutes > 0) ? "-" : "";
  if (hours === 0) return `${sign}${minutes} min`;
  if (minutes === 0) return `${sign}${hours} h`;
  return `${sign}${hours} h ${minutes} min`;
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return `${Math.round(miles)} mi`;
}
