import { describe, it, expect } from "vitest";
import {
  parseDateMode,
  parseIsoDate,
  todayIso,
  daysUntil,
  formatDeadline,
  daysLeftPhrase,
  deadlineLine,
  longDate,
  countWord,
  daysFromNowPhrase,
  arrivalSentence,
} from "../deadline";

describe("deadline", () => {
  it("parses the mode: only the exact word arrival is arrival", () => {
    expect(parseDateMode("arrival")).toBe("arrival");
    for (const raw of ["range", "Arrival", "", undefined, null, 1, "arrival "]) expect(parseDateMode(raw)).toBe("range");
  });

  it("accepts only real calendar dates in ISO form", () => {
    expect(parseIsoDate("2026-10-14")).toBe("2026-10-14");
    expect(parseIsoDate("2024-02-29")).toBe("2024-02-29");
    for (const bad of ["2026-02-31", "2026-13-01", "14/10/2026", "2026-10-14T00:00:00Z", "", undefined, 20261014]) {
      expect(parseIsoDate(bad)).toBeUndefined();
    }
  });

  it("takes today in UTC from a given clock", () => {
    expect(todayIso(new Date("2026-09-27T23:59:00Z"))).toBe("2026-09-27");
    expect(todayIso(new Date("2026-09-28T00:00:00Z"))).toBe("2026-09-28");
  });

  it("counts whole calendar days, negative once passed, across a month end", () => {
    expect(daysUntil("2026-10-14", "2026-10-08")).toBe(6);
    expect(daysUntil("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysUntil("2026-10-14", "2026-10-16")).toBe(-2);
    expect(daysUntil("2026-10-01", "2026-09-30")).toBe(1);
  });

  it("formats the date the way the picker does", () => {
    expect(formatDeadline("2026-10-14")).toBe("Oct 14");
    expect(formatDeadline("2026-01-05")).toBe("Jan 5");
  });

  it("says today, tomorrow, days left, and how long ago", () => {
    expect(daysLeftPhrase(0)).toBe("today");
    expect(daysLeftPhrase(1)).toBe("tomorrow");
    expect(daysLeftPhrase(6)).toBe("6 days left");
    expect(daysLeftPhrase(-1)).toBe("yesterday");
    expect(daysLeftPhrase(-3)).toBe("3 days ago");
  });

  it("builds the one line every screen shows", () => {
    expect(deadlineLine({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-08" })).toBe(
      "Arrive in Austin by Oct 14, 6 days left"
    );
    expect(deadlineLine({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-14" })).toBe(
      "Arrive in Austin by Oct 14, today"
    );
  });

  it("says the plan sheet's arrival sentence for a fixed now: the date without this year's year, the count in words up to twenty", () => {
    // Gauntlet U3: the deadline line on the plan page becomes a sentence.
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-08" })).toBe(
      "Arrive in Austin by October 14, six days from now"
    );
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-14" })).toBe("Arrive in Austin by October 14, today");
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-13" })).toBe("Arrive in Austin by October 14, tomorrow");
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-28", today: "2026-10-08" })).toBe("Arrive in Austin by October 28, twenty days from now");
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-29", today: "2026-10-08" })).toBe("Arrive in Austin by October 29, 21 days from now");
    // Once passed, the same shapes as daysLeftPhrase.
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-15" })).toBe("Arrive in Austin by October 14, yesterday");
    expect(arrivalSentence({ toName: "Austin", endDate: "2026-10-14", today: "2026-10-17" })).toBe("Arrive in Austin by October 14, three days ago");
    // The year only when it is not this year.
    expect(longDate("2026-10-14", "2026-10-08")).toBe("October 14");
    expect(longDate("2027-01-05", "2026-12-30")).toBe("January 5, 2027");
    expect(arrivalSentence({ toName: "Austin", endDate: "2027-01-05", today: "2026-12-30" })).toBe("Arrive in Austin by January 5, 2027, six days from now");
    expect(countWord(0)).toBe("zero");
    expect(countWord(20)).toBe("twenty");
    expect(countWord(21)).toBe("21");
    expect(daysFromNowPhrase(-25)).toBe("25 days ago");
  });
});
