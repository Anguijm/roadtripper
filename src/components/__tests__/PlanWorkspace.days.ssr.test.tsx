import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import type { RoadsideMarker } from "@/lib/roadside/along";

/**
 * The plan sheet told as days (Gauntlet U3; quality bar, rule 5), rendered
 * on the server as /health renders it. The road is the one days.test.ts
 * uses, due south from 35,-101 to 30,-101 (556 km), encoded the way the
 * Routes API encodes it so the sheet decodes it itself; the trip has one
 * stop, Lubbock, so two legs and two days, and the towns and places sit at
 * known distances so each one's day is known in advance.
 */
function encode(points: { lat: number; lng: number }[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const chunk = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    chunk(lat - prevLat);
    chunk(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
const road = encode(Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i * 0.05, lng: -101 })));
const KM_PER_DEG = 111.19;

const lubbock = { cityId: "lubbock", cityName: "Lubbock", lat: 33.5, lng: -101 };
const city = (id: string, name: string, lat: number, lng: number) => ({ id, name, vibeClass: null, detourMinutes: 240, lat, lng });
const cities = [city("plainview", "Plainview", 34, -101.02), city("lubbock", "Lubbock", 33.5, -101), city("post", "Post", 33, -101), city("brady", "Brady", 31, -101)];
const place = (id: string, name: string, alongKm: number, p: number): RoadsideMarker => ({
  id, name, lat: 35 - alongKm / KM_PER_DEG, lng: -101, kind: "attraction", p, about: null, url: null, alongKm,
});

const base = {
  origin: { lat: 35, lng: -101 },
  destination: { lat: 30, lng: -101 },
  encodedPolyline: road,
  candidateMarkers: cities.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, detourMinutes: 240 })),
  waypointFetch: {
    status: "fresh" as const,
    cities,
    waypoints: [
      { id: "wp-1", cityId: "plainview", name: "Plainview mural", type: "culture" as const, trendingScore: 50, neighborhoodId: null, description: "A painted wall downtown." },
      { id: "wp-2", cityId: "lubbock", name: "Buddy Holly Center", type: "culture" as const, trendingScore: 50, neighborhoodId: null, description: "A museum for the singer, in the town he grew up in." },
      { id: "wp-3", cityId: "post", name: "Post cotton gin", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "The gin the town was built around." },
      { id: "wp-4", cityId: "brady", name: "Heart of Texas marker", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "The middle of the state, on a stone." },
    ],
    neighborhoods: {},
  },
  initialPersonaId: "culture" as const,
  budgetHours: 4,
  initialDistanceMeters: 556_000,
  initialDurationSeconds: 7 * 3600 + 50 * 60,
  fromName: "Amarillo",
  toName: "Austin",
  roadsideStops: [place("a", "Cadillac Ranch", 10, 0.9), place("b", "Prairie Dog Town", 250, 0.7), place("c", "Windmill", 400, 0.6)],
};
/** Two legs: Amarillo to Lubbock, 3 h 20 min, and Lubbock to Austin, 4 h 30 min. */
const twoLegs = {
  stops: [lubbock],
  legs: [{ originCityId: "__origin__", destinationCityId: "lubbock", durationSeconds: 200 * 60, distanceMeters: 167_000 }],
  directMinutesToDestination: 270,
};

