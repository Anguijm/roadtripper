import { rankFor, type MoodId, type SortMode } from "./tags";
import type { RoadsideMarker } from "./along";

/**
 * The day's places in the order the sheet lists them (Gauntlet U6).
 *
 * Pure and exported rather than inline in `PlanWorkspace` so both orders
 * can be tested. The sheet's sort mode is client state, so a server render
 * only ever shows "best" and an SSR test can never see the other one.
 *
 * "best" is the chosen moods through `rankFor`, which with nothing chosen
 * is the general score — so the sheet at rest is ordered exactly as it was
 * before U6. "along" is the order they come up while driving.
 *
 * Both fall back to the same tie-breaks in the same sequence, so the order
 * is total either way: two places that tie on the first key are separated
 * by the second and then by name, never left in whatever order the store
 * happened to return them. That is the same lesson the Rose Bowl and the
 * practice field taught the ranking itself.
 *
 * Never filters. A place that answers no chosen mood sinks to the bottom
 * and stays on the list; the chips order the day, they do not hide it.
 */
export function orderRoadside(
  stops: readonly RoadsideMarker[],
  chosen: readonly MoodId[],
  mode: SortMode
): RoadsideMarker[] {
  if (mode === "along") {
    return [...stops].sort((a, b) => a.alongKm - b.alongKm || b.p - a.p || a.name.localeCompare(b.name, "en"));
  }
  return [...stops].sort(
    (a, b) =>
      rankFor(b.scores, b.p, chosen) - rankFor(a.scores, a.p, chosen) ||
      a.alongKm - b.alongKm ||
      a.name.localeCompare(b.name, "en")
  );
}
