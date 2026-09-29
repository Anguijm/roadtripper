import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import { readFileSync } from "node:fs";
import PlanWorkspace from "@/components/PlanWorkspace";
import { candidateOpacity, candidateLabelShown, OFF_DAY_OPACITY } from "@/components/RouteMap";
import type { RoadsideMarker } from "@/lib/roadside/along";
import type { WaypointFetchResult } from "@/lib/routing/scoring";

/**
 * The plan sheet told as days (Gauntlet U3; quality bar, rule 5), rendered
 * on the server as /health renders it. The road is the one days.test.ts
 * uses, due south from 35,-101 to 30,-101 (556 km), encoded the way the
 * Routes API encodes it so the sheet decodes it itself; the trip has one
 * stop, Lubbock, so two stretches, and the towns and places sit at known
 * distances so each one's day is known in advance. Snyder (278 km) sits
 * near where 4 h of the 7 h 50 min direct drive runs out (284 km), and
 * Llano (511 km) near where 4 h of the 4 h 30 min stretch on from Lubbock
 * runs out (513 km), so a cut day has a town to be named by.
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
const cities = [
  city("plainview", "Plainview", 34, -101.02),
  city("lubbock", "Lubbock", 33.5, -101),
  city("post", "Post", 33, -101),
  city("snyder", "Snyder", 32.5, -101),
  city("brady", "Brady", 31, -101),
  city("llano", "Llano", 30.4, -101),
];
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
      { id: "wp-5", cityId: "snyder", name: "White buffalo statue", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "The town's white buffalo, on the square." },
      { id: "wp-4", cityId: "brady", name: "Heart of Texas marker", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "The middle of the state, on a stone." },
      { id: "wp-6", cityId: "llano", name: "Llano courthouse", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "A red granite courthouse on the square." },
    ],
    neighborhoods: {},
  },
  initialMoods: [] as const,
  budgetHours: 4,
  initialDistanceMeters: 556_000,
  initialDurationSeconds: 7 * 3600 + 50 * 60,
  fromName: "Amarillo",
  toName: "Austin",
  roadsideStops: [place("a", "Cadillac Ranch", 10, 0.9), place("b", "Prairie Dog Town", 250, 0.7), place("c", "Windmill", 400, 0.6)],
};
/** Two stretches: Amarillo to Lubbock, 3 h 20 min, and Lubbock to Austin, 4 h 30 min, which is over the 4 h budget and so cut. */
const twoLegs = {
  stops: [lubbock],
  legs: [{ originCityId: "__origin__", destinationCityId: "lubbock", durationSeconds: 200 * 60, distanceMeters: 167_000 }],
  directMinutesToDestination: 270,
};
/** Two stretches that together exceed the budget while each fits a day: 3 h 20 min, then 3 h 50 min. */
const twoDays = { ...twoLegs, directMinutesToDestination: 230 };
/**
 * The towns that fit from Lubbock: the planner offers nothing behind a
 * stop, so Plainview and Lubbock leave the set, and Fredericksburg joins
 * it, four hours from Lubbock by road though the direct road passes
 * nearest it at 526 km, past where 4 h on from Lubbock runs out (513 km).
 */
