import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace, { RoadsideCard, roadsideKindLine, roadsideAlongText, ROADSIDE_SHOWN_FIRST } from "@/components/PlanWorkspace";
import RouteMap, { roadsideMarkerSvg, ROADSIDE_COLOR, roadsideMinProbabilityAt, ROADSIDE_ZOOM_STEPS } from "@/components/RouteMap";
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

/** Fourteen stops in road order whose strength runs the other way, so the list's order is a choice, not an accident. */
const fourteen: RoadsideMarker[] = Array.from({ length: 14 }, (_, i) => ({
  id: `osm:node:${100 + i}`,
  name: `Stop ${i + 1}`,
  lat: 35 - i * 0.2,
  lng: -101 + i * 0.2,
  kind: "attraction" as const,
  p: 0.5 + i * 0.03,
  about: null,
  url: null,
  alongKm: (i + 1) * 30,
}));

/** React puts a comment node between adjacent text and an expression; strip those so the assertions read like the page does. */
const render = (props: Partial<React.ComponentProps<typeof PlanWorkspace>>) =>
  renderToString(<PlanWorkspace {...base} {...props} />).replace(/<!-- -->/g, "");

const rowIds = (html: string) => [...html.matchAll(/data-roadside-stop="([^"]+)"/g)].map((m) => m[1]);

