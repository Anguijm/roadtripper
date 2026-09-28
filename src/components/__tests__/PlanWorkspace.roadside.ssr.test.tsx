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
  roadsideMapLine,
  roadsideAlongText,
  ROADSIDE_SHOWN_FIRST,
  ROADSIDE_LIST_PX,
  SHEET_SNAPS,
  SHEET_HEIGHT_DVH,
  SHEET_HANDLE_PX,
  SHEET_BOX_PADDING_PX,
  sheetScrollBoxPx,
  sheetTopDvh,
} from "@/components/PlanWorkspace";
import RouteMap, {
  roadsideMarkerSvg,
  ROADSIDE_COLOR,
  DIAMOND_PX,
  roadsideMinProbabilityAt,
  ROADSIDE_ZOOM_STEPS,
  DARK_MAP_STYLES,
  stripHeightPx,
  fitPaddingPx,
  FIT_MARGIN_PX,
  STRIP_MARGIN_PX,
  STRIP_MIN_PX,
  MAP_CONTROL_SIZE_PX,
} from "@/components/RouteMap";
import { roadsideSpread, mercatorPx, diamondBox, SPREAD_PX, SPREAD_SLOTS, type PxBox } from "@/lib/roadside/spread";
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

  it("is first in the sheet, before the numbers, the mood chips and the towns, so the sheet opens on it and no town header can sit over it", () => {
    // Round 3 had it after two town sections, about 1750 px below the
    // fold, and the scrolled capture began with a town's sticky header
    // over a half-clipped row. A sticky header stays inside its own
    // section, so with the towns below the list it cannot reach the rows.
    // Round 5 had it under the header (the chips on two rows and the two
    // sentences, about 170 px), and the rest capture showed seven rows
    // and no "Show all": the box holds the section or the header, not
    // both. The section is first.
    const html = render({ roadsideStops: fourteen, ...withTown });
    const section = html.indexOf('<section data-roadside="true"');
    expect(section).toBeGreaterThan(0);
    expect(section).toBeLessThan(html.indexOf("on the road"));
    expect(section).toBeLessThan(html.indexOf("of driving left today"));
    expect(section).toBeLessThan(html.indexOf("I&#x27;m in the mood for"));
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
    // snap leaves room for the list: the box's own padding above the
    // section (which is first in it, round 6) and the section through
    // "Show all" fit the box, 532 of its 537 px.
    expect(SHEET_BOX_PADDING_PX + ROADSIDE_LIST_PX).toBeLessThanOrEqual(sheetScrollBoxPx(844, 1));
    expect(SHEET_BOX_PADDING_PX).toBe(8);
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
    expect(html).toMatch(/class="plan-sheet-scroll [^"]*overflow-y-auto p-2 /);
    // Nothing between the box's top and the section: it is the box's first child.
    expect(html).toMatch(/class="plan-sheet-scroll [^"]*"><section data-roadside="true"/);
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.plan-sheet-scroll\s*\{[^}]*height:\s*calc\(100% - var\(--sheet-y, 25%\) - 45px\)/);
    expect(css).toMatch(/\.plan-sheet\s*\{[^}]*height:\s*92dvh/);
    // The rows are two lines of 22 px with no vertical padding, so ten are 440.
    expect(html).toMatch(/data-roadside-stop="osm:node:113"><button[^>]*class="w-full min-h-\[44px\] text-left px-2 py-0 /);
    // The map is told where the sheet's edge is, so its fit can frame the
    // road in the strip above it: 100 - 92 * 0.75.
    expect(sheetTopDvh(1)).toBe(31);
  });

  it("fits the road into the strip of map above the sheet at rest, on a phone", () => {
    // Round 4's rest capture, measured: the map at y 45, 799 px tall; the
    // sheet's edge at y 263, so a 218 px strip; Amarillo's dot at y 281,
    // Austin's at 549, the whole road under the sheet and Kansas in the
    // strip. That is the fit padded for the whole map. Padded by the
    // sheet's share of it, the fit frames the road in the strip.
    const phone = { mapTopPx: 45, mapHeightPx: 799, viewportHeightPx: 844, sheetTopDvh: sheetTopDvh(1), phone: true };
    const pad = fitPaddingPx(phone);
    const strip = (844 * sheetTopDvh(1)) / 100 - 45;
    expect(strip).toBeCloseTo(216.6, 0);
    // The strip is one function, read by the fit and by the spread's box.
    expect(stripHeightPx(phone)).toBeCloseTo(strip, 5);
    expect(stripHeightPx({ ...phone, phone: false })).toBeUndefined();
    expect(stripHeightPx({ ...phone, sheetTopDvh: undefined })).toBeUndefined();
    // The inner area the corridor is fitted into, and the largest whole
    // zoom at which the corridor fits it by the map's own projection: 5.
    // At 6 the road is 267 px tall (the capture's 268 is the dots' rounded
    // centres) and cannot.
    const innerW = 390 - pad.left - pad.right;
    const innerH = 799 - pad.top - pad.bottom;
    const size = (z: number) => {
      const a = mercatorPx(base.origin.lat, base.origin.lng, z);
      const b = mercatorPx(base.destination.lat, base.destination.lng, z);
      return { w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    };
    const fits = (z: number) => size(z).w <= innerW && size(z).h <= innerH;
    const zoom = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].find(fits);
    expect(zoom).toBe(5);
    expect(Math.round(size(6).h)).toBe(267);
    // Centred in that area, every point of the road from the start's dot
    // to the end's sits above the sheet's edge, with the start's name
    // (30 px above its dot) inside the map and room under the end for a
    // ring's second row.
    const top = pad.top + (innerH - size(5).h) / 2;
    const bottom = top + size(5).h;
    expect(top).toBeGreaterThanOrEqual(36);
    expect(bottom + 22).toBeLessThan(strip);
    // The numbers the frame rests on, pinned after the frame so a wrong
    // padding fails on the frame first: the sheet's share of the map plus
    // the margins; the start's name and a ring above and beside, a ring's
    // lower members below.
    expect(pad).toEqual({ ...STRIP_MARGIN_PX, bottom: Math.round(799 - strip) + STRIP_MARGIN_PX.bottom });
    expect(innerW).toBe(310);
    expect(innerH).toBe(145);
    expect(STRIP_MARGIN_PX).toEqual({ top: 40, right: 40, bottom: 32, left: 40 });
    // A strip too short to frame a road falls back; so does a desktop, or
    // a map with no sheet: the margins as before.
    expect(STRIP_MIN_PX).toBe(140);
    expect(fitPaddingPx({ ...phone, viewportHeightPx: 390, mapTopPx: 45 })).toEqual(FIT_MARGIN_PX);
    expect(fitPaddingPx({ ...phone, phone: false })).toEqual(FIT_MARGIN_PX);
    expect(fitPaddingPx({ ...phone, sheetTopDvh: undefined })).toEqual(FIT_MARGIN_PX);
    expect(FIT_MARGIN_PX).toEqual({ top: 60, right: 60, bottom: 120, left: 60 });
  });

  it("draws the map's own buttons at the 44 px target", () => {
    // Google's zoom control is 40 px by default (round-4 critic, rule 7).
    // `controlSize` is a constructor-time option, so it is a constant
    // given with the map; the source is pinned because the option never
    // reaches the server-rendered markup.
    expect(MAP_CONTROL_SIZE_PX).toBe(44);
    const src = readFileSync(new URL("../RouteMap.tsx", import.meta.url), "utf8");
    expect(src).toContain("controlSize={MAP_CONTROL_SIZE_PX}");
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
    // And a way to close it: the word in a bordered 44 px box, not a
    // glyph, which read as 18 px in the round-5 capture (rule 7).
    expect(html).toMatch(/<button[^>]*aria-label="Close The Big Texan Steak Ranch"[^>]*class="[^"]*\bh-11 px-3 flex items-center border\b[^"]*"[^>]*>Close<\/button>/);
    expect(html).not.toContain("×");
    // Above the list: the card comes before the heading and the first row,
    // and, the section being first in the sheet, before the numbers.
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("places worth pulling over for"));
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("data-roadside-stop="));
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("on the road"));
    // The tapped row is marked as the open one.
    expect(html).toMatch(/data-roadside-stop="osm:way:1"><button[^>]*aria-expanded="true"/);
  });

  it("says what the map has a stop down as when the store has no line: not a placeholder, not the kind as a sentence", () => {
    // The store's `about` is already the encyclopedia's, else the map's
    // own (survivors.ts), so a null is a place the map has only a kind
    // for. Round 1 said "A historic place.", which only repeated the line
    // beneath; round 5 said "No write-up for this one.", a placeholder to
    // its critic. The line is the map's, in the map's terms.
    expect(roadsideMapLine("historic")).toBe("On the map as a historic place; nothing written about it yet.");
    expect(roadsideMapLine("attraction")).toBe("On the map as an attraction; nothing written about it yet.");
    expect(roadsideMapLine("other")).toBe("On the map as a place; nothing written about it yet.");
    const html = renderToString(<RoadsideCard stop={stops[1]} />).replace(/<!-- -->/g, "");
    expect(html).toMatch(/data-roadside-line[^>]*>On the map as a historic place; nothing written about it yet\.</);
    expect(html).toMatch(/data-roadside-where[^>]*>historic place · 6 mi in</);
    expect(html).not.toContain("No write-up");
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

  it("draws a diamond in amber, 32 of its 44 px canvas, a different shape and colour from a city dot or a numbered square", () => {
    // 18 px wide, the round-5 critic read it as well under the 44 px
    // target (rule 7); the canvas was 44 all along, and now the diamond
    // shows most of it.
    const svg = roadsideMarkerSvg();
    expect(DIAMOND_PX).toBe(32);
    expect(svg).toContain('width="44" height="44"');
    expect(svg).toContain("M22 6 L38 22 L22 38 L6 22 Z");
    expect(svg).toContain(ROADSIDE_COLOR);
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain("<rect");
    // The tapped one is larger with a light stroke, still a diamond.
    const active = roadsideMarkerSvg(ROADSIDE_COLOR, true);
    expect(active).toContain("M22 3 L41 22 L22 41 L3 22 Z");
    expect(active).toContain('stroke="#f0f6fc"');
    expect(active).not.toContain("<circle");
  });

  it("places each diamond on its own point or the first free slot beside it, checked against every diamond on the map", () => {
    // The round-5 critic's pair, from the store: Amarillo's three and
    // Plainview's museum, whose point is 28 px below Amarillo's at zoom 5.
    // Round 3's ring put The Big Texan 25 px below its point, 3 px from the
    // museum, and a tap on it opened the museum's card. Every diamond is
    // now placed against every one placed before it.
    const four = [
      { id: "osm:way:1059981743", name: "The Big Texan Steak Ranch", lat: 35.193825536666665, lng: -101.75513534333332, p: 0.83 },
      { id: "osm:node:609552420", name: "Helium Monument", lat: 35.1995522, lng: -101.913324, p: 0.72 },
      { id: "osm:node:13597850817", name: "Amarillo Mural", lat: 35.2006308, lng: -101.8376103, p: 0.71 },
      { id: "osm:node:368165750", name: "Museum of the Llano Estacado", lat: 34.1884584, lng: -101.72636, p: 0.72 },
    ];
    const zoom = 5;
    const at = (s: { lat: number; lng: number }) => mercatorPx(s.lat, s.lng, zoom);
    const big = at(four[0]);
    const llano = at(four[3]);
    expect(llano.y - big.y).toBeCloseTo(28, 0);
    const where = (placed: Map<string, { dx: number; dy: number; shown: boolean }>) =>
      four.filter((s) => placed.get(s.id)!.shown).map((s) => ({ id: s.id, x: at(s).x + placed.get(s.id)!.dx, y: at(s).y + placed.get(s.id)!.dy }));
    const apart = (pts: { x: number; y: number }[]) => {
      let least = Infinity;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) least = Math.min(least, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      return least;
    };
    const placed = roadsideSpread(four, zoom);
    expect([...placed.values()].every((p) => p.shown)).toBe(true);
    expect(apart(where(placed))).toBeGreaterThanOrEqual(SPREAD_PX);
    // The strongest keeps its own point; the museum, stronger than the
    // monument by id at the same p, takes the first slot, to the right;
    // the monument the next, to the left; and none of the three is on
    // another's point any more.
    expect(placed.get("osm:way:1059981743")).toEqual({ dx: 0, dy: 0, shown: true });
    expect(placed.get("osm:node:368165750")).toEqual({ dx: 44, dy: 0, shown: true });
    expect(placed.get("osm:node:609552420")).toEqual({ dx: -44, dy: 0, shown: true });
    // The tapped one is placed first, so it is on its own point whatever
    // its strength, and the strongest moves instead.
    const tapped = roadsideSpread(four, zoom, "osm:node:13597850817");
    expect(tapped.get("osm:node:13597850817")).toEqual({ dx: 0, dy: 0, shown: true });
    expect(tapped.get("osm:way:1059981743")!.dx ** 2 + tapped.get("osm:way:1059981743")!.dy ** 2).toBeGreaterThanOrEqual(SPREAD_PX ** 2 - 1);
    expect(apart(where(tapped))).toBeGreaterThanOrEqual(SPREAD_PX);
    // Zoomed to the town they are hundreds of pixels apart: nothing moves.
    for (const [, p] of roadsideSpread(four, 13)) expect(p).toEqual({ dx: 0, dy: 0, shown: true });
    // The slots: 44 px out then 88, sideways first, then up, then down.
    expect(SPREAD_PX).toBe(44);
    expect(SPREAD_SLOTS).toHaveLength(36);
    expect(SPREAD_SLOTS.slice(0, 2)).toEqual([{ dx: 44, dy: 0 }, { dx: -44, dy: 0 }]);
    for (const [i, d] of SPREAD_SLOTS.entries()) expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(i < 12 ? 44 : 88, 0);
    expect(SPREAD_SLOTS.slice(2, 7).every((d) => d.dy < 0)).toBe(true);
    expect(SPREAD_SLOTS.slice(7, 12).every((d) => d.dy > 0)).toBe(true);
  });

  it("keeps a moved diamond inside the strip above the sheet and leaves a diamond on its own point where it is", () => {
    // Austin's five at the state-wide rule and Lampasas's spur, 24 px from
    // Austin's point at zoom 5, at the bottom of the strip: the round-5
    // capture had two of them half under the sheet's edge, put there by
    // the ring. The box is the map's bounds cut at the sheet's edge, and
    // no moved diamond leaves it.
    const austin = [
      { id: "weird", lat: 30.2670541, lng: -97.7387385, p: 0.79 },
      { id: "spur", lat: 31.0512747, lng: -98.1821685, p: 0.76 },
      { id: "alamo", lat: 30.2738275, lng: -97.7404918, p: 0.74 },
      { id: "rooster", lat: 30.2596728, lng: -97.6711017, p: 0.73 },
      { id: "capitol", lat: 30.27473294, lng: -97.740329056666667, p: 0.72 },
      { id: "junk", lat: 30.2186884, lng: -97.7717656, p: 0.71 },
      { id: "lbj", lat: 30.28583478, lng: -97.729264379999989, p: 0.7 },
    ];
    const zoom = 5;
    const at = (s: { lat: number; lng: number }) => mercatorPx(s.lat, s.lng, zoom);
    const end = at(austin[0]);
    // A 390 by 799 map whose strip is 218 px, the end's point 38 px above
    // the sheet's edge (the round-5 frame), as the map's own bounds give
    // it: the box is inset by half the diamond.
    const half = DIAMOND_PX / 2;
    const top = end.y + 38 - 218;
    const left = end.x - 242;
    const box: PxBox = { left: left + half, top: top + half, right: left + 390 - half, bottom: top + 218 - half };
    const placed = roadsideSpread(austin, zoom, null, box);
    expect([...placed.values()].every((p) => p.shown)).toBe(true);
    expect(placed.get("weird")).toEqual({ dx: 0, dy: 0, shown: true });
    for (const s of austin) {
      const p = placed.get(s.id)!;
      if (p.dx === 0 && p.dy === 0) continue;
      const y = at(s).y + p.dy;
      const x = at(s).x + p.dx;
      expect(y).toBeLessThanOrEqual(box.bottom);
      expect(y).toBeGreaterThanOrEqual(box.top);
      expect(x).toBeGreaterThanOrEqual(box.left);
      expect(x).toBeLessThanOrEqual(box.right);
    }
    // Without the box the same stops take a slot below the edge: the box
    // is what keeps them out from under the sheet.
    const loose = roadsideSpread(austin, zoom);
    expect(austin.some((s) => at(s).y + loose.get(s.id)!.dy > box.bottom)).toBe(true);
    // A stop whose own point is under the sheet is drawn where it is, not
    // pulled up: the box holds moved diamonds only.
    const under = [{ id: "far", lat: 30.2670541 - 3, lng: -97.7387385, p: 0.9 }];
    expect(at(under[0]).y).toBeGreaterThan(box.bottom);
    expect(roadsideSpread(under, zoom, null, box).get("far")).toEqual({ dx: 0, dy: 0, shown: true });
    // The box from the map's bounds: a 390 by 799 map at zoom 5 with a
    // 218 px strip is 358 by 186 inside the inset; with no strip, the
    // whole map less the inset.
    const nw = { lat: 36, lng: -104 };
    const size = 256 * 2 ** zoom;
    const east = nw.lng + (390 / size) * 360;
    const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (mercatorPx(nw.lat, nw.lng, zoom).y + 799)) / size))) * 180) / Math.PI;
    const b = diamondBox({ north: nw.lat, west: nw.lng, south, east }, zoom, half, 218);
    expect(b.right - b.left).toBeCloseTo(390 - DIAMOND_PX, 3);
    expect(b.bottom - b.top).toBeCloseTo(218 - DIAMOND_PX, 3);
    const whole = diamondBox({ north: nw.lat, west: nw.lng, south, east }, zoom, half);
    expect(whole.bottom - whole.top).toBeCloseTo(799 - DIAMOND_PX, 3);
    // And the map runs the pass whenever its camera settles, so the box
    // holds after a pan or a zoom, not only at the fit.
    const src = readFileSync(new URL("../RouteMap.tsx", import.meta.url), "utf8");
    expect(src).toContain('map.addListener("idle", apply)');
    expect(src).not.toContain("zoom_changed");
  });

  it("lets a point hold only so many and the rest wait for a closer zoom, the tapped one always in", () => {
    // Twenty-two on one point: downtown at a town zoom. The slots 44 px
    // out hold six around the centre, the slots 88 px out ten more; the
    // rest wait.
    const many = Array.from({ length: 22 }, (_, i) => ({ id: `s${i}`, name: `Stop ${i}`, lat: 30.2672 + i * 0.0001, lng: -97.7431, p: 0.9 - i * 0.02 }));
    const placed = roadsideSpread(many, 10);
    const shown = [...placed.entries()].filter(([, p]) => p.shown).map(([id]) => id);
    expect(shown).toHaveLength(17);
    // The strongest show; the weakest wait.
    for (let i = 0; i < 17; i++) expect(placed.get(`s${i}`)!.shown).toBe(true);
    for (let i = 17; i < 22; i++) expect(placed.get(`s${i}`)).toEqual({ dx: 0, dy: 0, shown: false });
    // Every shown pair is a touch canvas apart.
    const pts = shown.map((id) => {
      const s = many.find((m) => m.id === id)!;
      const at = mercatorPx(s.lat, s.lng, 10);
      return { x: at.x + placed.get(id)!.dx, y: at.y + placed.get(id)!.dy };
    });
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(SPREAD_PX - 1e-6);
    // The tapped one, the weakest, is placed first on its own point (2 px
    // from the strongest's, so the packing around it shifts by a slot or
    // two), and the others that no longer fit wait instead.
    const kept = roadsideSpread(many, 10, "s21");
    expect(kept.get("s21")).toEqual({ dx: 0, dy: 0, shown: true });
    const keptShown = [...kept.values()].filter((p) => p.shown).length;
    expect(keptShown).toBeGreaterThanOrEqual(15);
    expect(keptShown).toBeLessThanOrEqual(17);
    expect(kept.get("s0")!.shown).toBe(true);
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
