import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import Itinerary, { type ItineraryProps } from "@/components/Itinerary";

/**
 * The itinerary when the legs and the stops differ in length (council round
 * 1 on #85, item 4). The legs lag the stops: a stop is in the list before
 * its recompute returns and stays there when that recompute fails, so
 * `legDurations` can be shorter than `stops`, longer, or absent. A stop
 * with no leg is drawn without a drive time; nothing prints "NaN".
 */

const stops = [
  { cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 },
  { cityId: "abilene", cityName: "Abilene", lat: 32.4487, lng: -99.7331 },
  { cityId: "round-rock", cityName: "Round Rock", lat: 30.5083, lng: -97.6789 },
];

const render = (props: Partial<ItineraryProps>) =>
  renderToString(
    <Itinerary fromName="Amarillo" toName="Austin" stops={stops} onRemoveStop={() => {}} accent="#bc8cff" {...props} />
  )
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");

/** How many drive-time lines the markup carries ("2 h 5 min of driving"). */
const driving = (html: string) => (html.match(/of driving/g) ?? []).length;

describe("the itinerary when the legs are fewer, more, or absent", () => {
  it("draws a stop with no leg without a drive time, and never NaN, when the legs are fewer than the stops", () => {
    let html = "";
    expect(() => {
      html = render({ legDurations: [7_500], finalLegSeconds: 12_000 });
    }).not.toThrow();
    for (const s of stops) expect(html).toContain(s.cityName);
    expect(html).toContain("2 h 5 min"); // the one leg there is
    expect(driving(html)).toBe(2); // that leg and the final leg, not one per stop
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("undefined");
  });

  it("draws every stop with no drive time at all when no legs are known yet", () => {
    let html = "";
    expect(() => {
      html = render({});
    }).not.toThrow();
    for (const s of stops) expect(html).toContain(s.cityName);
    expect(driving(html)).toBe(0);
    expect(html).not.toContain("NaN");
  });

  it("ignores legs past the last stop", () => {
    const html = render({ stops: stops.slice(0, 1), legDurations: [7_500, 6_000, 5_000], finalLegSeconds: 12_000 });
    expect(driving(html)).toBe(2);
    expect(html).not.toContain("1 h 40 min"); // the second leg, which has no stop
    expect(html).not.toContain("NaN");
  });

  it("says the stop didn't update, and no drive time, on the stop whose recompute failed", () => {
    const html = render({ legDurations: [7_500, 6_000, 5_000], finalLegSeconds: 12_000, failedStopId: "abilene" });
    expect(html).toContain("Didn't update");
    expect(driving(html)).toBe(3); // the other two stops' legs and the final leg
    expect(html).not.toContain("1 h 40 min");
  });
});
