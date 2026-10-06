import { describe, it, expect, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import RouteMap from "@/components/RouteMap";

/**
 * Regression guard for the crash that took the plan page down on 2026-09-22.
 *
 * Every direct load of /plan returned "SOMETHING WENT WRONG" because RouteMap
 * dereferenced `google.maps.ControlPosition` in the JSX props of <GMap>, which
 * is evaluated during render. The `google` global only exists in a browser, so
 * the server render threw `ReferenceError: google is not defined`.
 *
 * "use client" does NOT make a component client-only in the App Router: it is
 * still server-rendered for the first HTML. The bug stayed invisible for months
 * because clicking PLAN ROUTE from the home page is a client-side navigation,
 * so the map first rendered in the browser. Only a direct URL, a refresh or a
 * shared link hit the server render.
 *
 * vitest's `node` environment has no `google` global, which is exactly the
 * condition the server render runs under. Any new `google.*` reference on a
 * render path will fail here.
 */
describe("RouteMap server rendering", () => {
  beforeAll(() => {
    // Without a key RouteMap early-returns a placeholder and never reaches the
    // map, which would make these tests pass for the wrong reason.
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("runs in an environment with no google global, like the server", () => {
    expect(
      (globalThis as Record<string, unknown>).google
    ).toBeUndefined();
  });

  it("renders with a route without touching the google global", () => {
    expect(() =>
      renderToString(
        <RouteMap
          origin={{ lat: 40.7128, lng: -74.006 }}
          destination={{ lat: 34.0549, lng: -118.2426 }}
          encodedPolyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
          candidates={[
            { id: "philadelphia", name: "Philadelphia", lat: 39.9526, lng: -75.1652, detourMinutes: 225 },
          ]}
          tripStops={[{ cityId: "philadelphia", cityName: "Philadelphia", lat: 39.9526, lng: -75.1652 }]}
          routeColor="#58a6ff"
        />
      )
    ).not.toThrow();
  });

  it("renders the no-route fallback without touching the google global", () => {
    expect(() => renderToString(<RouteMap />)).not.toThrow();
  });

  it("renders zero-state (empty candidates and stops) without throwing", () => {
    // Council R1 (bugs): the populated cases would not catch an unguarded
    // array[0] on a render path. Empty arrays exercise those branches.
    expect(() =>
      renderToString(
        <RouteMap
          origin={{ lat: 40.7128, lng: -74.006 }}
          destination={{ lat: 34.0549, lng: -118.2426 }}
          encodedPolyline=""
          candidates={[]}
          tripStops={[]}
          roadsideStops={[]}
        />
      )
    ).not.toThrow();
  });

  it("renders the missing-key placeholder without touching the google global", () => {
    const saved = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    try {
      expect(() => renderToString(<RouteMap />)).not.toThrow();
    } finally {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = saved;
    }
  });
});


describe("a trip stop's name on the map (U12)", () => {
  it("names a town stop, which is where a day ends", async () => {
    const { tripStopLabel } = await import("@/components/RouteMap");
    expect(tripStopLabel({ cityId: "lubbock", cityName: "Lubbock" })?.text).toBe("Lubbock");
  });

  it("does not name a roadside visit, which ends no day and was printed over the town beside it", async () => {
    // The Big Texan, six miles out of Amarillo, was drawn on top of
    // "Amarillo" so neither could be read; three critics named it. A visit
    // keeps its numbered square and its name stays in the marker's title.
    const { tripStopLabel } = await import("@/components/RouteMap");
    expect(tripStopLabel({ cityId: "osm:way:1059981743", cityName: "The Big Texan Steak Ranch" })).toBeUndefined();
  });
});
