// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";

const recomputeAndRefreshAction = vi.fn();
vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: (...args: unknown[]) => recomputeAndRefreshAction(...args),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import type { RoadsideMarker } from "@/lib/roadside/along";

/**
 * The plan sheet driven by real clicks in a real DOM (issue #95).
 *
 * The rest of this project's suite renders to a string on the server, so
 * it sees markup and never a handler. Three fixes from round 2 lived in
 * handlers and effects and were provably unguarded: reverting any of them
 * left the whole suite green. These are the tests that would have gone
 * red, and each one names the mutation it exists to catch.
 */

afterEach(cleanup);
beforeEach(() => {
  recomputeAndRefreshAction.mockReset();
  // A shape the component can handle. Returning undefined makes it throw
  // on `result.ok` inside the transition, which is noise from the harness
  // rather than anything about the app.
  recomputeAndRefreshAction.mockResolvedValue({ ok: false, error: "internal_error" });
  // jsdom implements no layout, so it has neither of these. The sheet
  // scrolls an opened card into view and measures itself on a drag; both
  // are real browser behaviour and neither is what these tests are about.
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

const chip = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
const pressed = () =>
  screen.queryAllByRole("button", { pressed: true }).map((b) => b.textContent?.trim()).filter(Boolean);

describe("two mood taps in one tick", () => {
  it("keeps both, instead of the second undoing the first", () => {
    // The mutation this catches: `setChosenMoods(toggleMood(chosenMoods, m))`
    // reading the value from the handler's closure instead of
    // `setChosenMoods((curr) => toggleMood(curr, m))`. Two clicks dispatched
    // before React re-renders then both read the same empty array, and the
    // second overwrites the first, so only one chip ends up on.
    render(<PlanWorkspace {...base} />);
    const food = chip("Food");
    const outdoors = chip("Outdoors");

    act(() => {
      food.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      outdoors.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(pressed().sort()).toEqual(["Food", "Outdoors"]);
  });

  it("still honours the two-at-a-time rule when the taps arrive together", () => {
    render(<PlanWorkspace {...base} />);
    act(() => {
      for (const label of ["Food", "Outdoors", "Museums"]) {
        chip(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
    // The third drops the one chosen longest ago, which is Food.
    expect(pressed().sort()).toEqual(["Museums", "Outdoors"]);
  });
});

describe("the mood chips as a multi-select, through real clicks", () => {
  it("turns a chip on, and off again on a second tap", () => {
    render(<PlanWorkspace {...base} />);
    fireEvent.click(chip("Food"));
    expect(pressed()).toEqual(["Food"]);
    fireEvent.click(chip("Food"));
    expect(pressed()).toEqual([]);
  });

  it("tells a screen reader the group takes two, and never marks a third", () => {
    render(<PlanWorkspace {...base} />);
    expect(screen.getByRole("group", { name: /choose up to 2/i })).toBeTruthy();
    for (const label of ["Food", "Outdoors", "Museums", "Art"]) fireEvent.click(chip(label));
    expect(pressed()).toHaveLength(2);
  });
});

describe("the city sent with a recompute", () => {
  const withTown = {
    ...base,
    candidateMarkers: [{ id: "lubbock", name: "Lubbock", lat: 33.5779, lng: -101.8552, detourMinutes: 12 }],
    initialTrip: {
      stops: [{ cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 }],
      legs: [],
      directMinutesToDestination: 0,
    },
  };

  it("is the last stop that is a town, not the roadside place added after it", () => {
    // The mutation this catches: taking the last stop outright
    // (`stopsForRequest[stopsForRequest.length - 1]?.cityId`). With a
    // roadside place added after a town that sends an OSM id, which the
    // server refuses outright; guarding it with `isCityId` but *not*
    // searching backwards sends nothing, and the towns behind the roadside
    // stop quietly stop refreshing. Both are wrong; only the backward
    // search is right.
    const { container } = render(<PlanWorkspace {...withTown} roadsideStops={[place]} />);
    fireEvent.click(container.querySelector(`[data-roadside-stop="${place.id}"] button`)!);
    fireEvent.click(container.querySelector("[data-roadside-add]")!);

    expect(recomputeAndRefreshAction).toHaveBeenCalled();
    const call = recomputeAndRefreshAction.mock.calls.at(-1)!;
    const stops = call[2] as Array<{ cityId: string }>;
    const selectedCityId = call[4];
    expect(stops.map((s) => s.cityId)).toEqual(["lubbock", place.id]);
    expect(selectedCityId).toBe("lubbock");
    expect(selectedCityId).not.toBe(place.id);
    expect(selectedCityId).toBeDefined();
  });
});


/**
 * Not here, and deliberately: the `stopTowns` cleanup on a roadside toggle
 * (#96, council round 2).
 *
 * I wrote a test for it, and the mutation proved the test worthless —
 * removing the cleanup left it green. A lingering entry adds a city to
 * `sheetFetch`, but whether a town section is drawn comes from the day's
 * candidate towns, not from that, so the leak has no mark on the page. The
 * council called it "simulated town state leaking in memory over long
 * sessions", which is exactly right, and memory is not a thing a DOM test
 * can see. It stays unguarded and this comment is the record of why,
 * rather than a passing test that implies otherwise.
 */


describe("a saved trip, reopened (U9)", () => {
  it("sends both stops, in the order they were saved, the moment the sheet opens", () => {
    // The proof that a reopen restored the trip: the sheet recomputes the
    // route through its stops when it opens with any, and the payload is
    // what the server is asked for. Independent of how each stop is drawn,
    // which U10 changed for roadside places.
    const town = { cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 };
    const visit = { cityId: place.id, cityName: place.name, lat: place.lat, lng: place.lng };
    render(<PlanWorkspace {...base} initialTrip={{ stops: [visit, town], legs: [], directMinutesToDestination: 0 }} />);
    expect(recomputeAndRefreshAction).toHaveBeenCalled();
    const stops = recomputeAndRefreshAction.mock.calls.at(-1)![2] as Array<{ cityId: string }>;
    expect(stops.map((s) => s.cityId)).toEqual([place.id, "lubbock"]);
  });
});
