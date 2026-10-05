// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn().mockResolvedValue({ ok: false, error: "internal_error" }),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import type { RoadsideMarker } from "@/lib/roadside/along";

/**
 * A roadside stop, once it is in the trip (Gauntlet U8; #99, #97).
 */

afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const place: RoadsideMarker = {
  id: "osm:way:1", name: "The Big Texan Steak Ranch", lat: 35.19381, lng: -101.7551,
  kind: "notable", p: 0.83, about: "A large steakhouse.", url: null, alongKm: 9,
};

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

const reloaded = {
  stops: [{ cityId: place.id, cityName: place.name, lat: place.lat, lng: place.lng }],
  legs: [],
  directMinutesToDestination: 0,
};

const row = (c: HTMLElement) => c.querySelector(`[data-roadside-stop="${place.id}"] button`) as HTMLElement;

/**
 * #99 is latent. No page passes `initialTrip` — only tests like these do —
 * and TripCard's resume link leaves stops out on purpose, so no user can
 * reach a sheet seeded with a roadside stop today. These hold the seeding
 * logic for the day stops are serialised.
 */
describe("#99 — a roadside stop in a reloaded trip", () => {
  it("is not drawn as a town", () => {
    // The mutation this catches: seeding `stopTowns` from every stop in
    // `initialTrip.stops` instead of only atlas cities. Every entry there
    // becomes a city `sheetFetch` lists, so a steakhouse got a town
    // section of its own on reload — which the U7 spec forbade.
    const { container } = render(<PlanWorkspace {...base} roadsideStops={[place]} initialTrip={reloaded} />);
    expect(container.querySelector(`[data-town="${place.id}"]`)).toBeNull();
  });

  it("still keeps a real town's section when the reloaded trip holds one", () => {
    // The fix filters to atlas cities; it must not throw towns out too.
    const town = { cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 };
    const { container } = render(
      <PlanWorkspace
        {...base}
        roadsideStops={[place]}
        initialTrip={{ ...reloaded, stops: [town, ...reloaded.stops] }}
      />
    );
    expect(container.querySelector('[data-town="lubbock"]')).not.toBeNull();
    expect(container.querySelector(`[data-town="${place.id}"]`)).toBeNull();
  });
});

describe("#97 — a place in the trip, in the day's list", () => {
  it("says it is in the trip, in words, where its kind was", () => {
    const { container } = render(<PlanWorkspace {...base} roadsideStops={[place]} initialTrip={reloaded} />);
    expect(row(container).textContent).toContain("✓ In the trip");
    expect(row(container).textContent).not.toContain("well-known place");
    expect(row(container).getAttribute("data-in-trip")).toBe("true");
  });

  it("says nothing of the kind for a place that is not in the trip", () => {
    const { container } = render(<PlanWorkspace {...base} roadsideStops={[place]} />);
    expect(row(container).textContent).not.toContain("In the trip");
    expect(row(container).textContent).toContain("well-known place");
    expect(row(container).hasAttribute("data-in-trip")).toBe(false);
  });

  it("starts saying it the moment the place is added, and stops when it is taken out", () => {
    // The row and the card must agree at every moment — the whole of #97.
    const { container } = render(<PlanWorkspace {...base} roadsideStops={[place]} />);
    fireEvent.click(row(container));
    fireEvent.click(container.querySelector("[data-roadside-add]")!);
    expect(row(container).textContent).toContain("✓ In the trip");
    fireEvent.click(container.querySelector("[data-roadside-add]")!);
    expect(row(container).textContent).not.toContain("In the trip");
  });

  it("does not add a line to the row", () => {
    // ROADSIDE_LIST_PX has one pixel of slack; a third line would spend
    // it. The mark replaces the kind on the second line instead.
    const { container } = render(<PlanWorkspace {...base} roadsideStops={[place]} initialTrip={reloaded} />);
    const blocks = row(container).querySelectorAll(":scope > span.block");
    expect(blocks.length).toBe(2);
  });
});
