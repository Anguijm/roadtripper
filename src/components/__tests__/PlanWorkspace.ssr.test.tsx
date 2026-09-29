import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";

/**
 * Server-render guard for the whole plan tree, which is what /health renders.
 *
 * Complements RouteMap.ssr.test.tsx: that one pins the component that actually
 * broke on 2026-09-22, this one covers everything rendered around it so a new
 * browser-only global anywhere in the workspace fails here instead of in prod.
 *
 * vitest's node environment has no `google` global, exactly like the server.
 */
describe("PlanWorkspace server rendering", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("renders to string without touching a browser-only global", () => {
    expect(() =>
      renderToString(
        <PlanWorkspace
          origin={{ lat: 40.7127753, lng: -74.0059728 }}
          destination={{ lat: 34.0549076, lng: -118.242643 }}
          encodedPolyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
          candidateMarkers={[
            { id: "philadelphia", name: "Philadelphia", lat: 39.9526, lng: -75.1652, detourMinutes: 225 },
          ]}
          waypointFetch={{
            status: "fresh",
            cities: [
              { id: "philadelphia", name: "Philadelphia", vibeClass: null, detourMinutes: 225, lat: 39.9526, lng: -75.1652 },
            ],
            waypoints: [
              { id: "wp", cityId: "philadelphia", name: "Eastern State Penitentiary", type: "landmark", trendingScore: 50, neighborhoodId: null, description: null },
            ],
            neighborhoods: {},
          }}
          initialMoods={[]}
          budgetHours={4}
          initialDistanceMeters={4469715}
          initialDurationSeconds={148384}
          fromName="New York"
          toName="Los Angeles"
        />
      )
    ).not.toThrow();
  });
  it("renders the failed town read (no candidates, an empty set, the flag) as the sheet's title and an alert, with no 'fits today' sentence", () => {
    // Council R1 (bugs): guards the branches a populated fixture skips.
    // Council round 1 on #85, items 2 and 3: a page whose town read failed
    // passes exactly this, an empty "fresh" set and the flag; there is no
    // "failed" member of WaypointFetchResult to narrow on, and no refresh
    // has replaced the set, so the title says the towns could not be read.
    let html = "";
    expect(() => {
      html = renderToString(
        <PlanWorkspace
          origin={{ lat: 40.7127753, lng: -74.0059728 }}
          destination={{ lat: 34.0549076, lng: -118.242643 }}
          encodedPolyline=""
          candidateMarkers={[]}
          waypointFetch={{ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }}
          initialMoods={[]}
          budgetHours={4}
          initialDistanceMeters={0}
          initialDurationSeconds={0}
          fromName="New York"
          toName="Los Angeles"
          initialCandidateFetchFailed
        />
      );
    }).not.toThrow();
    const text = html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
    const visible = text.replace(/<[^>]+>/g, " ");
    expect(visible).toContain("Couldn't load the towns along the road");
    expect(text).toContain('role="alert"');
    expect(visible).toContain("The route is still here. Reload to try the towns again.");
    expect(visible).not.toMatch(/fits? today/);
  });

  it("renders a degraded initial set (the towns read, some places not) with the towns' sentence and the note that places did not load", () => {
    let html = "";
    expect(() => {
      html = renderToString(
        <PlanWorkspace
          origin={{ lat: 40.7127753, lng: -74.0059728 }}
          destination={{ lat: 34.0549076, lng: -118.242643 }}
          encodedPolyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
          candidateMarkers={[
            { id: "philadelphia", name: "Philadelphia", lat: 39.9526, lng: -75.1652, detourMinutes: 225 },
          ]}
          waypointFetch={{
            status: "degraded",
            cities: [
              { id: "philadelphia", name: "Philadelphia", vibeClass: null, detourMinutes: 225, lat: 39.9526, lng: -75.1652 },
            ],
            waypoints: [],
            neighborhoods: {},
            failures: [{ kind: "waypoints", cityId: "philadelphia", reason: "atlas read failed" }],
          }}
          initialMoods={[]}
          budgetHours={4}
          initialDistanceMeters={4469715}
          initialDurationSeconds={148384}
          fromName="New York"
          toName="Los Angeles"
        />
      );
    }).not.toThrow();
    const visible = html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/<[^>]+>/g, " ");
    expect(visible).toContain("Philadelphia fits today");
    expect(visible).toContain("Some of the places did not load. Reload to try again.");
    expect(visible).not.toContain("Couldn't load the towns along the road");
  });
});
