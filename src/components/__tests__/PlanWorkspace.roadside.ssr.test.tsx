import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import { roadsideMarkerSvg, ROADSIDE_COLOR } from "@/components/RouteMap";
import type { RoadsideMarker } from "@/lib/roadside/along";

const base = {
  origin: { lat: 35.2073, lng: -101.8338 },
  destination: { lat: 30.2672, lng: -97.7431 },
  encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
  candidateMarkers: [],
  waypointFetch: { status: "fresh" as const, cities: [], waypoints: [], neighborhoods: {} },
  initialPersonaId: "culture" as const,
  budgetHours: 4,
  initialDistanceMeters: 800_000,
  initialDurationSeconds: 29_000,
  fromName: "Amarillo",
  toName: "Austin",
  maxDetourMinutes: 270,
};
const stops: RoadsideMarker[] = [
  { id: "osm:way:1", name: "The Big Texan Steak Ranch", lat: 35.19381, lng: -101.7551, kind: "notable", p: 0.83, about: "A large steakhouse and motel. A roadside attraction known for competitive eating.", url: "https://en.wikipedia.org/wiki/Big_Texan_Steak_Ranch", alongKm: 9 },
  { id: "osm:node:2", name: "Helium Monument", lat: 35.19955, lng: -101.91332, kind: "historic", p: 0.72, about: null, url: null, alongKm: 9 },
];

describe("roadside stops on the plan page (step 22)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("lists the survivors under the recommendations with a map link, the kind, the km and the line to read", () => {
    // React puts a comment node between adjacent text and an expression;
    // strip those so the assertions read like the page does.
    const html = renderToString(<PlanWorkspace {...base} roadsideStops={stops} />).replace(/<!-- -->/g, "");
    expect(html).toContain("data-roadside");
    expect(html).toContain("Roadside stops along the way · 2<");
    expect(html).toContain('data-roadside-stop="osm:way:1"');
    expect(html).toContain("The Big Texan Steak Ranch");
    expect(html).toContain("maps/search/?api=1&amp;query=35.19381,-101.75510");
    expect(html).toContain("place · 9 km");
    expect(html).toContain("competitive eating");
    expect(html).toContain("historic · 9 km");
    // A stop with nothing to read gets no empty line.
    expect(html.match(/data-roadside-about/g)?.length ?? 0).toBe(1);
  });

  it("renders a stop's name and line as text, so markup in the store's crowd text stays characters", () => {
    const hostile: RoadsideMarker = { ...stops[1], id: "osm:node:9", name: "<b>Bold</b> & Co", about: "<img src=x onerror=alert(1)> a line" };
    const html = renderToString(<PlanWorkspace {...base} roadsideStops={[hostile]} />);
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; Co");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; a line");
    expect(html).not.toContain("<img src=x");
  });

  it("shows nothing and says nothing when no pulled corridor is near the route", () => {
    const html = renderToString(<PlanWorkspace {...base} roadsideStops={[]} />);
    expect(html).not.toContain("data-roadside");
    expect(html).not.toContain("Roadside stops");
  });

  it("draws a diamond in amber, a different shape and colour from a city dot or a numbered square", () => {
    const svg = roadsideMarkerSvg();
    expect(svg).toContain("M22 13 L31 22 L22 31 L13 22 Z");
    expect(svg).toContain(ROADSIDE_COLOR);
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("<rect");
  });
});
