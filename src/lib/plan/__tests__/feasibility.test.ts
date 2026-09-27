import { describe, it, expect } from "vitest";
import { maxNights, feasibility, feasibilityLine, numberWord } from "../feasibility";
import { driveMinutesBetween, driveGraphPaceMinutesPerKm, allCities } from "@/lib/atlas/queries";
import { haversineKm } from "@/lib/routing/polyline";

const BY = { toName: "Austin", endDate: "2026-10-14" };

describe("maxNights, the arithmetic", () => {
  // Five-hour budget. Reach the city today; two driving days on to the destination.
  it("counts nights between reaching the city and the driving days still needed", () => {
    const base = { daysToDeadline: 3, budgetMinutes: 300, minutesToCity: 100, minutesCityToDestination: 320 };
    expect(maxNights(base)).toBe(2);
    expect(maxNights({ ...base, daysToDeadline: 1 })).toBe(0);   // pass through
    expect(maxNights({ ...base, daysToDeadline: 0 })).toBe(-1);  // a day late
  });

  it("charges the days it takes to reach the city, beyond today", () => {
    // 700 minutes to the city on a 300-minute budget is three driving days: arrive day 2.
    expect(maxNights({ daysToDeadline: 5, budgetMinutes: 300, minutesToCity: 700, minutesCityToDestination: 100 })).toBe(3);
  });

  it("treats the destination itself as every remaining day being a night", () => {
    expect(maxNights({ daysToDeadline: 4, budgetMinutes: 300, minutesToCity: 100, minutesCityToDestination: 0 })).toBe(4);
  });

  it("uses the same overnight quantization as the plan page: 301 minutes is two days on a 300 budget", () => {
    const a = maxNights({ daysToDeadline: 3, budgetMinutes: 300, minutesToCity: 60, minutesCityToDestination: 300 });
    const b = maxNights({ daysToDeadline: 3, budgetMinutes: 300, minutesToCity: 60, minutesCityToDestination: 301 });
    expect(a - b).toBe(1);
  });

  it("refuses a non-positive budget", () => {
    expect(() => maxNights({ daysToDeadline: 3, budgetMinutes: 0, minutesToCity: 1, minutesCityToDestination: 1 })).toThrow(/positive/);
  });
});

describe("the sentence", () => {
  it("has three shapes, with small numbers as words", () => {
    expect(feasibilityLine({ kind: "nights", nights: 2 }, { ...BY, estimated: false })).toBe(
      "Two nights here and you still make Austin by Oct 14."
    );
    expect(feasibilityLine({ kind: "nights", nights: 1 }, { ...BY, estimated: false })).toBe(
      "One night here and you still make Austin by Oct 14."
    );
    expect(feasibilityLine({ kind: "pass-through" }, { ...BY, estimated: false })).toBe(
      "Pass through today and you still make Austin by Oct 14."
    );
    expect(feasibilityLine({ kind: "late", daysLate: 1 }, { ...BY, estimated: false })).toBe(
      "Stop here and you miss Austin: one day late even driving straight on."
    );
    expect(feasibilityLine({ kind: "late", daysLate: 3 }, { ...BY, estimated: false })).toBe(
      "Stop here and you miss Austin: three days late even driving straight on."
    );
  });

  it("says Roughly up front when the minutes were estimated", () => {
    expect(feasibilityLine({ kind: "nights", nights: 3 }, { ...BY, estimated: true })).toBe(
      "Roughly three nights here and you still make Austin by Oct 14."
    );
    expect(feasibilityLine({ kind: "pass-through" }, { ...BY, estimated: true })).toBe(
      "Roughly pass through today and you still make Austin by Oct 14."
    );
  });

  it("spells numbers to ten and uses digits past it", () => {
    expect(numberWord(2)).toBe("two");
    expect(numberWord(10)).toBe("ten");
    expect(numberWord(11)).toBe("11");
    expect(feasibilityLine({ kind: "nights", nights: 12 }, { ...BY, estimated: false })).toContain("12 nights here");
  });
});