describe("roadside stops on the plan page (step 22, first-class in U1)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("lists the survivors open under the towns, headed in plain words, with the kind and how far in", () => {
    const html = render({ roadsideStops: stops });
    expect(html).toContain("data-roadside");
    expect(html).not.toContain("<details");
    expect(html).toContain("2 places worth pulling over for");
    expect(html).toContain('data-roadside-stop="osm:way:1"');
    expect(html).toContain("The Big Texan Steak Ranch");
    expect(html).toContain("well-known place · 9 km in");
    expect(html).toContain("historic place · 9 km in");
    // Two stops, both shown: no "Show all" control below the ten.
    expect(html).not.toContain("data-roadside-show-all");
    // The list does not carry the old engineer heading.
    expect(html).not.toContain("Roadside stops along the way");
  });

  it("shows the ten strongest first, then a control that says how many there are in all", () => {
    const html = render({ roadsideStops: fourteen });
    expect(html).toContain("14 places worth pulling over for");
    const ids = rowIds(html);
    expect(ids).toHaveLength(ROADSIDE_SHOWN_FIRST);
    expect(ROADSIDE_SHOWN_FIRST).toBe(10);
    // Strongest first: the fixture's strength rises with the index, so the
    // rows come in reverse road order, the last stop (p 0.89) at the top.
    expect(ids[0]).toBe("osm:node:113");
    expect(ids[9]).toBe("osm:node:104");
    expect(html).toContain("Show all 14");
    expect(html).toContain("data-roadside-show-all");
  });

  it("renders the card from state above the list with its five parts", () => {
    const html = render({ roadsideStops: stops, initialSelectedRoadsideId: "osm:way:1" });
    expect(html).toContain('data-roadside-card="osm:way:1"');
    // 1. The name, as a heading.
    expect(html).toMatch(/<h3[^>]*>The Big Texan Steak Ranch<\/h3>/);
    // 2. The line about it, from the store.
    expect(html).toMatch(/data-roadside-line[^>]*>A large steakhouse and motel\. A roadside attraction known for competitive eating\.</);
    // 3 and 4. The kind in plain words and how far along the road.
    expect(html).toMatch(/data-roadside-where[^>]*>well-known place · 9 km in</);
    // 5. One link-button that opens the place in Maps.
    expect(html).toMatch(/<a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=35\.19381,-101\.75510"[^>]*>Open in Maps<\/a>/);
    // And a way to close it.
    expect(html).toContain('aria-label="Close The Big Texan Steak Ranch"');
    // Above the list: the card comes before the heading and the first row.
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("places worth pulling over for"));
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("data-roadside-stop="));
    // The tapped row is marked as the open one.
    expect(html).toMatch(/data-roadside-stop="osm:way:1"><button[^>]*aria-expanded="true"/);
  });

  it("says the kind as a sentence when the store has no line about a stop", () => {
    const html = renderToString(<RoadsideCard stop={stops[1]} />).replace(/<!-- -->/g, "");
    expect(html).toMatch(/data-roadside-line[^>]*>A historic place\.</);
    expect(html).toMatch(/data-roadside-where[^>]*>historic place · 9 km in</);
    expect(roadsideKindLine("attraction")).toBe("An attraction.");
    expect(roadsideKindLine("arch")).toBe("An arch.");
    expect(roadsideKindLine("theme_park")).toBe("A theme park.");
    expect(roadsideKindLine("other")).toBe("A place.");
    expect(roadsideAlongText(211.6)).toBe("212 km in");
    expect(roadsideAlongText(0.3)).toBe("Right at the start");
  });

  it("renders no card when nothing is tapped", () => {
    const html = render({ roadsideStops: stops });
    expect(html).not.toContain("data-roadside-card");
    expect(html).not.toContain("Open in Maps");
  });

  it("renders a stop's name and line as text, so markup in the store's crowd text stays characters", () => {
    const hostile: RoadsideMarker = { ...stops[1], id: "osm:node:9", name: "<b>Bold</b> & Co", about: "<img src=x onerror=alert(1)> a line" };
    // With the card open, the name is on the row and on the card and the
    // line is on the card; every one of them must be characters.
    const html = renderToString(<PlanWorkspace {...base} roadsideStops={[hostile]} initialSelectedRoadsideId="osm:node:9" />);
    expect(html).toContain('data-roadside-card="osm:node:9"');
    expect(html.match(/&lt;b&gt;Bold&lt;\/b&gt; &amp; Co/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; a line");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Bold</b>");
  });

  it("shows nothing and says nothing when no pulled corridor is near the route", () => {
    const html = render({ roadsideStops: [] });
    expect(html).not.toContain("data-roadside");
    expect(html).not.toContain("worth pulling over for");
  });

  it("shows only the strongest stops at a state-wide zoom and every survivor at a town", () => {
    expect(roadsideMinProbabilityAt(5)).toBe(0.7);
    expect(roadsideMinProbabilityAt(7.9)).toBe(0.7);
    expect(roadsideMinProbabilityAt(8)).toBe(0.55);
    expect(roadsideMinProbabilityAt(9.5)).toBe(0.55);
    expect(roadsideMinProbabilityAt(10)).toBe(0.45);
    expect(roadsideMinProbabilityAt(15)).toBe(0.45);
    // A line above a step's value wins, so nothing shows below the store's own line.
    expect(roadsideMinProbabilityAt(9, 0.6)).toBe(0.6);
    expect(ROADSIDE_ZOOM_STEPS.map(([z]) => z)).toEqual([8, 10]);
  });

  it("draws a diamond in amber, a different shape and colour from a city dot or a numbered square", () => {
    const svg = roadsideMarkerSvg();
    expect(svg).toContain("M22 13 L31 22 L22 31 L13 22 Z");
    expect(svg).toContain(ROADSIDE_COLOR);
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("<rect");
    // The tapped one is larger with a light stroke, still a diamond.
    const active = roadsideMarkerSvg(ROADSIDE_COLOR, true);
    expect(active).toContain("M22 9 L35 22 L22 35 L9 22 Z");
    expect(active).toContain('stroke="#f0f6fc"');
    expect(active).not.toContain("<circle");
  });

  it("draws no search arc: the map has no such prop any more", () => {
    // The arc was machinery on the map (quality bar, rule 6). Its prop is
    // gone from RouteMap; if it comes back, the line below stops being an
    // error and `tsc --noEmit` fails on the unused expect-error.
    expect(() =>
      renderToString(
        // @ts-expect-error the search arc prop was removed in Gauntlet U1; a revival fails type-check here
        <RouteMap origin={base.origin} destination={base.destination} encodedPolyline={base.encodedPolyline} searchArc={null} />
      )
    ).not.toThrow();
  });
});
