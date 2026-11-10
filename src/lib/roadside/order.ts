import { answeredMood, rankFor, type MoodId, type SortMode } from "./tags";
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

/**
 * A day's "Along the way" drawer (Gauntlet U50, John's design 2026-11-10):
 * the places in the order you pass them, filtered by the chosen moods.
 *
 * - With a mood chosen, a place that answers none of them (`answeredMood`)
 *   is left out. With none chosen, nothing is.
 * - `all` is every place left, in road order (`orderRoadside` "along").
 * - `first` is the `firstN` strongest of them (`orderRoadside` "best", the
 *   chosen moods through `rankFor`), put back into road order: the list
 *   still reads like the drive, and the ten rows are the ten worth most
 *   (quality bar rule 4 as amended: "its first ten are the ten strongest,
 *   in that order").
 */
export function alongTheWay(
  stops: readonly RoadsideMarker[],
  chosen: readonly MoodId[],
  firstN: number
): { all: RoadsideMarker[]; first: RoadsideMarker[] } {
  const kept = chosen.length === 0 ? [...stops] : stops.filter((s) => answeredMood(s.scores, chosen) !== null);
  const all = orderRoadside(kept, chosen, "along");
  const strongest = new Set(orderRoadside(kept, chosen, "best").slice(0, firstN).map((s) => s.id));
  return { all, first: all.filter((s) => strongest.has(s.id)) };
}