/**
 * Five hand-checked cases against the real graph, budget five hours unless
 * said. The graph's minutes on 2026-09-27:
 *   Amarillo to Lubbock        99.7   (fits today)
 *   Amarillo to Oklahoma City 202.4   (fits today)
 *   Amarillo to Albuquerque   225.0   (fits today)
 *   Lubbock to Austin         321.5   (two driving days on 300)
 *   Oklahoma City to Austin   312.3   (two driving days on 300)
 *   Albuquerque to Austin      none   (about 990 km straight, past the 650 km neighbourhood)
 */
describe("five hand-checked cases on the real graph", () => {
  const city = (id: string) => {
    const c = allCities().find((x) => x.id === id);
    if (!c) throw new Error(`atlas has no ${id}`);
    return c;
  };
  const line = (cityId: string, daysToDeadline: number, budgetHours: number) => {
    const exact = driveMinutesBetween(cityId, "austin");
    const toDest = exact ?? haversineKm(city(cityId), city("austin")) * driveGraphPaceMinutesPerKm();
    const minutesToCity = driveMinutesBetween("amarillo", cityId);
    if (minutesToCity === null) throw new Error(`no graph row amarillo -> ${cityId}`);
    return feasibilityLine(
      feasibility({ daysToDeadline, budgetMinutes: budgetHours * 60, minutesToCity, minutesCityToDestination: toDest }),
      { ...BY, estimated: exact === null }
    );
  };

  it("1. Lubbock, deadline in three days: arrive today, two days on, so two nights", () => {
    // D=3, arrive day 0, daysOn=ceil(321.5/300)=2: 3 - 0 - (2-1) = 2
    expect(line("lubbock-tx", 3, 5)).toBe("Two nights here and you still make Austin by Oct 14.");
  });

  it("2. Oklahoma City, deadline in four days: arrive today, two days on, so three nights", () => {
    // D=4, arrive day 0, daysOn=ceil(312.3/300)=2: 4 - 0 - 1 = 3
    expect(line("oklahoma-city", 4, 5)).toBe("Three nights here and you still make Austin by Oct 14.");
  });

  it("3. Lubbock, deadline tomorrow, four-hour budget: pass through", () => {
    // D=1, arrive day 0 (99.7 <= 240), daysOn=ceil(321.5/240)=2: 1 - 0 - 1 = 0
    expect(line("lubbock-tx", 1, 4)).toBe("Pass through today and you still make Austin by Oct 14.");
  });

  it("4. Albuquerque, deadline in five days: no graph pair, so Roughly, and three nights", () => {
    // straight line about 990 km at the graph's median pace 0.7355 min/km is about 728 minutes,
    // ceil(728/300)=3 driving days on: 5 - 0 - 2 = 3
    expect(driveMinutesBetween("albuquerque", "austin")).toBeNull();
    const est = haversineKm(city("albuquerque"), city("austin")) * driveGraphPaceMinutesPerKm();
    expect(est).toBeGreaterThan(690);
    expect(est).toBeLessThan(770);
    expect(line("albuquerque", 5, 5)).toBe("Roughly three nights here and you still make Austin by Oct 14.");
  });

  it("5. Lubbock, deadline today: no. One day late even driving straight on", () => {
    // D=0, arrive day 0, daysOn=2: 0 - 0 - 1 = -1
    expect(line("lubbock-tx", 0, 5)).toBe("Stop here and you miss Austin: one day late even driving straight on.");
  });

  it("the graph's pace is a road-trip number, not a typo", () => {
    const pace = driveGraphPaceMinutesPerKm();
    expect(pace).toBeGreaterThan(0.6);   // faster than 100 km/h straight-line would be suspicious
    expect(pace).toBeLessThan(0.9);      // slower than 67 km/h would be too
  });
});
