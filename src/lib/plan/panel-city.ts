/**
 * Which city the neighbourhood panel is about.
 *
 * The panel used to follow the trip only: a city had to be added before its
 * write-up could be read. Now it follows any city on screen, a stop or a
 * candidate, and this resolves the id to a name from whichever list holds
 * it. Pure, so the rule is testable without a click.
 */

export interface PanelCity {
  cityId: string;
  cityName: string;
  /** True when the city is in the trip; false when it is only a candidate. */
  isStop: boolean;
}

export function panelCityFor(
  panelCityId: string | null,
  tripStops: ReadonlyArray<{ cityId: string; cityName: string }>,
  candidates: ReadonlyArray<{ id: string; name: string }>
): PanelCity | null {
  if (!panelCityId) return null;
  // The trip is checked first on purpose. A city can be on both lists (a
  // candidate that was added), and then it is a stop: `isStop` must say so,
  // because the panel is describing part of the trip, not a maybe.
  const stop = tripStops.find((s) => s.cityId === panelCityId);
  if (stop) return { cityId: stop.cityId, cityName: stop.cityName, isStop: true };
  const candidate = candidates.find((c) => c.id === panelCityId);
  if (candidate) return { cityId: candidate.id, cityName: candidate.name, isStop: false };
  return null;
}

/**
 * Where the panel goes when the lists change. It stays on its city while
 * that city is anywhere on screen, a stop or a candidate; a removed stop
 * that is still a candidate keeps its write-up open. Only when the city has
 * left both lists does the panel move to the last stop, or close if there
 * is none, so a stale id can never resurrect a city that is gone.
 */
export function nextPanelCityId(
  current: string | null,
  tripStops: ReadonlyArray<{ cityId: string }>,
  candidates: ReadonlyArray<{ id: string }>
): string | null {
  if (current === null) return null;
  if (tripStops.some((s) => s.cityId === current)) return current;
  if (candidates.some((c) => c.id === current)) return current;
  return tripStops[tripStops.length - 1]?.cityId ?? null;
}