const fredericksburg = city("fredericksburg", "Fredericksburg", 30.27, -98.87);
const fromLubbock = {
  status: "fresh" as const,
  cities: [cities[2], cities[3], cities[4], cities[5], fredericksburg],
  waypoints: [
    ...base.waypointFetch.waypoints.filter((w) => w.cityId !== "plainview" && w.cityId !== "lubbock"),
    { id: "wp-7", cityId: "fredericksburg", name: "Pacific war museum", type: "culture" as const, trendingScore: 50, neighborhoodId: null, description: "The admiral's home town, and the war he ran." },
  ],
  neighborhoods: {},
};
/** The sheet after Lubbock was added: the towns that fit counted from Lubbock, and Lubbock's own town kept from the set it was added from. */
const afterLubbock = {
  ...base,
  candidateMarkers: fromLubbock.cities.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, detourMinutes: 240 })),
  waypointFetch: fromLubbock,
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

  it("renders a heading per day in order for a one-stop trip whose second stretch is over the budget, each naming where it ends, with the right towns and places under each", () => {
    const html = renderToString(<PlanWorkspace {...afterLubbock} initialTrip={{ ...twoLegs, addedFrom: base.waypointFetch }} />);
    const text = visible(html);
    // The headings, as sentences with the figures alone in the mono face
    // (round 2: "h" and "min" set in mono came out wide-spaced). The
    // stretch on from Lubbock is over the 4 h budget, so it is cut where
    // 4 h runs out, named by the town near there, and the rest is day 3
    // (round 5: round 4's "Days 2 and 3 · Lubbock to Austin" never said
    // where day 2 ended).
    expect(clean(html)).toContain('Day <span class="num">1</span> · Amarillo to Lubbock · <span class="num">3</span> h <span class="num">20</span> min');
    expect(clean(html)).toContain('Day <span class="num">2</span> · Lubbock to near Llano · <span class="num">4</span> h');
    expect(clean(html)).toContain('Day <span class="num">3</span> · near Llano to Austin · <span class="num">30</span> min');
    expect(text).toContain("Day 1 · Amarillo to Lubbock · 3 h 20 min");
    expect(text).toContain("Day 2 · Lubbock to near Llano · 4 h See it on the map");
    expect(text).toContain("Day 3 · near Llano to Austin · 30 min");
    expect(text).not.toMatch(/Days \d/);
    expect(text).not.toContain("over the");
    expect(text.indexOf("Day 1 ·")).toBeLessThan(text.indexOf("Day 2 ·"));
    expect(text.indexOf("Day 2 ·")).toBeLessThan(text.indexOf("Day 3 ·"));
    // The sheet's title stays above the days, and names the day the
    // towns are listed under.
    expect(text).toContain("Post, Snyder and 3 more fit in day 2");
    expect(text.indexOf("fit in day 2")).toBeLessThan(text.indexOf("Day 1 ·"));
    const days = daySections(html);
    expect(days.map((d) => d.n)).toEqual(["1", "2", "3"]);
    // Day 1 ends at Lubbock: the stop's own town, kept from the set it was
    // added from, with its places and "✓ Added", and Cadillac Ranch at
    // 10 km. No town that fits (they are counted from Lubbock, so they are
    // day 2's), no Plainview (behind the stop, gone from the set), none of
    // the places past Lubbock.
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("✓ Added");
    expect(days[0].text).toContain("Buddy Holly Center");
    expect(days[0].text).toContain("1 place worth pulling over for");
    expect(days[0].text).toContain("Cadillac Ranch");
    expect(days[0].text).not.toContain("Towns that fit");
    expect(days[0].text).not.toContain("+ Stop here");
    for (const name of ["Plainview", "Post", "Brady", "Fredericksburg", "Prairie Dog Town", "Windmill"]) expect(days[0].text).not.toContain(name);
    // Day 2, the day after the stop: every town that fits from Lubbock
    // under "Towns that fit in day 2" with "Stop here", Fredericksburg
    // among them though the road passes nearest it past the cut (round
    // 6: by position it sat under Day 3 while the title said day 2); and
    // the two places at 250 and 400 km, on day 2's road.
    expect(days[1].text).toContain("Towns that fit in day 2");
    for (const name of ["What's in Post", "What's in Snyder", "What's in Brady", "What's in Llano", "What's in Fredericksburg", "Pacific war museum"]) expect(days[1].text).toContain(name);
    expect(days[1].text).toContain("+ Stop here");
    expect(days[1].text).toContain("2 places worth pulling over for");
    expect(days[1].text).toContain("Prairie Dog Town");
    expect(days[1].text).toContain("Windmill");
    expect(days[1].text).not.toContain("What's in Lubbock");
    expect(days[1].text).not.toContain("Cadillac Ranch");
    expect(days[1].text.indexOf("Towns that fit in day 2")).toBeLessThan(days[1].text.indexOf("What's in Post"));
    // Day 3, the last 30 min: nothing on the road but Austin.
    expect(days[2].text).toContain("Nothing listed along this stretch.");
    expect(days[2].text).not.toContain("What's in");
    expect(days[2].text).not.toContain("Towns that fit");
    // One assignment: the day the title names is the day whose section
    // lists the towns, and no other section lists one.
    const titled = Number(/fit in day (\d)/.exec(text)![1]);
    expect(days.map((d) => d.text.includes("What's in Fredericksburg"))).toEqual(days.map((d) => Number(d.n) === titled));
    expect(days.map((d) => d.text.includes("+ Stop here"))).toEqual(days.map((d) => Number(d.n) === titled));
    // Under each day with both, the towns come first, then the places.
    for (const d of days.slice(0, 2)) expect(d.text.indexOf("What's in")).toBeLessThan(d.text.indexOf("worth pulling over for"));
    // Lubbock is drawn once, as day 1's end.
    expect(clean(html).match(/data-town="lubbock"/g)).toHaveLength(1);
    expect(clean(html).match(/data-towns-heading/g)).toHaveLength(1);
  });

  it("renders two day sections for two legs that together exceed the budget while each fits a day, and assigns each town and place to the right one", () => {
    // The spec's acceptance: 3 h 20 min then 3 h 50 min on a 4 h budget.
    const html = renderToString(<PlanWorkspace {...afterLubbock} initialTrip={{ ...twoDays, addedFrom: base.waypointFetch }} />);
    const text = visible(html);
    expect(text).toContain("Day 1 · Amarillo to Lubbock · 3 h 20 min");
    expect(text).toContain("Day 2 · Lubbock to Austin · 3 h 50 min");
    expect(text).not.toContain("Day 3");
    const days = daySections(html);
    expect(days.map((d) => d.n)).toEqual(["1", "2"]);
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("Cadillac Ranch");
    expect(days[0].text).not.toContain("Towns that fit");
    expect(days[0].text).not.toContain("Post");
    expect(days[1].text).toContain("Towns that fit in day 2");
    for (const name of ["What's in Post", "What's in Snyder", "What's in Brady", "What's in Llano", "What's in Fredericksburg", "Prairie Dog Town", "Windmill"]) expect(days[1].text).toContain(name);
    expect(days[1].text).not.toContain("What's in Lubbock");
    expect(days[1].text).not.toContain("Cadillac Ranch");
    expect(text).toContain("Two days, with a night in Lubbock");
    expect(text).toContain("fit in day 2");
  });

  it("keeps a stop's town and its places under the day it ends after the towns that fit have moved on, says a cut with no town near it in hours, and stacks nothing above the days", () => {
    // Round 1's failure: the refresh after Lubbock was added counts the
    // towns that fit from Lubbock, so the set was Fort Worth alone, Day 1
    // read "Nothing listed along this stretch", and Lubbock with its
    // places sat in a collapsed "1 stop · Lubbock" row above the days.
    // Fort Worth sits 340 km off this road, so it cannot name the cut on
    // from Lubbock: that day is said in hours (round 6: round 5's "mile
    // 319" was a number a person in a car would not say).
    const fortWorth = city("fort-worth", "Fort Worth", 32.75, -97.33);
    const movedOn = {
      status: "fresh" as const,
      cities: [fortWorth],
      waypoints: [{ id: "wp-9", cityId: "fort-worth", name: "Stockyards", type: "culture" as const, trendingScore: 50, neighborhoodId: null, description: "The old cattle district, kept as it was." }],
      neighborhoods: {},
    };
    const html = clean(renderToString(
      <PlanWorkspace
        {...base}
        roadsideStops={[]}
        candidateMarkers={[{ id: fortWorth.id, name: fortWorth.name, lat: fortWorth.lat, lng: fortWorth.lng, detourMinutes: 240 }]}
        waypointFetch={movedOn}
        initialTrip={{ ...twoLegs, addedFrom: base.waypointFetch }}
      />
    ));
    const text = visible(html);
    const days = daySections(html);
    expect(days.map((d) => d.n)).toEqual(["1", "2", "3"]);
    // Day 1 ends at Lubbock: its row, its state, its places.
    expect(days[0].text).toContain("Day 1 · Amarillo to Lubbock · 3 h 20 min");
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("✓ Added");
    expect(days[0].text).toContain("Buddy Holly Center");
    expect(days[0].text).not.toContain("Nothing listed");
    expect(days[0].text).not.toContain("Plainview");
    // Day 2 is four hours on from Lubbock and holds the town that fits
    // from Lubbock, under what it is, with its control; day 3 is the last
    // half hour, on to Austin. No mile anywhere.
    expect(days[1].text).toContain("Day 2 · 4 h down the road from Lubbock See it on the map");
    expect(days[1].text).toContain("Towns that fit in day 2");
    expect(days[1].text).toContain("What's in Fort Worth");
    expect(days[1].text).toContain("+ Stop here");
    expect(days[1].text).toContain("Stockyards");
    expect(days[1].text).not.toContain("What's in Lubbock");
    expect(days[1].text).not.toContain("Buddy Holly Center");
    expect(days[2].text).toContain("Day 3 · on to Austin · 30 min");
    expect(text).toContain("Three days, with a night in Lubbock and one on the road");
    expect(text).not.toMatch(/\bmile\b/);
    expect(html).toContain('Day <span class="num">2</span> · <span class="num">4</span> h down the road from Lubbock');
    // The title names the day the towns are listed under (round 3: "fits
    // today after Lubbock" stood over a list that put Fort Worth in day
    // 2; round 6: the title said day 2 while Fort Worth, placed by where
    // the road passes nearest it, sat under Day 3), above the days; and
    // between the sheet's numbers and Day 1 there is no itinerary row, no
    // lock and no panel nobody asked for.
    expect(text).toContain("Fort Worth fits in day 2");
    expect(text).not.toContain("fits today");
    const titled = Number(/fits in day (\d)/.exec(text)![1]);
    expect(days.map((d) => d.text.includes("What's in Fort Worth"))).toEqual(days.map((d) => Number(d.n) === titled));
    expect(text).not.toMatch(/\d+ stops? ·|Your trip|Route locked|Loading what's in/);
    // One figure for one drive (round 3): the stop's row has no "away",
    // the day's heading says the route's drive; the town that fits keeps
    // its own, the only figure for that drive on the sheet.
    const row = (id: string) => /<section[^>]*data-town="ID"[\s\S]*?<\/h3>/.source.replace("ID", id);
    expect(visible(new RegExp(row("lubbock")).exec(html)![0]).trim()).toBe("Lubbock");
    expect(visible(new RegExp(row("fort-worth")).exec(html)![0]).trim()).toBe("Fort Worth · 2 h away");
    expect(days[0].text).toContain("Amarillo to Lubbock · 3 h 20 min");
    expect(text.indexOf("on the road")).toBeLessThan(text.indexOf("Day 1 ·"));
    expect(html).not.toContain("itinerary");
    // A stop's town the page's own set no longer holds (a reload with the
    // stops in the URL, say) still has its row, with its name alone.
    const nameOnly = daySections(clean(renderToString(
      <PlanWorkspace {...base} roadsideStops={[]} candidateMarkers={[]} waypointFetch={movedOn} initialTrip={twoLegs} />
    )));
    expect(nameOnly[0].text).toContain("What's in Lubbock");
    expect(nameOnly[0].text).toContain("✓ Added");
    expect(nameOnly[0].text).toContain("Nothing written up for Lubbock yet.");
    expect(nameOnly[0].text).not.toContain("away");
  });

  it("says on the day when its stop's route did not update, and draws the answer to What's in under that town's row", () => {
    const html = clean(renderToString(
      <PlanWorkspace {...base} initialTrip={{ ...twoLegs, legs: [], failedStopId: "lubbock" }} initialPanelCityId="lubbock" />
    ));
    const days = daySections(html);
    expect(days[0].text).toContain("The route didn't update for Lubbock; the drive shown is the old one.");
    expect(days[1].text).not.toContain("didn't update");
    // The answer sits inside Day 1, after Lubbock's rows, and nowhere else.
    expect(html.match(/Loading what's in Lubbock/g)).toHaveLength(1);
    const lubbock = html.indexOf('data-town="lubbock"');
    const answer = html.indexOf("Loading what's in Lubbock");
    expect(answer).toBeGreaterThan(lubbock);
    expect(answer).toBeGreaterThan(html.indexOf("Buddy Holly Center"));
    expect(answer).toBeLessThan(html.indexOf('<section data-day="2"'));
    expect(html).toMatch(/aria-pressed="true"[^>]*>What's in Lubbock<\/button>/);
  });

  it("says the trip's shape in one line under the numbers naming every night, tells each day once, and says nothing for a one-day trip", () => {
    // Round 2's failure: after a stop the phone showed "Day 1 · Amarillo
    // to Lubbock · 1 h 43 min" and nothing that said the trip was now two
    // days; round 3 answered with a row per day under the numbers that
    // repeated each heading, and round 4's critic asked for one telling
    // of each day. So: one sentence, the count and where each night is,
    // and each heading once, in its section.
    const html = clean(renderToString(<PlanWorkspace {...base} initialTrip={twoLegs} />));
    const shape = /<p data-trip-shape="true"[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(shape).not.toBeNull();
    // Three days: one to Lubbock, two on to Austin at 4 h a day, the
    // second night where 4 h runs out.
    expect(text(shape![0]).trim()).toBe("Three days, with nights in Lubbock and near Llano");
    // Under the numbers, before the budget's alert and before Day 1's
    // section; nothing of it is a button or a heading.
    const at = html.indexOf("data-trip-shape");
    expect(at).toBeGreaterThan(html.indexOf("on the road"));
    expect(at).toBeGreaterThan(html.indexOf("of driving left"));
    expect(at).toBeLessThan(html.indexOf('role="alert"'));
    expect(at).toBeLessThan(html.indexOf('<section data-day="1"'));
    expect(shape![0]).not.toContain("<button");
    // Each day's sentence once, in its own section's heading, and no strip.
    expect(html.match(/Day <span class="num">1<\/span> · Amarillo to Lubbock/g)).toHaveLength(1);
    expect(html.match(/Day <span class="num">2<\/span> · Lubbock to near Llano/g)).toHaveLength(1);
    expect(html.match(/Day <span class="num">3<\/span> · near Llano to Austin/g)).toHaveLength(1);
    expect(html).not.toContain("data-day-strip");
    expect(html).not.toContain("Tap a day");
    expect(daySections(html).map((d) => d.n)).toEqual(["1", "2", "3"]);
    // A stop whose route has not returned: each stretch counts one day
    // until its drive is known, and nothing says "0 min".
    const pending = clean(renderToString(<PlanWorkspace {...base} initialTrip={{ stops: [lubbock], legs: [], directMinutesToDestination: 470 }} />));
    expect(text(/<p data-trip-shape="true"[^>]*>([\s\S]*?)<\/p>/.exec(pending)![0]).trim()).toBe("Two days, with a night in Lubbock");
    expect(visible(pending)).not.toMatch(/\b0 min\b/);
    // No stop and the road over the budget: two days, the night named.
    const rest = clean(renderToString(<PlanWorkspace {...base} />));
    expect(text(/<p data-trip-shape="true"[^>]*>([\s\S]*?)<\/p>/.exec(rest)![0]).trim()).toBe("Two days, with a night near Snyder");
    // One day: no shape line; its one heading is a few lines down.
    expect(renderToString(<PlanWorkspace {...base} initialDurationSeconds={3 * 3600} />)).not.toContain("data-trip-shape");
  });

  it("fades the dots of the other days' towns on the map while one is open and draws no name for them, never the day's own or its ends, and names a stop's square", () => {
    // Round 2's day-tap capture: Fort Worth's name clipped at the map's
    // edge as if it were part of day 1; round 3 faded it and round 4's
    // capture still read "For" at the edge. The rule is pure; the map
    // applies it to the markers it already has, moving nothing: the dot
    // faint, the name not drawn.
    const day1 = new Set(["plainview", "lubbock"]);
    expect(candidateOpacity("plainview", day1)).toBe(1);
    expect(candidateOpacity("lubbock", day1)).toBe(1);
    expect(candidateOpacity("fort-worth", day1)).toBe(OFF_DAY_OPACITY);
    expect(candidateOpacity("fort-worth", null)).toBe(1);
    expect(candidateOpacity("fort-worth", undefined)).toBe(1);
    expect(candidateLabelShown("plainview", day1)).toBe(true);
    expect(candidateLabelShown("fort-worth", day1)).toBe(false);
    expect(candidateLabelShown("fort-worth", null)).toBe(true);
    // Faint, not gone: a hidden dot would say the town is not there.
    expect(OFF_DAY_OPACITY).toBeGreaterThanOrEqual(0.25);
    expect(OFF_DAY_OPACITY).toBeLessThanOrEqual(0.5);
    // The map sets those two and only those on the markers it has (rule
    // 6: nothing moves), and the workspace hands it the open day's towns.
    const map = readFileSync(new URL("../RouteMap.tsx", import.meta.url), "utf8");
    expect(map).toContain("marker.setOpacity(candidateOpacity(id, focusCandidateIds))");
    expect(map).toContain("marker.setLabel(candidateLabelShown(id, focusCandidateIds) ? candidateLabel(names.get(id) ?? \"\") : null)");
    const sheet = readFileSync(new URL("../PlanWorkspace.tsx", import.meta.url), "utf8");
    expect(sheet).toContain("focusCandidateIds={focusCandidateIds}");
    // A stop's square carries the town's name above it in the map's one
    // label style, with its number drawn in the square (round 5: the end
    // of a framed day read as a "1" badge with no name).
    expect(map).toContain("label: endpointLabel(stop.cityName)");
    expect(map).toContain("icon: tripStopIcon(routeColor, index + 1)");
    expect(map).toMatch(/function tripStopIcon[\s\S]*?<text[^>]*>\$\{n\}<\/text>/);
  });

  it("makes the heading a 44 px button that says what a tap does, and asks the map for nothing until one", () => {
    const html = clean(renderToString(<PlanWorkspace {...base} initialTrip={twoLegs} />));
    const headings = html.match(/<h2 id="day-\d+-heading"[^>]*><button[^>]*>/g) ?? [];
    expect(headings).toHaveLength(3);
    for (const h of headings) {
      expect(h).toMatch(/aria-pressed="false"/);
      expect(h).toMatch(/class="[^"]*\bmin-h-\[44px\]/);
    }
    expect(html.match(/See it on the map/g)).toHaveLength(3);
    expect(html).not.toContain("See the whole trip");
    // A day with nothing under it says so rather than standing empty; with
    // no town on the road at all, a cut is said in hours, as a person
    // says it, the figure alone in the mono face (round 6: "mile 176").
    const bareHtml = clean(renderToString(<PlanWorkspace {...base} candidateMarkers={[]} waypointFetch={{ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }} roadsideStops={[]} />));
    const bare = visible(bareHtml);
    expect(bare).toContain("Day 1 · 4 h down the road from Amarillo See it on the map");
    expect(bare).toContain("Day 2 · on to Austin · 3 h 50 min See it on the map");
    expect(bare).toContain("Two days, with a night on the road");
    expect(bare).not.toMatch(/\bmile\b|on the road to|to on the road/);
    expect(bareHtml).toContain('Day <span class="num">1</span> · <span class="num">4</span> h down the road from Amarillo');
    expect(bareHtml).toContain('Day <span class="num">2</span> · on to Austin · <span class="num">3</span> h <span class="num">50</span> min');
    expect(bare.match(/Nothing listed along this stretch\./g)).toHaveLength(2);
    expect(bare).not.toContain("Towns that fit");
  });

  it("tells a trip with no stops as the days the budget cuts it into, each holding what its road passes, and leaves a day's time out until its route is known", () => {
    const rest = renderToString(<PlanWorkspace {...base} />);
    const days = daySections(rest);
    // 7 h 50 min on a 4 h budget with no night chosen: two days, the first
    // cut where 4 h runs out, near Snyder (round 5: round 4's "Days 1 and
    // 2 · Amarillo to Austin" never said where day 1 ended). Every town
    // that fits is under day 1 with "Stop here", the choice of where the
    // day ends, Brady and Llano among them though the road passes them
    // after the cut (round 6: the title says they fit today, so they are
    // day 1's); the places are day 1's or day 2's by where the road
    // passes them.
    expect(days).toHaveLength(2);
    expect(visible(rest)).toContain("Day 1 · Amarillo to near Snyder · 4 h See it on the map");
    expect(visible(rest)).toContain("Day 2 · near Snyder to Austin · 3 h 50 min");
    expect(visible(rest)).not.toMatch(/Days \d|over the/);
    expect(days[0].text).toContain("Towns that fit today");
    for (const name of ["What's in Plainview", "What's in Lubbock", "What's in Post", "What's in Snyder", "What's in Brady", "What's in Llano", "Cadillac Ranch", "Prairie Dog Town"]) expect(days[0].text).toContain(name);
    expect(days[0].text).toContain("2 places worth pulling over for");
    expect(days[0].text).toContain("+ Stop here");
    expect(days[0].text).not.toContain("Windmill");
    expect(days[0].text.indexOf("Towns that fit today")).toBeLessThan(days[0].text.indexOf("What's in"));
    expect(days[1].text).toContain("Windmill");
    expect(days[1].text).toContain("1 place worth pulling over for");
    expect(days[1].text).not.toContain("What's in");
    expect(days[1].text).not.toContain("Towns that fit");
    for (const name of ["Cadillac Ranch", "Prairie Dog Town", "+ Stop here"]) expect(days[1].text).not.toContain(name);
    // The title counts the towns that fit as today's, day 1, the day they
    // are listed under.
    expect(visible(rest)).toContain("Plainview, Lubbock and 4 more fit today");
    // Within the budget, a plain "Day 1" of the whole road holding everything.
    const one = renderToString(<PlanWorkspace {...base} initialDurationSeconds={3 * 3600} />);
    expect(daySections(one)).toHaveLength(1);
    expect(visible(one)).toContain("Day 1 · Amarillo to Austin · 3 h See it on the map");
    for (const name of ["Towns that fit today", "Plainview", "Lubbock", "Post", "Snyder", "Brady", "Llano", "Cadillac Ranch", "Prairie Dog Town", "Windmill"]) expect(daySections(one)[0].text).toContain(name);
    expect(daySections(one)[0].text).toContain("3 places worth pulling over for");
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

  it("lists a place once in a day whatever the store's spellings, leaves to its town a place the town lists, and still opens the card for it", () => {
    // Round 4's capture: Day 1 listed the Buddy Holly Center three times,
    // twice from the store ("The Buddy Holly Center" among them) and once
    // under Lubbock. The stronger spelling stays; the one Lubbock's rows
    // carry is left to them; a tap on its diamond still opens its card in
    // day 1.
    const repeats = [
      place("a", "Cadillac Ranch", 10, 0.9),
      place("a2", "The Cadillac Ranch", 12, 0.5),
      place("bh", "Buddy Holly Center", 160, 0.8),
      place("b", "Prairie Dog Town", 250, 0.7),
    ];
    const html = clean(renderToString(<PlanWorkspace {...base} roadsideStops={repeats} initialTrip={twoLegs} />));
    const days = daySections(html);
    expect(days[0].text).toContain("1 place worth pulling over for");
    expect(days[0].text).toContain("Cadillac Ranch");
    expect(days[0].text).not.toContain("The Cadillac Ranch");
    expect(days[0].text.match(/Buddy Holly Center/g)).toHaveLength(1);
    expect(days[0].text.match(/Cadillac Ranch/g)).toHaveLength(1);
    expect(days[1].text).toContain("1 place worth pulling over for");
    // The rows are by id, so the one kept is the stronger.
    expect(html).toContain('data-roadside-stop="a"');
    expect(html).not.toContain('data-roadside-stop="a2"');
    expect(html).not.toContain('data-roadside-stop="bh"');
    // The card for the folded place opens in its day, at the top of the section.
    const withCard = clean(renderToString(<PlanWorkspace {...base} roadsideStops={repeats} initialTrip={twoLegs} initialSelectedRoadsideId="bh" />));
    const card = withCard.indexOf('data-roadside-card="bh"');
    expect(card).toBeGreaterThan(withCard.indexOf('<section data-day="1"'));
    expect(card).toBeLessThan(withCard.indexOf('<section data-day="2"'));
    expect(card).toBeLessThan(withCard.indexOf('data-roadside-stop="a"'));
    // With every row of a day folded into its towns, the card alone stands.
    const alone = clean(renderToString(<PlanWorkspace {...base} roadsideStops={[place("bh", "Buddy Holly Center", 160, 0.8)]} initialTrip={twoLegs} initialSelectedRoadsideId="bh" />));
    expect(alone).toContain('data-roadside-card="bh"');
    expect(visible(alone)).not.toContain("worth pulling over for");
    expect(alone).not.toContain("<ul>");
    expect(alone).toMatch(/<section data-roadside="true" aria-label="A place worth pulling over for"/);
  });

  it("says the arrival deadline as a sentence on the sheet, the date in the mono face, and nothing without a date", () => {
    const html = clean(renderToString(<PlanWorkspace {...base} dateMode="arrival" startDate="2026-10-13" endDate="2026-10-14" today="2026-10-08" />));
    // The day's figure alone in the mono face; the month is a word.
    expect(html).toContain('Arrive in Austin by October <span class="num">14</span>, six days from now');
    expect(visible(html)).toContain("Arrive in Austin by October 14, six days from now");
    // Past twenty the count is digits, in the mono face.
    const far = clean(renderToString(<PlanWorkspace {...base} dateMode="arrival" startDate="2026-11-01" endDate="2026-11-02" today="2026-10-08" />));
    expect(far).toContain('Arrive in Austin by November <span class="num">2</span>, <span class="num">25</span> days from now');
    // A range, or no dates: no arrival sentence.
    expect(visible(renderToString(<PlanWorkspace {...base} startDate="2026-10-10" endDate="2026-10-14" today="2026-10-08" />))).not.toContain("Arrive in");
    expect(visible(renderToString(<PlanWorkspace {...base} />))).not.toContain("Arrive in");
    // The numbers and the days tell one story (round 4: "8 h of driving
    // left over 2 days" sat over a heading that said the same drive was
    // "over the 4 h you wanted"): two days of budget, two day headings.
    expect(visible(html)).toContain("8 h of driving left over 2 days");
    expect(visible(html)).toContain("Day 1 · Amarillo to near Snyder · 4 h");
    expect(visible(html)).toContain("Day 2 · near Snyder to Austin · 3 h 50 min");
    expect(visible(html)).not.toContain("over the");
  });
});

/**
 * Council round 3 on #87, items 1 and 2: the set the sheet draws from,
 * rendered for each member of its type, and the answer under a town for
 * each way the parts of town can come back. Server renders, as above:
 * the state each branch of the client's effects stores is passed in as
 * the page's own set, so what the sheet says in that state is what is
 * checked, not the effect itself (vitest runs in node with no DOM).
 */
describe("the sheet's set and the answer under a town, in every state the type allows", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("draws the days from each member of the set's type", () => {
    // The type has these members and no other: this line fails to
    // compile if one is added (a missing key) or taken away (an excess
    // one), so a "loading" or "failed" member could not arrive unnoticed.
    const members: Record<WaypointFetchResult["status"], true> = { fresh: true, degraded: true };
    expect(Object.keys(members).sort()).toEqual(["degraded", "fresh"]);
    // Every read the sheet makes on the set, in one render: a stop's town
    // kept from the set it was added from (the merge in `sheetFetch`),
    // the towns that fit from it, the places under each day
    // (`roadsideByDay` reads `sheetFetch.waypoints`), the panel open on a
    // town that fits (`panelCityWaypoints`, and the panel's read of
    // `failures`), the title and the notices (`effectiveWaypointFetch`).
    // "fresh": the common case.
    const fresh = clean(renderToString(
      <PlanWorkspace {...afterLubbock} initialTrip={{ ...twoLegs, addedFrom: base.waypointFetch }} initialPanelCityId="post" />
    ));
    let days = daySections(fresh);
    expect(days.map((d) => d.n)).toEqual(["1", "2", "3"]);
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("Buddy Holly Center");
    expect(days[0].text).toContain("Cadillac Ranch");
    expect(days[1].text).toContain("What's in Post");
    expect(days[1].text).toContain("Loading what's in Post…");
    expect(visible(fresh)).toContain("Post, Snyder and 3 more fit in day 2");
    // "degraded": the towns read, some places and some parts of town not.
    // The one field a single member carries, `failures`, is read at the
    // panel behind `status === "degraded"`; Post's parts failed by it, so
    // its answer says so and lists the places it has.
    const degraded = clean(renderToString(
      <PlanWorkspace
        {...afterLubbock}
        waypointFetch={{
          ...fromLubbock,
          status: "degraded",
          neighborhoods: { post: { kind: "loaded", data: [] } },
          failures: [
            { kind: "neighborhoods", cityId: "post", reason: "atlas read failed" },
            { kind: "waypoints", cityId: "snyder", reason: "atlas read failed" },
          ],
        }}
        initialTrip={{ ...twoLegs, addedFrom: base.waypointFetch }}
        initialPanelCityId="post"
      />
    ));
    days = daySections(degraded);
    expect(days.map((d) => d.n)).toEqual(["1", "2", "3"]);
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("Buddy Holly Center");
    expect(days[1].text).toContain("Couldn't load the parts of town; here are the places.");
    expect(days[1].text).toContain("Post cotton gin");
    expect(days[1].text).not.toContain("Loading what's in");
    expect(visible(degraded)).toContain("Some of the places did not load.");
    expect(visible(degraded)).toContain("Post, Snyder and 3 more fit in day 2");
    // The empty "fresh" set with the flag: what the page passes when the
    // town read failed (there is no "failed" member to pass). A stop in
    // the URL still has its day, its row by its name alone, and its
    // answer open; the places along the road are still listed; the title
    // says the towns could not be read.
    const failed = clean(renderToString(
      <PlanWorkspace
        {...base}
        candidateMarkers={[]}
        waypointFetch={{ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }}
        initialCandidateFetchFailed
        initialTrip={twoLegs}
        initialPanelCityId="lubbock"
      />
    ));
    days = daySections(failed);
    expect(days.map((d) => d.n)).toEqual(["1", "2", "3"]);
    expect(visible(failed)).toContain("Couldn't load the towns along the road");
    expect(visible(failed)).not.toMatch(/fits? (today|in day)/);
    expect(days[0].text).toContain("What's in Lubbock");
    expect(days[0].text).toContain("Nothing written up for Lubbock yet.");
    expect(days[0].text).toContain("Loading what's in Lubbock…");
    expect(days[0].text).toContain("Cadillac Ranch");
    expect(days[1].text).toContain("Prairie Dog Town");
    expect(days[1].text).not.toContain("Towns that fit");
  });

  it("ends the pulse with a sentence for each way the parts can come back", () => {
    // The effect that asks for a town's parts stores one of these under
    // the town's key however the ask settles (PlanWorkspace.tsx, the
    // "Fetch neighborhoods on demand" effect), and the panel says a
    // sentence for each; only the absent key pulses. The page's own set
    // carries the stored state here, which is the same record the effect
    // writes to (`effectiveNeighborhoods` merges the two).
    const open = (neighborhoods: WaypointFetchResult["neighborhoods"]) =>
      clean(renderToString(
        <PlanWorkspace {...base} waypointFetch={{ ...base.waypointFetch, neighborhoods }} initialTrip={twoLegs} initialPanelCityId="lubbock" />
      ));
    const answer = (html: string) => {
      const day = daySections(html)[0];
      // The answer sits under Lubbock's row, inside Day 1.
      expect(html.indexOf("Buddy Holly Center")).toBeLessThan(html.indexOf('<section data-day="2"'));
      return day.text.slice(day.text.indexOf("What's in Lubbock"));
    };
    // Not asked yet, or in flight: the pulse, and only then.
    const loading = open({});
    expect(answer(loading)).toContain("Loading what's in Lubbock…");
    expect(loading).toContain("motion-safe:animate-pulse");
    // The town has no parts listed (`{ kind: "empty" }`, the atlas's
    // answer for an empty subcollection): a sentence and the places.
    const empty = open({ lubbock: { kind: "empty" } });
    expect(answer(empty)).toContain("Everything in Lubbock.");
    expect(answer(empty)).toContain("Buddy Holly Center");
    expect(empty).not.toContain("Loading what's in");
    expect(empty).not.toContain("animate-pulse");
    // Parts read but none kept (`loaded` with an empty list).
    const none = open({ lubbock: { kind: "loaded", data: [] } });
    expect(answer(none)).toContain("No parts of town listed for Lubbock; here is everything.");
    expect(answer(none)).toContain("Buddy Holly Center");
    expect(none).not.toContain("Loading what's in");
    expect(none).not.toContain("animate-pulse");
    // The read refused or failed (`ok: false`), the promise rejected, or
    // an answer with no `.ok`: all stored as `failed`.
    const failed = open({ lubbock: { kind: "failed" } });
    expect(answer(failed)).toContain("Couldn't load the parts of town; here are the places.");
    expect(answer(failed)).toContain("Buddy Holly Center");
    expect(failed).not.toContain("Loading what's in");
    expect(failed).not.toContain("animate-pulse");
    // Parts read and kept: the part's name beside its place.
    const loaded = clean(renderToString(
      <PlanWorkspace
        {...base}
        waypointFetch={{
          ...base.waypointFetch,
          waypoints: base.waypointFetch.waypoints.map((w) => (w.cityId === "lubbock" ? { ...w, neighborhoodId: "depot-district" } : w)),
          neighborhoods: { lubbock: { kind: "loaded", data: [{ id: "depot-district", name: { en: "Depot District" }, trending_score: 60 }] } },
        }}
        initialTrip={twoLegs}
        initialPanelCityId="lubbock"
      />
    ));
    expect(answer(loaded)).toContain("Buddy Holly Center Depot District");
    expect(loaded).not.toContain("Loading what's in");
    expect(loaded).not.toContain("animate-pulse");
    // The sentence for a town with nothing at all: no parts and no
    // places, the pulse still ends.
    const bare = clean(renderToString(
      <PlanWorkspace
        {...base}
        waypointFetch={{ ...base.waypointFetch, waypoints: base.waypointFetch.waypoints.filter((w) => w.cityId !== "lubbock"), neighborhoods: { lubbock: { kind: "empty" } } }}
        initialTrip={twoLegs}
        initialPanelCityId="lubbock"
      />
    ));
    expect(visible(bare)).toContain("Everything in Lubbock.");
    expect(bare).not.toContain("Loading what's in");
    expect(bare).not.toContain("animate-pulse");
  });
});
