import { describe, it, expect } from "vitest";
import { tripDays, type TripDaysInput } from "@/lib/plan/days";
import { lastTownLine } from "@/lib/plan/words";

// Amarillo to Austin: 457 min, 795 km; Lubbock 190 km along. At 240 min a
// day the cut lands near km 417, with no town within reach of it.
const base: TripDaysInput = {
  fromName: "Amarillo",
  toName: "Austin",
  stops: [],
  legMinutes: [457],
  roadLengthKm: 795,
  towns: [{ id: "lubbock-tx", name: "Lubbock", alongKm: 190 }],
  roadside: [],
  budgetMinutesPerDay: 240,
};

describe("the last town before the day runs out (U18)", () => {
  it("names the farthest town along when the day ends on open road", () => {
    const days = tripDays({
      ...base,
      towns: [
        { id: "plainview", name: "Plainview", alongKm: 120 },
        { id: "lubbock-tx", name: "Lubbock", alongKm: 190 },
      ],
    });
    expect(days[0].endKind).toBe("hours");
    expect(lastTownLine(days[0])).toBe("Lubbock is the last town before your 4 h are up");
  });

  it("picks the farthest by distance along, not by list order", () => {
    const days = tripDays({
      ...base,
      towns: [
        { id: "lubbock-tx", name: "Lubbock", alongKm: 190 },
        { id: "plainview", name: "Plainview", alongKm: 120 },
      ],
    });
    expect(lastTownLine(days[0])).toBe("Lubbock is the last town before your 4 h are up");
  });

  it("says \"only\" when there is one town, since \"last\" would imply others", () => {
    expect(lastTownLine(tripDays(base)[0])).toBe("Lubbock is the only town before your 4 h are up");
  });

  it("says nothing when a town is near where the day ends", () => {
    const days = tripDays({ ...base, towns: [...base.towns, { id: "snyder", name: "Snyder", alongKm: 410 }] });
    expect(days[0].endKind).toBe("near");
    expect(lastTownLine(days[0])).toBeNull();
  });

  it("says nothing when the day ends at the destination", () => {
    const days = tripDays({ ...base, budgetMinutesPerDay: 480 });
    expect(days).toHaveLength(1);
    expect(lastTownLine(days[0])).toBeNull();
  });

  it("says nothing when no town fits", () => {
    const days = tripDays({ ...base, towns: [] });
    expect(lastTownLine(days[0])).toBeNull();
  });

  it("says nothing on a day that does not hold the towns", () => {
    const days = tripDays(base);
    expect(days[1].holdsTowns).toBe(false);
    expect(lastTownLine({ ...days[1], endKind: "hours", towns: [...base.towns] })).toBeNull();
  });

  it("says nothing while the day's drive is not known", () => {
    const days = tripDays(base);
    expect(lastTownLine({ ...days[0], minutes: null })).toBeNull();
  });
});
