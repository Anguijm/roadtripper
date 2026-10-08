import { describe, it, expect } from "vitest";
import { rowBadges } from "../RecommendationList";

const row = (waypointId: string, tier: "primary" | "secondary" | "other") => ({ waypointId, tier });

describe("one pick per town (U24)", () => {
  it("gives the pick to the first primary place only; other primaries and secondaries are Also good; the rest nothing", () => {
    const rows = [row("a", "secondary"), row("b", "primary"), row("c", "primary"), row("d", "other")];
    const b = rowBadges(rows, false);
    expect([...b.entries()]).toEqual([["a", "good"], ["b", "pick"], ["c", "good"], ["d", null]]);
    expect([...b.values()].filter((x) => x === "pick")).toHaveLength(1);
  });

  it("names the pick wherever it sits, the lead included (U44)", () => {
    const b = rowBadges([row("a", "primary"), row("b", "primary")], false);
    expect(b.get("a")).toBe("pick");
    expect(b.get("b")).toBe("good");
  });

  it("gives a town out of the way no pick at all", () => {
    const b = rowBadges([row("x", "secondary"), row("a", "primary"), row("b", "primary")], true);
    expect([...b.values()]).toEqual(["good", "good", "good"]);
  });
});
