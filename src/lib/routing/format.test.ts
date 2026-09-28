import { describe, it, expect } from "vitest";
import { formatDuration, formatDurationPlain, formatDistance } from "./format";

describe("formatDurationPlain", () => {
  it("says a duration the way a person does", () => {
    expect(formatDurationPlain(4 * 3600)).toBe("4 h");
    expect(formatDurationPlain(80 * 60)).toBe("1 h 20 min");
    expect(formatDurationPlain(45 * 60)).toBe("45 min");
    expect(formatDurationPlain(0)).toBe("0 min");
  });

  it("gives a negative duration one leading minus, never one per part", () => {
    expect(formatDurationPlain(-5400)).toBe("-1 h 30 min");
    expect(formatDurationPlain(-3600)).toBe("-1 h");
    expect(formatDurationPlain(-45 * 60)).toBe("-45 min");
    expect(formatDurationPlain(-5400)).not.toContain("h -");
  });

  it("puts no sign on a zero, whichever side it came from", () => {
    expect(formatDurationPlain(-30)).toBe("0 min");
  });
});

describe("formatDuration", () => {
  it("keeps the compact form for the tables", () => {
    expect(formatDuration(4 * 3600)).toBe("4h");
    expect(formatDuration(80 * 60)).toBe("1h 20m");
    expect(formatDuration(45 * 60)).toBe("45m");
  });
});

describe("formatDistance", () => {
  it("rounds meters to whole miles", () => {
    expect(formatDistance(1609.34)).toBe("1 mi");
    expect(formatDistance(16093.4)).toBe("10 mi");
  });
});
