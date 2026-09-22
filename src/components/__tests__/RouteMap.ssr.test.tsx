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
