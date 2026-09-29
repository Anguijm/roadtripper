/**
 * Which recompute is the current one (council round 3 on #87, item 3).
 *
 * Every change to the stops asks the server for the route through them,
 * or, with no stops left, resets the sheet to the page's own route. Two
 * asks can be in flight at once ("Stop here", then "Take this stop out"
 * before the route returns: the remove control is live while a recompute
 * runs, and a tap on the map adds whatever the buttons say), and the older
 * can land last; a result is applied only when it answers the latest ask.
 * The reset counts as an ask. It did not before (Council S7-ARCH-5 kept the
 * counter still "so empty resets don't burn IDs"), so the recompute for
 * the stop just taken out landed on an empty trip and put that stop's
 * route, legs and towns on the sheet.
 *
 * Pure but for the counter it is handed, so the rule is testable without a
 * click: PlanWorkspace keeps the counter in a ref and calls `nextRecompute`
 * once per change to the stops and `isCurrentRecompute` once per result
 * (src/lib/plan/__tests__/recompute-sequence.test.ts).
 */

/** The counter: the number of the latest ask, reset included. */
export interface RecomputeSequence {
  latest: number;
}

export function recomputeSequence(): RecomputeSequence {
  return { latest: 0 };
}

/** What a change to the stops asks for: a recompute with its number, or a reset. */
export type RecomputeAsk = { kind: "reset" } | { kind: "recompute"; id: number };

export function nextRecompute(seq: RecomputeSequence, stopCount: number): RecomputeAsk {
  seq.latest += 1;
  return stopCount === 0 ? { kind: "reset" } : { kind: "recompute", id: seq.latest };
}

/** Whether the result numbered `id` answers the latest ask, and so may be applied. */
export function isCurrentRecompute(seq: RecomputeSequence, id: number): boolean {
  return id === seq.latest;
}
