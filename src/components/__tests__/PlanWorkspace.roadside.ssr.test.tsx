import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { formatDistance } from "@/lib/routing/format";
import { existsSync, readFileSync } from "node:fs";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace, {
  RoadsideCard,
  roadsideMapLine,
  roadsideAlongText,
  roadsideSwipeCloses,
  SWIPE_PX,
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
  PLAN_HEADER_PX,
  MAP_CONTROL_SIZE_PX,
} from "@/components/RouteMap";
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

/** Web Mercator pixels at a zoom with 256 px tiles, what Google's map draws; only differences between points are used. */
const mercatorPx = (lat: number, lng: number, zoom: number) => {
  const size = 256 * Math.pow(2, zoom);
  const phi = (lat * Math.PI) / 180;
  return { x: ((lng + 180) / 360) * size, y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size };
};

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
    // critic: three rows at the end read "494 mi in" and nothing else), in
    // a person's words (U2's round-2 critic: "494 mi in, at Austin" read
    // as engineer shorthand).
    expect(html).toContain("well-known place · 6 miles along, in Amarillo");
    expect(html).toContain("historic place · 6 miles along, in Amarillo");
    expect(html).not.toContain(" mi in");
    expect(html).not.toContain("km in");
    // Two stops, both shown: no "Show all" control below the ten.
    expect(html).not.toContain("data-roadside-show-all");
    // The list does not carry the old engineer heading.
    expect(html).not.toContain("Roadside stops along the way");
  });

  it("shows the ten strongest first, then a control that says how many there are in all", () => {
    // A drive within the budget, so the road is one day and one list
    // (since U3 a day over the budget is cut, and the list with it).
    const html = render({ roadsideStops: fourteen, initialDurationSeconds: 4 * 3600 });
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

  it("sits inside its day, after that day's towns, with the sheet's title above everything and the numbers and the mood before the days", () => {
    // U1 put the list first in the box (rounds 3 to 6: under the header
    // it showed seven rows and no "Show all"; after the towns a sticky
    // town header sat over a half-clipped row). Since U3 the sheet is told
    // as days, and each day holds its towns and then its places: a town's
    // sticky header stays inside its own section, above the rows, never
    // over them. The list is inside the day's section, after the towns.
    const html = render({ roadsideStops: fourteen, ...withTown });
    const day = html.indexOf('<section data-day="1"');
    const section = html.indexOf('<section data-roadside="true"');
    expect(day).toBeGreaterThan(0);
    expect(section).toBeGreaterThan(day);
    expect(html.indexOf("sticky top-0")).toBeGreaterThan(day);
    expect(html.indexOf("sticky top-0")).toBeLessThan(section);
    expect(html.indexOf("What&#x27;s in Lubbock")).toBeLessThan(section);
    // The trip's numbers and the mood come before the days.
    expect(html.indexOf("on the road")).toBeLessThan(day);
    expect(html.indexOf("of driving left today")).toBeLessThan(day);
    expect(html.indexOf("I&#x27;m in the mood for")).toBeLessThan(day);
    // The sheet's title on the handle row is above everything (U2, round
    // 2: the sentence over the towns is the first thing seen), not in the
    // scroll box, so it costs the box nothing.
    expect(html.indexOf("Lubbock fits today")).toBeLessThan(html.indexOf("plan-sheet-scroll"));
    expect(html.indexOf("Lubbock fits today")).toBeLessThan(day);
    // The Save button stays last.
    expect(html.indexOf("Save trip")).toBeGreaterThan(html.indexOf("data-roadside-show-all"));
  });

  it("keeps the sheet's geometry: the box is the visible part, at rest it holds a day's list of ten and the control, and the map is told where the edge is", () => {
    // Round 3's list capture had six rows cut off and no control: the
    // scroll box was the whole 92 dvh sheet (731 px) with 382 px of it on
    // screen at the half snap, so the section could neither reach the top
    // nor show ten rows. The box is the visible part, and the rest snap
    // was sized so a list of ten and "Show all" fit it, 520 of its 537 px
    // with the box's padding. Since U3 the list sits inside its day under
    // the day's towns, so it is reached by a scroll, not on the first
    // screen; the snap and the box keep their size, so a day's list still
    // fits the box whole once scrolled to.
    expect(SHEET_BOX_PADDING_PX + ROADSIDE_LIST_PX).toBeLessThanOrEqual(sheetScrollBoxPx(844, 1) - 16);
    expect(SHEET_BOX_PADDING_PX).toBe(8);
    // At the old half snap, 45 percent hidden, it could not have fit.
    expect(Math.floor((844 * 92 * 55) / 10_000) - 45).toBeLessThan(ROADSIDE_LIST_PX);
    // The numbers the arithmetic rests on, pinned so the CSS below and
    // this file cannot drift apart silently.
    expect(SHEET_SNAPS).toEqual([80, 25, 8]);
    expect(SHEET_HEIGHT_DVH).toBe(92);
    expect(SHEET_HANDLE_PX).toBe(45);
    expect(ROADSIDE_LIST_PX).toBe(512);
    // The sheet opens at the rest snap, and the scroll box carries the class
    // whose CSS makes it the visible part.
    const html = render({ roadsideStops: fourteen });
    expect(html).toContain("--sheet-y:25%");
    expect(html).toMatch(/class="plan-sheet-scroll [^"]*overflow-y-auto p-2 /);
    // The list is inside its day's section (U3), right under the heading
    // here since no town fits in this fixture.
    expect(html).toMatch(/<section data-day="1"[^>]*><h2 [^>]*><button[^>]*>[\s\S]*?<\/h2><section data-roadside="true"/);
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    // The visible part of the sheet is a column of the handle row and the
    // box (U2, round 2, when the sheet's title joined the handle row): the
    // box is what the handle leaves, so it ends at the screen's edge
    // whatever the handle's height, where the fixed
    // calc(100% - var(--sheet-y) - 45px) assumed a 44 px handle.
    expect(css).toMatch(/\.plan-sheet-visible\s*\{[^}]*height:\s*calc\(100% - var\(--sheet-y, 25%\)\)/);
    expect(css).toMatch(/\.plan-sheet-scroll\s*\{[^}]*flex:\s*1 1 0%;\s*min-height:\s*0/);
    expect(html).toMatch(/class="plan-sheet-visible"><div [^>]*class="relative [^"]*min-h-\[44px\]/);
    expect(css).toMatch(/\.plan-sheet\s*\{[^}]*height:\s*92dvh/);
    // Nothing above the heading, nothing between it and the first row.
    expect(html).toMatch(/<section data-roadside="true" [^>]*class="font-sans px-1 pt-0 pb-2"/);
    expect(html).toMatch(/<\/h2><ul><li data-roadside-stop="osm:node:113">/);
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
    //
    // The map's top is the masthead's bottom, and this test used to put
    // it at round 4's 45 while U2 had made the masthead 69 (73 with a
    // deadline line); the fit reads the real box, so the road fell to
    // zoom 4 and the strip showed a third of the country while this test
    // passed (Gauntlet U3). The strip is now taken from PLAN_HEADER_PX,
    // which the page's SSR test pins to the masthead's classes.
    const mapTop = PLAN_HEADER_PX;
    const phone = { mapTopPx: mapTop, mapHeightPx: 844 - mapTop, viewportHeightPx: 844, sheetTopDvh: sheetTopDvh(1), phone: true };
    const pad = fitPaddingPx(phone);
    const strip = (844 * sheetTopDvh(1)) / 100 - mapTop;
    expect(strip).toBeCloseTo(212.6, 0);
    // The strip is one function, read by the fit.
    expect(stripHeightPx(phone)).toBeCloseTo(strip, 5);
    expect(stripHeightPx({ ...phone, phone: false })).toBeUndefined();
    expect(stripHeightPx({ ...phone, sheetTopDvh: undefined })).toBeUndefined();
    // The inner area the corridor is fitted into, and the largest whole
    // zoom at which the corridor fits it by the map's own projection: 5.
    // At 6 the road is 267 px tall (the capture's 268 is the dots' rounded
    // centres) and cannot.
    const innerW = 390 - pad.left - pad.right;
    const innerH = phone.mapHeightPx - pad.top - pad.bottom;
    const size = (z: number) => {
      const a = mercatorPx(base.origin.lat, base.origin.lng, z);
      const b = mercatorPx(base.destination.lat, base.destination.lng, z);
      return { w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    };
    const fitsAt = (inner: { w: number; h: number }) => (z: number) => size(z).w <= inner.w && size(z).h <= inner.h;
    const zoom = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].find(fitsAt({ w: innerW, h: innerH }));
    expect(zoom).toBe(5);
    expect(Math.round(size(6).h)).toBe(267);
    // With U2's 73 px masthead the same arithmetic gives zoom 4, the
    // country: the strip is 189, the inner area 117, and the road is 134
    // tall at zoom 5. That is what the round-1 screenshot of U3 must not
    // show, and why the masthead has no vertical padding.
    const tall = { ...phone, mapTopPx: 73, mapHeightPx: 844 - 73 };
    const tallPad = fitPaddingPx(tall);
    const tallInner = { w: 390 - tallPad.left - tallPad.right, h: tall.mapHeightPx - tallPad.top - tallPad.bottom };
    expect(tallInner.h).toBe(117);
    expect([12, 11, 10, 9, 8, 7, 6, 5, 4, 3].find(fitsAt(tallInner))).toBe(4);
    // Centred in that area, every point of the road from the start's dot
    // to the end's sits above the sheet's edge, with the start's name
    // (30 px above its dot) inside the map and room under the end for its
    // diamond's canvas.
    const top = pad.top + (innerH - size(5).h) / 2;
    const bottom = top + size(5).h;
    expect(top).toBeGreaterThanOrEqual(36);
    expect(bottom + 22).toBeLessThan(strip);
    // The numbers the frame rests on, pinned after the frame so a wrong
    // padding fails on the frame first: the sheet's share of the map plus
    // the margins; the start's name above, a name's width and a diamond's
    // canvas beside, the end's diamond below.
    expect(pad).toEqual({ ...STRIP_MARGIN_PX, bottom: Math.round(phone.mapHeightPx - strip) + STRIP_MARGIN_PX.bottom });
    expect(innerW).toBe(310);
    expect(innerH).toBe(141);
    // The map takes fractional zooms (Gauntlet U3, round 5), so the fit
    // lands where the road fills the inner area rather than on the whole
    // zoom below it: here between 5 and 6, with the road's height the
    // area's 141 px, not zoom 5's 134; and a framed day 145 px tall at
    // zoom 7 keeps 141 rather than dropping to 72 at zoom 6 and sitting
    // small in the strip with the next day's road running on under the
    // sheet. The option is on the map's source; the zoom is the
    // projection's own arithmetic (a zoom step doubles the size).
    const map = readFileSync(new URL("../RouteMap.tsx", import.meta.url), "utf8");
    expect(map).toMatch(/^\s*isFractionalZoomEnabled\s*$/m);
    const fractional = Math.min(5 + Math.log2(innerW / size(5).w), 5 + Math.log2(innerH / size(5).h));
    expect(fractional).toBeGreaterThan(5);
    expect(fractional).toBeLessThan(6);
    const at = size(fractional);
    expect(Math.max(at.w / innerW, at.h / innerH)).toBeCloseTo(1, 6);
    expect(Math.round(at.h)).toBe(innerH);
    expect(PLAN_HEADER_PX).toBe(49);
    expect(STRIP_MARGIN_PX).toEqual({ top: 40, right: 40, bottom: 32, left: 40 });
    // A strip too short to frame a road falls back; so does a desktop, or
    // a map with no sheet: the margins as before.
    expect(STRIP_MIN_PX).toBe(140);
    expect(fitPaddingPx({ ...phone, viewportHeightPx: 390 })).toEqual(FIT_MARGIN_PX);
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
    // 1. The name, as a heading. The heading is the card's own close: a
    //    44 px button carrying the name, marked open, and no separate
    //    "Close" button or glyph (the spec: a second tap or a swipe; the
    //    round-5 card had a glyph, the round-6 card a "Close" button).
    expect(html).toMatch(/<h3[^>]*><button type="button" aria-expanded="true" class="w-full min-h-\[44px\] [^"]*"><span[^>]*>The Big Texan Steak Ranch<\/span>/);
    expect(html).not.toMatch(/>Close</);
    expect(html).not.toContain('aria-label="Close');
    // 2. The line about it, from the store.
    expect(html).toMatch(/data-roadside-line[^>]*>A large steakhouse and motel\. A roadside attraction known for competitive eating\.</);
    // 3 and 4. The kind in plain words and how far along the road, with the
    // town it is at: the Big Texan is 7 km from the start, Amarillo.
    expect(html).toMatch(/data-roadside-where[^>]*>well-known place · 6 miles along, in Amarillo</);
    // 5. One link-button that opens the place in Maps.
    expect(html).toMatch(/<a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=35\.19381,-101\.75510"[^>]*>Open in Maps<\/a>/);
    expect(html).not.toContain("×");
    // Above the list: the card comes before the heading and the first row,
    // inside the day the stop belongs to (U3), which is after the numbers.
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("places worth pulling over for"));
    expect(html.indexOf("data-roadside-card")).toBeLessThan(html.indexOf("data-roadside-stop="));
    expect(html.indexOf("data-roadside-card")).toBeGreaterThan(html.indexOf('<section data-day="1"'));
    expect(html.indexOf("data-roadside-card")).toBeGreaterThan(html.indexOf("on the road"));
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
    expect(html).toMatch(/data-roadside-where[^>]*>historic place · 6 miles along the road</);
    expect(html).not.toContain("No write-up");
    expect(html).not.toContain("A historic place.");
  });

  it("says how far in miles, the sheet's own unit, in a person's words, and which town it is in or past", () => {
    // "131 miles along the road", not "131 mi in" (U2's round-2 critic:
    // engineer shorthand). Rounded as the sheet's summary rounds.
    expect(roadsideAlongText(211.6)).toBe("131 miles along the road");
    expect(roadsideAlongText(211.6)).toContain(formatDistance(211_600).replace(" mi", " miles"));
    expect(roadsideAlongText(9, { name: "Amarillo", near: true })).toBe("6 miles along, in Amarillo");
    expect(roadsideAlongText(211.6, { name: "Lubbock", near: false })).toBe("131 miles along, past Lubbock");
    expect(roadsideAlongText(1.6)).toBe("1 mile along the road");
    // Under a mile the same shape, not a different sentence (round-2 critic:
    // "Right at the start" beside "6 km in" read as two styles), and in
    // lower case, since it always follows the kind mid-line (round 3).
    expect(roadsideAlongText(0.3)).toBe("less than a mile along the road");
    expect(roadsideAlongText(0.3, { name: "Amarillo", near: true })).toBe("less than a mile along, in Amarillo");
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
    // The replacements are there instead: the header over the towns is a
    // sentence built from the data (U2), not a count.
    expect(text).toContain("Lubbock fits today");
    expect(text).not.toMatch(/\d+ towns? that fit/);
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

  it("draws every diamond on its place's own latitude and longitude, and never moves one", () => {
    // Rounds 3 to 6 spread diamonds whose points were within a touch
    // canvas of each other into rings and then slots, and a moved diamond
    // said a place was up to 88 px from where it is, over three degrees at
    // zoom 5. The operator's call after six rounds: a diamond is drawn
    // where the place is, always, and never moves when one is tapped;
    // overlap at a state-wide zoom is what the zoom rule and a pinch are
    // for. So the icon's anchor is the canvas's centre on the marker's
    // position, with nothing to offset it by; the file that moved them is
    // gone and the map does not import it; and the zoom rule is the one
    // thing that changes with the camera.
    const src = readFileSync(new URL("../RouteMap.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/function roadsideMarkerIcon\(active = false\): google\.maps\.Icon \{\s*return \{\s*url: [^\n]*\n\s*anchor: new google\.maps\.Point\(22, 22\),/);
    expect(src).not.toMatch(/roadside\/spread|roadsideSpread|diamondBox|\bdx\b|\bdy\b/);
    expect(existsSync(new URL("../../lib/roadside/spread.ts", import.meta.url))).toBe(false);
    expect(src).toContain('map.addListener("zoom_changed", apply)');
    expect(src).not.toContain('addListener("idle"');
  });

  it("closes the card on a sideways swipe, not on a scroll or a tap", () => {
    expect(SWIPE_PX).toBe(60);
    expect(roadsideSwipeCloses(80, 10)).toBe(true);
    expect(roadsideSwipeCloses(-80, -10)).toBe(true);
    expect(roadsideSwipeCloses(60, 0)).toBe(true);
    // A finger scrolling the sheet over the card moves mostly up or down.
    expect(roadsideSwipeCloses(70, 90)).toBe(false);
    expect(roadsideSwipeCloses(0, 120)).toBe(false);
    // A tap, or a short sideways nudge, is not a swipe.
    expect(roadsideSwipeCloses(0, 0)).toBe(false);
    expect(roadsideSwipeCloses(59, 0)).toBe(false);
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
