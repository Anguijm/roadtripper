import { detourNoteLine } from "../words";
import { describe, it, expect } from "vitest";
import { budgetWords, dayHeadingLine } from "../words";

/**
 * The trip's driving budget, as the sheet says it (Gauntlet U11). A trip
 * only has a total budget when it has dates.
 */

const base = { budgetMinutesPerDay: 240, toName: "Austin" };

describe("an undated trip", () => {
  it("never warns: it has no total budget to be tight against", () => {
    // The screenshot that started U11: a three-day trip, no dates, read
    // "Tight: 5 h 57 min straight on to Austin, with 2 h of driving left".
    const w = budgetWords({
      ...base,
      trip: { dated: false as const },
      status: { kind: "warning", remainingBudgetMinutes: 121, directMinutesToDestination: 357 },
      dayOneMinutes: 119,
    });
    expect(w.box).toBeNull();
  });

  it("never says over budget either, however long the trip", () => {
    const w = budgetWords({ ...base, trip: { dated: false as const }, status: { kind: "over_budget", overageMinutes: 300 }, dayOneMinutes: 119 });
    expect(w.box).toBeNull();
    expect(w.line).not.toContain("more driving than fits");
  });

  it("says what is left of day 1's hours as spare once a stop ends day 1 (U27: not \"left today\")", () => {
    const w = budgetWords({
      ...base,
      trip: { dated: false as const },
      status: { kind: "in_progress", remainingBudgetMinutes: 0, directMinutesToDestination: 0 },
      dayOneMinutes: 119,
    });
    expect(w.line).toBe("2 h 1 min to spare on day 1");
  });

  it("counts only day 1, not every leg in the trip", () => {
    // Two overnights: day 1 to Lubbock is 110 minutes, day 2 to Abilene
    // another 150. The old line was one day's hours less *every* leg —
    // 240 - 260 — and so read as over budget on a trip with room to spare
    // on its first day. Day 1 alone leaves 130.
    const w = budgetWords({
      ...base,
      trip: { dated: false as const },
      status: { kind: "over_budget", overageMinutes: 20 },
      dayOneMinutes: 110,
    });
    expect(w.line).toBe("2 h 10 min to spare on day 1");
    expect(w.box).toBeNull();
  });

  it("has the whole day left before anything is planned, or while day 1 is still being worked out", () => {
    expect(budgetWords({ ...base, trip: { dated: false as const }, status: { kind: "empty" }, dayOneMinutes: null }).line).toBe("4 h of driving left today");
    expect(
      budgetWords({ ...base, trip: { dated: false as const }, status: { kind: "in_progress", remainingBudgetMinutes: 0, directMinutesToDestination: 0 }, dayOneMinutes: null }).line
    ).toBe("4 h of driving left today");
  });

  it("adds up with day 1's heading, which shows whole minutes cut, not rounded (U27 critic)", () => {
    // Day 1 is 145.6 min: its heading says "2 h 25 min" (dayHeadingLine),
    // so on a 4 h day the spare is 1 h 35 min, not 240 - 145.6 = 94.4 → "1 h 34 min".
    const w = budgetWords({ ...base, trip: { dated: false as const }, status: { kind: "in_progress", remainingBudgetMinutes: 0, directMinutesToDestination: 0 }, dayOneMinutes: 145.6 });
    expect(dayHeadingLine({ index: 0, fromKind: "start", fromName: "Reno", endKind: "stop", toName: "Winnemucca", minutes: 145.6 })).toBe("Day 1 · Reno to Winnemucca · 2 h 25 min");
    expect(w.line).toBe("1 h 35 min to spare on day 1");
  });

  it("does not go below nothing when day 1 runs the whole budget", () => {
    const w = budgetWords({ ...base, trip: { dated: false as const }, status: { kind: "in_progress", remainingBudgetMinutes: 0, directMinutesToDestination: 0 }, dayOneMinutes: 240 });
    expect(w.line).toBe("No time to spare on day 1");
  });
});

describe("a dated trip", () => {
  const dated = { ...base, trip: { dated: true as const, days: 3 }, dayOneMinutes: 119 };

  it("keeps its warning, because it does have a total to be tight against", () => {
    const w = budgetWords({ ...dated, status: { kind: "warning", remainingBudgetMinutes: 90, directMinutesToDestination: 100 } });
    expect(w.box?.kind).toBe("warning");
  });

  it("says the span in the warning, so the two numbers no longer read as a contradiction", () => {
    // The old box: "Tight: 5 h 57 min straight on to Austin, with 2 h of
    // driving left" — two figures with nothing saying what each covered.
    const w = budgetWords({ ...dated, status: { kind: "warning", remainingBudgetMinutes: 90, directMinutesToDestination: 100 } });
    expect(w.box?.text).toBe("Tight: 1 h 40 min still to drive to Austin, and 1 h 30 min of driving left over 3 days.");
  });

  it("says when it is over, in the box and the line", () => {
    const w = budgetWords({ ...dated, status: { kind: "over_budget", overageMinutes: 45 } });
    expect(w.box).toEqual({ kind: "over_budget", text: "45 min more driving than fits over 3 days." });
    expect(w.line).toBe("45 min more driving than fits over 3 days");
  });

  it("says nothing in a box when it is comfortably inside its budget", () => {
    expect(budgetWords({ ...dated, status: { kind: "in_progress", remainingBudgetMinutes: 400, directMinutesToDestination: 100 } }).box).toBeNull();
  });

  it("says today for a one-day dated trip", () => {
    expect(budgetWords({ ...dated, trip: { dated: true, days: 1 }, status: { kind: "empty" } }).line).toBe("4 h of driving left today");
  });
});


describe("why a town out of the way is offered (U30)", () => {
  it("says the spare days and how many, in words a person says", () => {
    expect(detourNoteLine(3, 1)).toBe("3 days to spare, so here's a town a bit out of the way");
    expect(detourNoteLine(1, 2)).toBe("1 day to spare, so here are 2 towns a bit out of the way");
  });
});
