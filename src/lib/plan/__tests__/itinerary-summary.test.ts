import { describe, it, expect } from "vitest";
import { itinerarySummary } from "../itinerary-summary";
import { formatDuration } from "@/lib/routing/format";

describe("itinerarySummary", () => {
  it("says the count, the names and the total drive in one line", () => {
    const line = itinerarySummary(
      [{ cityName: "Lubbock" }, { cityName: "Austin" }],
      [100 * 60, 320 * 60],
      20 * 60
    );
    expect(line).toBe(`2 stops · Lubbock, Austin · ${formatDuration(440 * 60)}`);
  });

  it("uses the singular for one stop and leaves out a drive it does not know", () => {
    expect(itinerarySummary([{ cityName: "Lubbock" }], [], 0)).toBe("1 stop · Lubbock");
    expect(itinerarySummary([{ cityName: "Lubbock" }], [NaN], NaN)).toBe("1 stop · Lubbock");
  });

  it("says 0 stops with nothing else when the trip is empty", () => {
    expect(itinerarySummary([], [], 0)).toBe("0 stops");
  });
});
