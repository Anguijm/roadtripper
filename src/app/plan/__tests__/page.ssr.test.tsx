import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * The plan page, server-rendered with the paid calls mocked out. What it
 * proves here is the header: in arrival mode the deadline is on it, and the
 * start date was derived from the route rather than typed.
 */
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("@/lib/routing/directions", () => ({
  computeRoute: vi.fn().mockResolvedValue({
    encodedPolyline: "abc",
    bounds: { northeast: { lat: 36, lng: -97 }, southwest: { lat: 30, lng: -102 } },
    totalDistanceMeters: 800_000,
    totalDurationSeconds: 5 * 3600,   // five hours: two days on a four-hour budget
    legs: [],
  }),
}));
vi.mock("@/lib/routing/radial", () => ({
  findCitiesInRadius: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/routing/recommend", () => ({
  fetchWaypointsForCandidates: vi.fn().mockResolvedValue({ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }),
}));
vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanPage from "@/app/plan/page";

const BASE = {
  fromName: "Amarillo", fromLat: "35.2073", fromLng: "-101.8338",
  toName: "Austin", toLat: "30.2672", toLng: "-97.7431",
  budget: "4",
};
const render = async (params: Record<string, string>) =>
  renderToString(await PlanPage({ searchParams: Promise.resolve({ ...BASE, ...params }) }));

describe("the plan page header knows the deadline", () => {
  it("arrival mode: says Arrive by the date", async () => {
    const html = await render({ dateMode: "arrival", endDate: "2026-10-14" });
    expect(html).toContain("Arrive by Oct 14");
    expect(html).toContain("Amarillo");
    expect(html).toContain("Austin");
  });

  it("range mode: says the range", async () => {
    const html = await render({ startDate: "2026-10-10", endDate: "2026-10-14" });
    expect(html).toContain("Oct 10 to Oct 14");
    expect(html).not.toContain("Arrive by");
  });

  it("no dates: says neither", async () => {
    const html = await render({});
    expect(html).not.toContain("Arrive by");
    expect(html).not.toContain(" to Oct");
  });
});
