import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { RadialCandidate } from "@/lib/routing/radial";

/**
 * Own file because vi.mock is hoisted per file: here the waypoint pipeline
 * is forced to "degraded", which page.ssr.test.tsx must not see.
 */
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("lat=35.2073&lng=-101.8338&hours=5"),
}));
vi.mock("@/app/actions/snapOrigin", () => ({ snapOriginAction: vi.fn() }));
vi.mock("@/lib/routing/recommend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/routing/recommend")>();
  return {
    ...actual,
    fetchWaypointsForCandidates: vi.fn(async (candidates: RadialCandidate[]) => ({
      status: "degraded" as const,
      cities: candidates.slice(0, 10).map((c) => ({
        id: c.city.id, name: c.city.name, vibeClass: null, detourMinutes: c.oneWayDriveMinutes * 2, lat: c.city.lat, lng: c.city.lng,
      })),
      waypoints: [],
      neighborhoods: {},
      failures: [{ kind: "waypoints" as const, reason: "atlas read failed" }],
    })),
  };
});

import TodayPage from "@/app/today/page";
import { fetchWaypointsForCandidates } from "@/lib/routing/recommend";

describe("the today screen when the spots fail to load", () => {
  it("still lists the cities and says the spots are missing, not 'nothing here yet'", async () => {
    const html = renderToString(
      await TodayPage({ searchParams: Promise.resolve({ lat: "35.2073", lng: "-101.8338", hours: "5" }) })
    );
    expect(html).toContain("Albuquerque");
    expect(html).toContain("some spots could not be loaded");
    expect(html).toContain("Spots did not load.");
    expect(html).not.toContain("Nothing in the atlas");
  });

  it("survives the pipeline throwing: the cities still list, the spots are reported missing", async () => {
    vi.mocked(fetchWaypointsForCandidates).mockRejectedValueOnce(new Error("sqlite exploded"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      await TodayPage({ searchParams: Promise.resolve({ lat: "35.2073", lng: "-101.8338", hours: "5" }) })
    );
    quiet.mockRestore();
    expect(html).toContain("Albuquerque");
    expect(html).toContain("some spots could not be loaded");
    expect(html).toContain("3 h 45 min");
  });
});
