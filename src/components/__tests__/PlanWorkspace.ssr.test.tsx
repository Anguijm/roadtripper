import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

// Clerk's useAuth needs a provider that only exists in the running app. The
// auth state is irrelevant to what this suite checks, which is that nothing on
// the render path touches a browser-only global.
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false, userId: null, isLoaded: true }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SignedIn: () => null,
  SignedOut: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  UserButton: () => null,
}));

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
  saveTripAction: vi.fn(),
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
              { id: "wp", cityId: "philadelphia", name: "Eastern State Penitentiary", type: "landmark", trendingScore: 50, neighborhoodId: null },
            ],
            neighborhoods: {},
          }}
          initialPersonaId="culture"
          budgetHours={4}
          initialDistanceMeters={4469715}
          initialDurationSeconds={148384}
          fromName="New York"
          toName="Los Angeles"
          maxDetourMinutes={270}
        />
      )
    ).not.toThrow();
  });
});