/** React puts a comment node between adjacent text and an expression; the sheet's text is read with every tag gone. */
const clean = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ([,.;])/g, "$1");
const visible = (html: string) => text(clean(html));
/** The text of each day's section, in order. */
const daySections = (html: string) => [...clean(html).matchAll(/<section data-day="(\d+)"[\s\S]*?(?=<section data-day="|<div class="px-1 py-3"><button)/g)].map((m) => ({ n: m[1], text: text(m[0]) }));

describe("the plan sheet told as days", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("renders two day headings in order for a one-stop trip, with the right towns and places under each", () => {
    const html = renderToString(<PlanWorkspace {...base} initialTrip={twoLegs} />);
    const text = visible(html);
    // The headings, as sentences with the numbers in the mono face; the
    // second day is over the 4 h budget and says so.
    expect(clean(html)).toContain('Day <span class="num">1</span> · Amarillo to Lubbock · <span class="num">3 h 20 min</span>');
    expect(clean(html)).toContain('Day <span class="num">2</span> · Lubbock to Austin · <span class="num">4 h 30 min</span>, over the <span class="num">4 h</span> you wanted');
    expect(text).toContain("Day 1 · Amarillo to Lubbock · 3 h 20 min");
    expect(text).toContain("Day 2 · Lubbock to Austin · 4 h 30 min, over the 4 h you wanted");
    expect(text.indexOf("Day 1 ·")).toBeLessThan(text.indexOf("Day 2 ·"));
    // The sheet's title stays above the days.
    expect(text.indexOf("fit today")).toBeLessThan(text.indexOf("Day 1 ·"));
    const days = daySections(html);
    expect(days.map((d) => d.n)).toEqual(["1", "2"]);
    // Day 1: Plainview and Lubbock (the stop's own town, under the day that
    // ends there), and Cadillac Ranch at 10 km. Not Post, Brady, or the
    // places past Lubbock.
    expect(days[0].text).toContain("Plainview");
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("1 place worth pulling over for");
    expect(days[0].text).toContain("Cadillac Ranch");
    expect(days[0].text).not.toContain("Post");
    expect(days[0].text).not.toContain("Brady");
    expect(days[0].text).not.toContain("Prairie Dog Town");
    expect(days[0].text).not.toContain("Windmill");
    // Day 2: Post and Brady, and the two places at 250 and 400 km.
    expect(days[1].text).toContain("What's in Post");
    expect(days[1].text).toContain("What's in Brady");
    expect(days[1].text).toContain("2 places worth pulling over for");
    expect(days[1].text).toContain("Prairie Dog Town");
    expect(days[1].text).toContain("Windmill");
    expect(days[1].text).not.toContain("Plainview");
    expect(days[1].text).not.toContain("Cadillac Ranch");
    // Under each day the towns come first, then the places.
    for (const d of days) expect(d.text.indexOf("What's in")).toBeLessThan(d.text.indexOf("worth pulling over for"));
    // Lubbock is on the trip, so its control says so; the others say "Stop here".
    expect(days[0].text).toContain("✓ Added");
    expect(days[1].text).toContain("+ Stop here");
  });

  it("makes the heading a 44 px button that says what a tap does, and asks the map for nothing until one", () => {
    const html = clean(renderToString(<PlanWorkspace {...base} initialTrip={twoLegs} />));
    const headings = html.match(/<h2 id="day-\d+-heading"[^>]*><button[^>]*>/g) ?? [];
    expect(headings).toHaveLength(2);
    for (const h of headings) {
      expect(h).toMatch(/aria-pressed="false"/);
      expect(h).toMatch(/class="[^"]*\bmin-h-\[44px\]/);
    }
    expect(html.match(/See it on the map/g)).toHaveLength(2);
    expect(html).not.toContain("See the whole trip");
    // A day with nothing under it says so rather than standing empty.
    const bare = visible(renderToString(<PlanWorkspace {...base} candidateMarkers={[]} waypointFetch={{ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }} roadsideStops={[]} />));
    expect(bare).toContain("Day 1 · Amarillo to Austin · 7 h 50 min, over the 4 h you wanted");
    expect(bare).toContain("Nothing listed along this stretch.");
  });

  it("tells a trip with no stops as one day holding every town and place, and leaves a day's time out until its route is known", () => {
    const one = renderToString(<PlanWorkspace {...base} />);
    const days = daySections(one);
    expect(days).toHaveLength(1);
    expect(visible(one)).toContain("Day 1 · Amarillo to Austin · 7 h 50 min, over the 4 h you wanted");
    for (const name of ["Plainview", "Lubbock", "Post", "Brady", "Cadillac Ranch", "Prairie Dog Town", "Windmill"]) expect(days[0].text).toContain(name);
    expect(days[0].text).toContain("3 places worth pulling over for");
    // A stop whose recompute has not returned: the legs are fewer than the
    // stops, so neither day has a time yet, and nothing says "0 min".
    const pending = visible(renderToString(<PlanWorkspace {...base} initialTrip={{ stops: [lubbock], legs: [], directMinutesToDestination: 470 }} />));
    expect(pending).toContain("Day 1 · Amarillo to Lubbock See it on the map");
    expect(pending).toContain("Day 2 · Lubbock to Austin See it on the map");
    expect(pending).not.toMatch(/\b0 min\b/);
  });

  it("shows the ten strongest places per day and one Show all per day only where a day has more than ten", () => {
    // Fourteen places in day 1 (before Lubbock at 167 km) and three in day 2.
    const many = [
      ...Array.from({ length: 14 }, (_, i) => place(`d1-${i}`, `Early ${i + 1}`, 5 + i * 10, 0.5 + i * 0.03)),
      ...Array.from({ length: 3 }, (_, i) => place(`d2-${i}`, `Late ${i + 1}`, 200 + i * 100, 0.6)),
    ];
    const html = clean(renderToString(<PlanWorkspace {...base} roadsideStops={many} initialTrip={twoLegs} />));
    const days = daySections(html);
    expect(days[0].text).toContain("14 places worth pulling over for");
    expect(days[0].text).toContain("Show all 14");
    expect(days[1].text).toContain("3 places worth pulling over for");
    expect(days[1].text).not.toContain("Show all");
    expect(html.match(/data-roadside-show-all/g)).toHaveLength(1);
    // Ten rows in day 1, strongest first (the fixture's strength rises with the index).
    const rows1 = [...days[0].text.matchAll(/Early (\d+)/g)].map((m) => Number(m[1]));
    expect(rows1).toHaveLength(10);
    expect(rows1[0]).toBe(14);
    expect(rows1[9]).toBe(5);
  });

  it("says the arrival deadline as a sentence on the sheet, the date in the mono face, and nothing without a date", () => {
    const html = clean(renderToString(<PlanWorkspace {...base} dateMode="arrival" startDate="2026-10-13" endDate="2026-10-14" today="2026-10-08" />));
    expect(html).toContain('Arrive in Austin by <span class="num">October 14</span>, six days from now');
    expect(visible(html)).toContain("Arrive in Austin by October 14, six days from now");
    // Past twenty the count is digits, in the mono face.
    const far = clean(renderToString(<PlanWorkspace {...base} dateMode="arrival" startDate="2026-11-01" endDate="2026-11-02" today="2026-10-08" />));
    expect(far).toContain('Arrive in Austin by <span class="num">November 2</span>, <span class="num">25</span> days from now');
    // A range, or no dates: no arrival sentence.
    expect(visible(renderToString(<PlanWorkspace {...base} startDate="2026-10-10" endDate="2026-10-14" today="2026-10-08" />))).not.toContain("Arrive in");
    expect(visible(renderToString(<PlanWorkspace {...base} />))).not.toContain("Arrive in");
  });
});
