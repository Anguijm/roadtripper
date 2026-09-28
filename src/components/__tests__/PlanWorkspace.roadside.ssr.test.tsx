import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace, {
  RoadsideCard,
  ROADSIDE_NO_WRITEUP,
  roadsideAlongText,
  ROADSIDE_SHOWN_FIRST,
  ROADSIDE_LIST_PX,
  SHEET_SNAPS,
  SHEET_HEIGHT_DVH,
  SHEET_HANDLE_PX,
  sheetScrollBoxPx,
  sheetTopDvh,
} from "@/components/PlanWorkspace";
import RouteMap, {
  roadsideMarkerSvg,
  ROADSIDE_COLOR,
  roadsideMinProbabilityAt,
  ROADSIDE_ZOOM_STEPS,
  DARK_MAP_STYLES,
  roadStartPanPx,
  ROAD_START_TOP_PX,
  ROAD_START_BOTTOM_PX,
} from "@/components/RouteMap";
import { roadsideSpread, mercatorPx, ringRadius, RING_CHORD_PX, RING_MAX, STACK_PX } from "@/lib/roadside/spread";
import { townsAlong, roadsideAnchor } from "@/lib/roadside/anchor";
import { formatDurationPlain } from "@/lib/routing/format";
import nextConfig from "../../../next.config";
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

/** One town with two spots the culture persona ranks first: the lead shows its reason, the second row its badge, and the town its two buttons. */
const withTown = {
  candidateMarkers: [{ id: "lubbock", name: "Lubbock", lat: 33.5779, lng: -101.8552, detourMinutes: 12 }],
  waypointFetch: {
    status: "fresh" as const,
    cities: [{ id: "lubbock", name: "Lubbock", vibeClass: null, detourMinutes: 12, lat: 33.5779, lng: -101.8552 }],
    waypoints: [
      { id: "wp-1", cityId: "lubbock", name: "Buddy Holly Center", type: "culture" as const, trendingScore: 50, neighborhoodId: null, description: "A museum for the singer, in the town he grew up in." },
      { id: "wp-2", cityId: "lubbock", name: "National Ranching Heritage Center", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "Fifty ranch buildings moved here from across the plains." },
    ],
    neighborhoods: {},
  },
};

/** React puts a comment node between adjacent text and an expression; strip those so the assertions read like the page does. */
const render = (props: Partial<React.ComponentProps<typeof PlanWorkspace>>) =>
  renderToString(<PlanWorkspace {...base} {...props} />).replace(/<!-- -->/g, "");

/** What a person reads: the markup's text with every tag gone and the whitespace folded. */
const visible = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const rowIds = (html: string) => [...html.matchAll(/data-roadside-stop="([^"]+)"/g)].map((m) => m[1]);

