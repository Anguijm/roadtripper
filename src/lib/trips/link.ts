import { z } from "zod/v4";
import { MAX_TRIP_STOPS, SavedTripStopSchema, type SavedTripStop } from "./types";

/**
 * A saved trip's stops, carried in the link that reopens it (Gauntlet U9).
 *
 * Saved trips live in the browser's localStorage, so the server that renders
 * /plan cannot read them; everything a reopened trip needs has to travel in
 * the link, as the route and the dates always have. Until U9 the stops did
 * not, and a saved trip reopened as a bare route.
 *
 * One module writes the parameter and reads it back, so the two cannot
 * disagree about the shape.
 */

export const STOPS_PARAM = "stops";

/**
 * The longest stops parameter that is read at all. Seven stops of real
 * names and coordinates are well under a kilobyte; this is a ceiling against
 * a hand-built link making the server parse something enormous, checked
 * before `JSON.parse` sees it.
 */
const MAX_PARAM_LENGTH = 8_000;

/** The parameter for a trip's stops, or null when it has none. */
export function stopsParam(stops: readonly SavedTripStop[]): string | null {
  if (stops.length === 0) return null;
  return JSON.stringify(stops.map(({ cityId, cityName, lat, lng }) => ({ cityId, cityName, lat, lng })));
}

/**
 * The stops a link carries, or none.
 *
 * The link is untrusted: anyone can edit it. Anything that cannot be read —
 * not a string, too long, not JSON, not the saved trip's own stop shape,
 * more stops than a trip may hold — reads as no stops, so a broken link
 * opens as the plain route rather than an error screen. That is the same
 * rule `parseMoods` follows for the moods.
 *
 * A stop that appears twice keeps its first place and loses the rest. The
 * recompute refuses a request that names a stop twice, so passing a
 * repeat through would turn a reopened trip into a red banner.
 *
 * The server re-validates every coordinate when the sheet recomputes, so
 * this is the first check, not the only one.
 */
export function parseStopsParam(raw: unknown): SavedTripStop[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PARAM_LENGTH) return [];
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return [];
  }
  const parsed = z.array(SavedTripStopSchema).max(MAX_TRIP_STOPS).safeParse(data);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.filter((s) => (seen.has(s.cityId) ? false : (seen.add(s.cityId), true)));
}
