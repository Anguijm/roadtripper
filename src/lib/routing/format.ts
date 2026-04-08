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

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return `${Math.round(miles)} mi`;
}
