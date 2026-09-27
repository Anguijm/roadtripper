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
  const stop = tripStops.find((s) => s.cityId === panelCityId);
  if (stop) return { cityId: stop.cityId, cityName: stop.cityName, isStop: true };
  const candidate = candidates.find((c) => c.id === panelCityId);
  if (candidate) return { cityId: candidate.id, cityName: candidate.name, isStop: false };
  return null;
}
