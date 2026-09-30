import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace, { RoadsideCard } from "@/components/PlanWorkspace";
import type { RoadsideMarker } from "@/lib/roadside/along";

/**
 * "Stop here" on the roadside card (Gauntlet U7; quality bar, rules 1, 3
 * and 4). U1 left this as a residual: a person could see a place worth
 * pulling over for and had no way to put it in their trip — the card
 * ended at "Open in Maps".
 */

const place: RoadsideMarker = {
  id: "osm:way:1",
  name: "The Big Texan Steak Ranch",
  lat: 35.19381,
  lng: -101.7551,
  kind: "notable",
  p: 0.83,
  about: "A large steakhouse and motel.",
  url: null,
  alongKm: 9,
};

const card = (props: Partial<React.ComponentProps<typeof RoadsideCard>> = {}) =>
  renderToString(<RoadsideCard stop={place} onToggleStop={() => {}} {...props} />).replace(/<!-- -->/g, "");

const button = (html: string) => /<button[^>]*data-roadside-add[^>]*>.*?<\/button>/.exec(html)?.[0] ?? "";

describe("putting a roadside place in the trip, from its card", () => {
  it("offers it in the same words a town uses, so one action has one name", () => {
    const html = card();
    expect(button(html)).toContain("+ Stop here");
    expect(button(html)).not.toContain("disabled");
    expect(button(html)).toContain('title="Stop here"');
  });

  it("says it is in the trip, and offers to take it out", () => {
    const html = card({ isAdded: true });
    expect(button(html)).toContain("✓ Added");
    expect(button(html)).toContain('title="Take this stop out"');
    // Still tappable when added: that is how it comes out again.
    expect(button(html)).not.toContain("disabled");
  });

  it("turns it off at the cap and says why beside it, not in its label", () => {
    // Quality bar rule 3: a disabled control says why in a sentence beside
    // it, never in its own label.
    const html = card({ atCap: true });
    expect(button(html)).toContain("disabled");
    expect(button(html)).toContain("+ Stop here");
    expect(button(html)).not.toContain("all the stops it can hold</button>");
    expect(html).toContain("The trip has all the stops it can hold; take one out to add another.");
  });

  it("keeps the control on for a place already in the trip even at the cap", () => {
    // Otherwise the only way out of a full trip would be somewhere else.
    const html = card({ isAdded: true, atCap: true });
    expect(button(html)).not.toContain("disabled");
    expect(button(html)).toContain("✓ Added");
    expect(html).not.toContain("take one out to add another");
  });

  it("makes putting it in the trip the loud control, and leaving the app the quiet one", () => {
    // U7 round 1 failed rule 3 here: the card's own action wore the quiet
    // outline while "Open in Maps", which leaves the app, was the only
    // gold thing on it. Weight, not words.
    const html = card();
    const maps = /<a [^>]*>\s*Open in Maps\s*<\/a>/.exec(html)?.[0] ?? "";
    expect(button(html)).toContain("bg-[#e3b341]");
    expect(button(html)).toContain("font-semibold");
    expect(maps).not.toContain("bg-[#e3b341]");
    expect(maps).toContain("border-[#30363d]");
  });

  it("makes the added state calm, not the brightest thing on the sheet", () => {
    // It must not be the most inviting target on the screen, because what
    // it does is take the stop back out.
    const html = card({ isAdded: true });
    expect(button(html)).toContain("bg-transparent");
    expect(button(html)).not.toContain("font-semibold");
    expect(button(html)).toContain("text-[#e3b341]");
  });

  it("draws no control at all when the screen does not offer the action", () => {
    // Rather than a dead button: the card is also rendered on its own.
    const html = renderToString(<RoadsideCard stop={place} />);
    expect(html).not.toContain("data-roadside-add");
    expect(html).toContain("Open in Maps");
  });

  it("puts the trip first and the way out of the app second", () => {
    // Rule 3: the one obvious action on this card is the trip, not a link
    // that leaves for Google Maps.
    const html = card();
    expect(html.indexOf("data-roadside-add")).toBeLessThan(html.indexOf("Open in Maps"));
  });
});

describe("a roadside place that became a stop", () => {
  const base = {
    origin: { lat: 35.2073, lng: -101.8338 },
    destination: { lat: 30.2672, lng: -97.7431 },
    encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    candidateMarkers: [],
    waypointFetch: { status: "fresh" as const, cities: [], waypoints: [], neighborhoods: {} },
    initialMoods: [] as const,
    budgetHours: 4,
    initialDistanceMeters: 800_000,
    initialDurationSeconds: 29_000,
    fromName: "Amarillo",
    toName: "Austin",
  };

  it("is carried into the sheet as a stop under its own name", () => {
    // The saved trip's stop list is keyed by `cityId`, and a roadside
    // place is not a city; it goes in under its own id and its own name,
    // and the sheet reads it as the end of a day like any other stop.
    const html = renderToString(
      <PlanWorkspace
        {...base}
        roadsideStops={[place]}
        initialTrip={{
          stops: [{ cityId: place.id, cityName: place.name, lat: place.lat, lng: place.lng }],
          legs: [],
          directMinutesToDestination: 0,
        }}
      />
    );
    expect(html).toContain(place.name);
    // And it does not pretend to be a town with places inside it.
    expect(html).not.toContain(`What&#x27;s in ${place.name}`);
  });
});
