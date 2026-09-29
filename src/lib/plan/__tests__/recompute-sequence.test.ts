import { describe, it, expect } from "vitest";
import { recomputeSequence, nextRecompute, isCurrentRecompute } from "../recompute-sequence";

/**
 * The stale-result guard on the recompute (council round 3 on #87, item
 * 3). A render test of two taps and two results is not practical here
 * (vitest runs in node with no DOM, and the workspace's effects do not
 * run on the server), so the rule the effect follows is tested as the
 * pure function the effect calls.
 */
describe("which recompute is current", () => {
  it("applies only the newer of two in flight, whichever lands first", () => {
    const seq = recomputeSequence();
    const first = nextRecompute(seq, 1);
    const second = nextRecompute(seq, 2);
    expect(first).toEqual({ kind: "recompute", id: 1 });
    expect(second).toEqual({ kind: "recompute", id: 2 });
    // The older lands last: stale. The newer: current, in either order.
    expect(isCurrentRecompute(seq, 2)).toBe(true);
    expect(isCurrentRecompute(seq, 1)).toBe(false);
    // A third ask makes both stale.
    nextRecompute(seq, 3);
    expect(isCurrentRecompute(seq, 1)).toBe(false);
    expect(isCurrentRecompute(seq, 2)).toBe(false);
    expect(isCurrentRecompute(seq, 3)).toBe(true);
  });

  it("makes the recompute for a stop just taken out stale when the trip is emptied", () => {
    // "Stop here" on Lubbock, then "Take this stop out" before the route
    // returns. The reset is an ask too, so the result for the trip through
    // Lubbock is stale and never lands on the empty trip.
    const seq = recomputeSequence();
    const ask = nextRecompute(seq, 1);
    expect(ask.kind).toBe("recompute");
    const id = ask.kind === "recompute" ? ask.id : -1;
    expect(nextRecompute(seq, 0)).toEqual({ kind: "reset" });
    expect(isCurrentRecompute(seq, id)).toBe(false);
    // Adding again after the reset is a new ask, and that one is current.
    const again = nextRecompute(seq, 1);
    expect(again).toEqual({ kind: "recompute", id: 3 });
    expect(isCurrentRecompute(seq, 3)).toBe(true);
    expect(isCurrentRecompute(seq, id)).toBe(false);
  });
});