describe("roadside stops on the plan page (step 22, first-class in U1)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("lists the survivors open, headed in plain words, with the kind, how far in and the town", () => {
    const html = render({ roadsideStops: stops });
    expect(html).toContain("data-roadside");
    expect(html).not.toContain("<details");
    expect(html).toContain("2 places worth pulling over for");
    expect(html).toContain('data-roadside-stop="osm:way:1"');
    expect(html).toContain("The Big Texan Steak Ranch");
    // The sheet's unit (the summary says "497 mi") and the town, the card's
    // own sentence: both stops are within 10 km of the start (round-3
    // critic: three rows at the end read "494 mi in" and nothing else).
    expect(html).toContain("well-known place · 6 mi in, at Amarillo");
    expect(html).toContain("historic place · 6 mi in, at Amarillo");
    expect(html).not.toContain("km in");
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

  it("sits directly under the header and above the towns, so the sheet opens on it and no town header can sit over it", () => {
    // Round 3 had it after two town sections, about 1750 px below the
    // fold, and the scrolled capture began with a town's sticky header
    // over a half-clipped row. A sticky header stays inside its own
    // section, so with the towns below the list it cannot reach the rows.
    const html = render({ roadsideStops: fourteen, ...withTown });
    const section = html.indexOf('<section data-roadside="true"');
    expect(section).toBeGreaterThan(0);
    expect(section).toBeGreaterThan(html.indexOf("of driving left today"));
    expect(section).toBeLessThan(html.indexOf("First stop from Amarillo"));
    expect(section).toBeLessThan(html.indexOf("sticky top-0"));
    // The tenth row and the control come before the first town too.
    expect(html.indexOf("data-roadside-show-all")).toBeLessThan(html.indexOf("What&#x27;s in Lubbock"));
    // The Save button stays last.
    expect(html.indexOf("Save trip")).toBeGreaterThan(html.indexOf("What&#x27;s in Lubbock"));
  });

  it("holds the heading, ten rows and the control in the sheet's scroll box at rest on a 390 by 844 phone", () => {
    // Round 3's list capture had six rows cut off and no control: the
    // scroll box was the whole 92 dvh sheet (731 px) with 382 px of it on
    // screen at the half snap, so the section could neither reach the top
    // nor show ten rows. The box is now the visible part, and the rest
    // snap leaves room for the list.
    expect(sheetScrollBoxPx(844, 1)).toBeGreaterThanOrEqual(ROADSIDE_LIST_PX);
    // At the old half snap, 45 percent hidden, it could not have fit.
    expect(Math.floor((844 * 92 * 55) / 10_000) - 45).toBeLessThan(ROADSIDE_LIST_PX);
    // The numbers the arithmetic rests on, pinned so the CSS below and
    // this file cannot drift apart silently.
    expect(SHEET_SNAPS).toEqual([80, 25, 8]);
    expect(SHEET_HEIGHT_DVH).toBe(92);
    expect(SHEET_HANDLE_PX).toBe(45);
    expect(ROADSIDE_LIST_PX).toBe(524);
    // The sheet opens at the rest snap, and the scroll box carries the class
    // whose CSS makes it the visible part.
    const html = render({ roadsideStops: fourteen });
    expect(html).toContain("--sheet-y:25%");
    expect(html).toMatch(/class="plan-sheet-scroll [^"]*overflow-y-auto/);
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.plan-sheet-scroll\s*\{[^}]*height:\s*calc\(100% - var\(--sheet-y, 25%\) - 45px\)/);
    expect(css).toMatch(/\.plan-sheet\s*\{[^}]*height:\s*92dvh/);
    // The rows are two lines of 22 px with no vertical padding, so ten are 440.
    expect(html).toMatch(/data-roadside-stop="osm:node:113"><button[^>]*class="w-full min-h-\[44px\] text-left px-2 py-0 /);
    // The map is told where the sheet's edge is, so the strip above it can
    // show the start of the road: 100 - 92 * 0.75.
    expect(sheetTopDvh(1)).toBe(31);
  });

  it("pans the start of the road into the strip of map above the sheet at rest, on a phone", () => {
    // The fit centres the corridor on an 800 px map that the sheet at rest
    // covers from 218 px down, so Amarillo sat under the sheet's edge and
    // the strip showed Kansas. At zoom 6 Amarillo is about 132 px above the
    // route's middle; the pan puts it ROAD_START_TOP_PX under the map's top.
    const center = { lat: (base.origin.lat + base.destination.lat) / 2, lng: -99.8 };
    const strip = 218;
    const south = roadStartPanPx({ origin: base.origin, destination: base.destination, center, zoom: 6, mapHeightPx: 800, stripHeightPx: strip });
    const originY = 400 + mercatorPx(base.origin.lat, base.origin.lng, 6).y - mercatorPx(center.lat, center.lng, 6).y;
    expect(originY).toBeGreaterThan(strip);
    expect(originY - south).toBeCloseTo(ROAD_START_TOP_PX, 0);
    // Heading north (Austin to Amarillo) the start goes just above the
    // sheet's edge instead, so the road runs up into the strip.
    const north = roadStartPanPx({ origin: base.destination, destination: base.origin, center, zoom: 6, mapHeightPx: 800, stripHeightPx: strip });
    const austinY = 400 + mercatorPx(base.destination.lat, base.destination.lng, 6).y - mercatorPx(center.lat, center.lng, 6).y;
    expect(austinY - north).toBeCloseTo(strip - ROAD_START_BOTTOM_PX, 0);
    // Already in place: nothing to pan.
    const inPlace = roadStartPanPx({ origin: base.origin, destination: base.destination, center: base.origin, zoom: 6, mapHeightPx: 2 * ROAD_START_TOP_PX, stripHeightPx: strip });
    expect(inPlace).toBe(0);
    // The room the margins leave: the town's name 30 px above the dot and a ring of three 25 px out.
    expect(ROAD_START_TOP_PX).toBe(70);
    expect(ROAD_START_BOTTOM_PX).toBe(60);
  });

  it("renders the card from state above the list with its five parts", () => {
    const html = render({ roadsideStops: stops, initialSelectedRoadsideId: "osm:way:1" });
    expect(html).toContain('data-roadside-card="osm:way:1"');
    // 1. The name, as a heading.
    expect(html).toMatch(/<h3[^>]*>The Big Texan Steak Ranch<\/h3>/);
    // 2. The line about it, from the store.
    expect(html).toMatch(/data-roadside-line[^>]*>A large steakhouse and motel\. A roadside attraction known for competitive eating\.</);
    // 3 and 4. The kind in plain words and how far along the road, with the
    // town it is at: the Big Texan is 7 km from the start, Amarillo.
    expect(html).toMatch(/data-roadside-where[^>]*>well-known place · 6 mi in, at Amarillo</);
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

  it("says there is no write-up when the store has no line, instead of the kind twice", () => {
    const html = renderToString(<RoadsideCard stop={stops[1]} />).replace(/<!-- -->/g, "");
    expect(ROADSIDE_NO_WRITEUP).toBe("No write-up for this one.");
    expect(html).toMatch(/data-roadside-line[^>]*>No write-up for this one\.</);
    expect(html).toMatch(/data-roadside-where[^>]*>historic place · 6 mi in</);
    // Round 1 said "A historic place." here, which only repeated the line beneath.
    expect(html).not.toContain("A historic place.");
  });

  it("says how far in miles, the sheet's own unit, and which town it is at or past", () => {
    expect(roadsideAlongText(211.6)).toBe("131 mi in");
    expect(roadsideAlongText(9, { name: "Amarillo", near: true })).toBe("6 mi in, at Amarillo");
    expect(roadsideAlongText(211.6, { name: "Lubbock", near: false })).toBe("131 mi in, past Lubbock");
    // Under a mile the same shape, not a different sentence (round-2 critic:
    // "Right at the start" beside "6 km in" read as two styles), and in
    // lower case, since it always follows the kind mid-line (round 3).
    expect(roadsideAlongText(0.3)).toBe("less than a mile in");
    expect(roadsideAlongText(0.3, { name: "Amarillo", near: true })).toBe("less than a mile in, at Amarillo");
  });

  it("places the towns along the road and names the one a stop is at or past", () => {
    // A road due south from 35,-101 to 34,-101, about 111 km, a point every
    // 0.01 degrees. Tulia sits 4.6 km off it halfway down; Clovis 46 km off.
    const road = Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i / 100, lng: -101 }));
    const towns = townsAlong(
      road,
      { name: "Amarillo", lat: 35, lng: -101 },
      { name: "Lubbock", lat: 34, lng: -101 },
      [{ name: "Clovis", lat: 34.5, lng: -101.5 }, { name: "Tulia", lat: 34.5, lng: -101.05 }]
    );
    expect(towns.map((t) => t.name)).toEqual(["Amarillo", "Tulia", "Lubbock"]);
    expect(towns[0].alongKm).toBe(0);
    expect(towns[1].alongKm).toBeCloseTo(55.6, 0);
    expect(towns[2].alongKm).toBeCloseTo(111.2, 0);
    // 11 km down the road: past the start, not at it.
    expect(roadsideAnchor({ lat: 34.9, lng: -101, alongKm: 11.1 }, towns)).toEqual({ name: "Amarillo", near: false });
    // Beside Tulia: at it.
    expect(roadsideAnchor({ lat: 34.52, lng: -101, alongKm: 53.4 }, towns)).toEqual({ name: "Tulia", near: true });
    // Between Tulia and Lubbock, nearer neither: past Tulia.
    expect(roadsideAnchor({ lat: 34.3, lng: -101, alongKm: 77.8 }, towns)).toEqual({ name: "Tulia", near: false });
    // A route with no direction: the start alone, and a stop is past it.
    expect(townsAlong([{ lat: 35, lng: -101 }], { name: "Amarillo", lat: 35, lng: -101 }, { name: "Lubbock", lat: 34, lng: -101 }, []).map((t) => t.name)).toEqual(["Amarillo"]);
    expect(roadsideAnchor({ lat: 34.3, lng: -101, alongKm: 77.8 }, [])).toBeNull();
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

  it("says the sheet's numbers as sentences, with no stat called budget", () => {
    const text = visible(render({ roadsideStops: stops }));
    expect(text).toContain("497 mi · 8 h 3 min on the road");
    // The glossary's own replacement for "budget left (as a stat)".
    expect(text).toContain("4 h of driving left today");
    expect(text).not.toMatch(/budget left/i);
    // A three-day trip's budget is the trip's, so the sentence says the span.
    const days = visible(render({ roadsideStops: stops, startDate: "2026-10-01", endDate: "2026-10-03" }));
    expect(days).toContain("12 h of driving left over 3 days");
    expect(formatDurationPlain(4 * 3600)).toBe("4 h");
    expect(formatDurationPlain(29_000)).toBe("8 h 3 min");
    expect(formatDurationPlain(45 * 60)).toBe("45 min");
  });

  it("carries no word from the glossary's never column on the sheet at rest", () => {
    const html = render({ roadsideStops: fourteen, ...withTown });
    const text = visible(html);
    // The never column of gauntlet/quality-bar.md, as words a person would
    // read on the sheet with a town listed and the roadside list open.
    const never = /budget left|candidate|max \d+ min|persona|see what.s here|add city to trip|\bprimary\b|waypoint|neighbou?rhood|recompute|refresh|pending|roadside stops along the way/i;
    expect(text).not.toMatch(never);
    // The replacements are there instead.
    expect(text).toContain("First stop from Amarillo · 1 town that fits today");
    expect(text).toContain("What&#x27;s in Lubbock");
    expect(text).toContain("+ Stop here");
    expect(text).toContain("★ The pick");
    // The mood chips: named in the glossary's words, wrapping rather than
    // scrolling sideways (round-1 critic: the strip clipped the last chip).
    expect(html).toContain('aria-label="I&#x27;m in the mood for"');
    expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*flex-wrap/);
    expect(html).not.toContain("overflow-x-auto");
  });

  it("keeps the dev server's own button off the screen the runner shoots", () => {
    // The black "N" circle the round-1 critic took for a compass over the
    // sheet was Next's dev-tools indicator, fixed at the viewport's bottom
    // left above everything on a dev server. It is configuration, not
    // markup, so the config is what the test pins.
    expect(nextConfig.devIndicators).toBe(false);
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

  it("spreads diamonds that sit on one point into a ring, so every one answers its own tap", () => {
    // The round-2 critic's three: at the state-wide zoom they sat on
    // Amarillo's point and a tap opened whichever was on top.
    const amarillo = [
      { id: "big-texan", name: "The Big Texan Steak Ranch", lat: 35.19381, lng: -101.7551, p: 0.83 },
      { id: "helium", name: "Helium Monument", lat: 35.19955, lng: -101.91332, p: 0.72 },
      { id: "mural", name: "Amarillo Mural", lat: 35.20063, lng: -101.83761, p: 0.71 },
    ];
    const zoom = 7;
    // On one point at this zoom: the farthest pair is 14 px apart.
    const at = (s: { lat: number; lng: number }) => mercatorPx(s.lat, s.lng, zoom);
    expect(Math.hypot(at(amarillo[0]).x - at(amarillo[1]).x, at(amarillo[0]).y - at(amarillo[1]).y)).toBeLessThan(STACK_PX);
    const placed = roadsideSpread(amarillo, zoom);
    expect([...placed.values()].every((p) => p.shown)).toBe(true);
    // A ring of three around the strongest: 25 px out, 44 px apart, so the
    // 44 px touch canvases touch and never overlap.
    const anchor = at(amarillo[0]);
    const where = amarillo.map((s) => {
      const p = placed.get(s.id)!;
      return { x: at(s).x + p.dx, y: at(s).y + p.dy };
    });
    for (const w of where) expect(Math.hypot(w.x - anchor.x, w.y - anchor.y)).toBeCloseTo(ringRadius(3), 0);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) expect(Math.hypot(where[i].x - where[j].x, where[i].y - where[j].y)).toBeGreaterThanOrEqual(RING_CHORD_PX - 1);
    // The strongest sits at the bottom; the gap is at the top, where the
    // town's name is drawn.
    expect(placed.get("big-texan")).toEqual({ dx: 0, dy: 25, shown: true });
    expect(where.every((w) => w.y > anchor.y - 15)).toBe(true);
    // Two sit left and right of the point.
    const two = roadsideSpread(amarillo.slice(0, 2), zoom);
    expect(two.get("big-texan")).toEqual({ dx: -22, dy: 0, shown: true });
    expect(Math.abs(two.get("helium")!.dy)).toBeLessThanOrEqual(1);
    // Zoomed to the town they are hundreds of pixels apart: nothing moves.
    const apart = roadsideSpread(amarillo, 13);
    for (const s of amarillo) expect(apart.get(s.id)).toEqual({ dx: 0, dy: 0, shown: true });
    // The tapped one takes its stack's first slot, so its diamond is on the
    // map whatever its strength.
    expect(roadsideSpread(amarillo, zoom, "mural").get("mural")).toEqual({ dx: 0, dy: 25, shown: true });
  });

  it("caps a ring at eight and lets the rest wait for a closer zoom, the tapped one always in", () => {
    // Twelve on one point: downtown at a town zoom.
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `Stop ${i}`, lat: 30.2672 + i * 0.0001, lng: -97.7431, p: 0.9 - i * 0.02 }));
    const placed = roadsideSpread(twelve, 10);
    expect(RING_MAX).toBe(8);
    expect([...placed.values()].filter((p) => p.shown)).toHaveLength(8);
    // The eight strongest show; the four weakest wait.
    for (let i = 0; i < 8; i++) expect(placed.get(`s${i}`)!.shown).toBe(true);
    for (let i = 8; i < 12; i++) expect(placed.get(`s${i}`)).toEqual({ dx: 0, dy: 0, shown: false });
    // The tapped one, the weakest, is shown in the first slot and the
    // eighth strongest waits instead.
    const kept = roadsideSpread(twelve, 10, "s11");
    expect(kept.get("s11")!.shown).toBe(true);
    expect(kept.get("s7")!.shown).toBe(false);
    expect([...kept.values()].filter((p) => p.shown)).toHaveLength(8);
    // A ring of eight reaches 57 px; every shown one is that far out.
    expect(ringRadius(8)).toBeCloseTo(57.5, 0);
  });

  it("draws the towns' names once: the basemap's are off and the start and end carry the app's", () => {
    // Drawn both, "Lubbock" read "Lubbockbock" and "Amarillo" hid behind
    // the diamonds (round-2 critic, rule 7).
    expect(DARK_MAP_STYLES).toContainEqual({ featureType: "administrative.locality", elementType: "labels", stylers: [{ visibility: "off" }] });
    expect(() =>
      renderToString(<RouteMap origin={base.origin} destination={base.destination} originName="Amarillo" destinationName="Austin" encodedPolyline={base.encodedPolyline} />)
    ).not.toThrow();
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
