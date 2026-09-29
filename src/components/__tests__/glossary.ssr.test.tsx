import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

/**
 * The words on the screens against the glossary in gauntlet/quality-bar.md
 * (Gauntlet U2; quality bar, rules 1, 2, 3 and 7). The screens are rendered
 * on the server, as /health renders them: the home form (RouteInput), the
 * plan sheet (PlanWorkspace, with a town, two places and two roadside
 * stops, the fixtures of PlanWorkspace.roadside.ssr.test.tsx), the today
 * form (TodayStart), the trips page with nothing saved, the sheet with a
 * stop on it (Gauntlet U3: the days are the trip, and there is no
 * itinerary component any more), and the plan screen's loading and error
 * states (round 3: the two states of the screen no round had read,
 * letter-spaced capitals at 12 px). The
 * markup is walked three ways: the text with every tag gone, for the
 * glossary's never phrases; every text node on its own, for a minutes count
 * standing as a label; and the tags with their ancestors, for a name cut
 * with an ellipsis or set in letter-spaced capitals.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/app/actions/snapOrigin", () => ({ snapOriginAction: vi.fn() }));
vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import RouteInput, { planReason } from "@/components/RouteInput";
import PlanWorkspace from "@/components/PlanWorkspace";
import RecommendationList from "@/components/RecommendationList";
import TodayStart from "@/components/TodayStart";
import TripsPage from "@/app/trips/page";
import PlanLoading from "@/app/plan/loading";
import PlanError from "@/app/plan/error";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { fitsTodayLine, kindWord, dayHeadingLine, tripShapeLine, townsFitHeading } from "@/lib/plan/words";
import type { RoadsideMarker } from "@/lib/roadside/along";

/**
 * The never column of the glossary, as phrases a person could read on a
 * screen. Case does not matter. "max " and "detour" are the "max 270 min,
 * detour minutes" row; "primary" is a whole word so a place called
 * "Primary School Museum" would not trip it, but the badge would.
 */
const NEVER: readonly RegExp[] = [
  /candidates?/i,
  /\bmax /i,
  /detour/i,
  /\bprimary\b/i,
  /see what.s here/i,
  /add city to trip/i,
  /recomput/i,
  /\bpersonas?\b/i,
  /waypoints?/i,
  /budget left/i,
  /roadside stops along the way/i,
  /neighbou?rhoods?/i,
  /\brefresh/i,
  /\bpending\b/i,
];

/**
 * A minutes count standing as a label: a text node that is nothing but a
 * count of minutes, with or without a plus ("+40m", "270 min", "40 min").
 * A duration inside a phrase ("8 h 3 min on the road", "45 min away",
 * "1 h 20 min") is a stat said as a person says it and is allowed.
 */
const BARE_MINUTES = /^\s*\+?\d+\s?(?:min|m)\s*$/i;

/** The names on the fixtures, which must never be cut with an ellipsis. */
const NAMES = [
  "Amarillo",
  "Austin",
  "Lubbock",
  "Abilene",
  "Buddy Holly Center",
  "National Ranching Heritage Center",
  "The Big Texan Steak Ranch",
  "Helium Monument",
  ...PERSONA_ORDER.map((id) => PERSONAS[id].label),
];

const plan = {
  origin: { lat: 35.2073, lng: -101.8338 },
  destination: { lat: 30.2672, lng: -97.7431 },
  encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
  candidateMarkers: [{ id: "lubbock", name: "Lubbock", lat: 33.5779, lng: -101.8552, detourMinutes: 250 }],
  waypointFetch: {
    status: "fresh" as const,
    cities: [{ id: "lubbock", name: "Lubbock", vibeClass: null, detourMinutes: 250, lat: 33.5779, lng: -101.8552 }],
    waypoints: [
      { id: "wp-1", cityId: "lubbock", name: "Buddy Holly Center", type: "culture" as const, trendingScore: 50, neighborhoodId: null, description: "A museum for the singer, in the town he grew up in." },
      { id: "wp-2", cityId: "lubbock", name: "National Ranching Heritage Center", type: "landmark" as const, trendingScore: 40, neighborhoodId: null, description: "Fifty ranch buildings moved here from across the plains." },
    ],
    neighborhoods: {},
  },
  initialPersonaId: "culture" as const,
  budgetHours: 4,
  initialDistanceMeters: 800_000,
  initialDurationSeconds: 29_000,
  fromName: "Amarillo",
  toName: "Austin",
};
const roadsideStops: RoadsideMarker[] = [
  { id: "osm:way:1", name: "The Big Texan Steak Ranch", lat: 35.19381, lng: -101.7551, kind: "notable", p: 0.83, about: "A large steakhouse and motel.", url: null, alongKm: 9 },
  { id: "osm:node:2", name: "Helium Monument", lat: 35.19955, lng: -101.91332, kind: "historic", p: 0.72, about: null, url: null, alongKm: 9 },
];
const tripStops = [
  { cityId: "lubbock", cityName: "Lubbock", lat: 33.5779, lng: -101.8552 },
  { cityId: "abilene", cityName: "Abilene", lat: 32.4487, lng: -99.7331 },
];

/** React puts a comment node between adjacent text and an expression; strip those so the text reads like the page does. */
const clean = (html: string) => html.replace(/<!-- -->/g, "");
/** What a person reads: the markup's text with every tag gone, the entities read and the whitespace folded. */
const visible = (html: string) =>
  clean(html).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
/** Every text node on its own, entities decoded enough to read. */
const textNodes = (html: string) =>
  clean(html)
    .split(/<[^>]+>/)
    .map((t) => t.replace(/&#x27;/g, "'").replace(/&amp;/g, "&"))
    .filter((t) => t.trim() !== "");

const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "path", "circle", "rect", "polygon"]);

/**
 * Walk the markup with a stack of the open tags' class lists, and hand back
 * every text node with the classes of every ancestor above it. Void and
 * self-closed tags push nothing.
 */
function textWithAncestors(html: string): { text: string; classes: string[] }[] {
  const out: { text: string; classes: string[] }[] = [];
  const stack: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean(html))) !== null) {
    if (m[3] !== undefined) {
      if (m[3].trim()) out.push({ text: m[3].replace(/&#x27;/g, "'"), classes: [...stack] });
      continue;
    }
    const closing = m[0].startsWith("</");
    const name = m[1].toLowerCase();
    if (closing) {
      stack.pop();
      continue;
    }
    if (VOID.has(name) || m[2].trimEnd().endsWith("/")) continue;
    stack.push(/class="([^"]*)"/.exec(m[2])?.[1] ?? "");
  }
  return out;
}

const screens = () => {
  const home = renderToString(<RouteInput />);
  const sheet = renderToString(<PlanWorkspace {...plan} roadsideStops={roadsideStops} initialSelectedRoadsideId="osm:way:1" />);
  const today = renderToString(<TodayStart initialHours={5} initialPersonaId="culture" />);
  const trips = renderToString(<TripsPage />);
  // The sheet with two stops on it and their legs: each day's heading
  // carries the leg's drive, and Lubbock's row its "✓ Added".
  const itinerary = renderToString(
    <PlanWorkspace
      {...plan}
      initialTrip={{
        stops: tripStops,
        legs: [
          { originCityId: "__origin__", destinationCityId: "lubbock", durationSeconds: 7_500, distanceMeters: 180_000 },
          { originCityId: "lubbock", destinationCityId: "abilene", durationSeconds: 6_000, distanceMeters: 260_000 },
        ],
        directMinutesToDestination: 200,
      }}
    />
  );
  const loading = renderToString(<PlanLoading />);
  const planError = renderToString(<PlanError error={Object.assign(new Error("boom"), { digest: "a1b2c3" })} />);
  return { home, sheet, today, trips, itinerary, loading, planError };
};

describe("the words on the screens, against the glossary", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("carries no phrase from the glossary's never column on the home form, the plan sheet, the today form, the trips page, the sheet with stops, or the plan screen loading or failed", () => {
    for (const [name, html] of Object.entries(screens())) {
      const text = visible(html);
      for (const never of NEVER) {
        expect(text, `${name}: ${never}`).not.toMatch(never);
      }
    }
  });

  it("never shows a count of minutes as a bare label", () => {
    for (const [name, html] of Object.entries(screens())) {
      for (const node of textNodes(html)) {
        expect(node, `${name}: a bare minutes label`).not.toMatch(BARE_MINUTES);
      }
    }
  });

  it("says the plan sheet's header as a sentence built from the towns, never a count", () => {
    const text = visible(screens().sheet);
    expect(text).toContain("Lubbock fits today");
    expect(text).not.toMatch(/\d+ towns? that fit/);
    expect(text).not.toMatch(/\d+ (?:cities|candidates)/i);
    // The sentence's shapes, with and without a stop and with nothing.
    expect(fitsTodayLine(["Lubbock", "Abilene"], "Austin")).toBe("Lubbock and Abilene fit today");
    expect(fitsTodayLine(["Lubbock"], "Austin")).toBe("Lubbock fits today");
    expect(fitsTodayLine(["Lubbock", "Abilene", "Sweetwater", "Snyder"], "Austin")).toBe("Lubbock, Abilene and 2 more fit today");
    expect(fitsTodayLine([], "Austin")).toBe("Nothing fits today; drive on to Austin");
    // After a stop the towns are the next day's, and the sentence says
    // which (U3, round 3: "fits today after Lubbock" stood over a list
    // that put the town in day 2). Day 1 is "today".
    expect(fitsTodayLine(["Abilene"], "Austin", 2)).toBe("Abilene fits in day 2");
    expect(fitsTodayLine(["Abilene", "Sweetwater"], "Austin", 3)).toBe("Abilene and Sweetwater fit in day 3");
    expect(fitsTodayLine([], "Austin", 2)).toBe("Nothing fits in day 2; drive on to Austin");
    expect(fitsTodayLine(["Lubbock"], "Austin", 1)).toBe("Lubbock fits today");
    // A kind of place in sentence case, never an identifier.
    expect(kindWord("hidden_gem")).toBe("Hidden gem");
    expect(text).not.toMatch(/hidden_gem|HIDDEN GEM/);
    // A day's heading (U3): the day's number, its ends, its drive. A day
    // cut where the budget runs out is named by where (round 5: "Days 1
    // and 2 · Amarillo to Austin" never said where day 1 ended), a town
    // near the cut, or said in hours with none near (round 6: "mile 319"
    // was a number a person in a car would not say), and no heading is
    // "over" anything.
    const day = { index: 0, fromKind: "start" as const, fromName: "Amarillo", endKind: "stop" as const, toName: "Lubbock", minutes: 200 };
    expect(dayHeadingLine(day)).toBe("Day 1 · Amarillo to Lubbock · 3 h 20 min");
    expect(dayHeadingLine({ index: 1, fromKind: "stop", fromName: "Lubbock", endKind: "near", toName: "near Llano", minutes: 240 })).toBe("Day 2 · Lubbock to near Llano · 4 h");
    expect(dayHeadingLine({ index: 2, fromKind: "near", fromName: "near Llano", endKind: "end", toName: "Austin", minutes: 30 })).toBe("Day 3 · near Llano to Austin · 30 min");
    expect(dayHeadingLine({ index: 1, fromKind: "stop", fromName: "Lubbock", endKind: "hours", toName: "on the road", minutes: 240 })).toBe("Day 2 · 4 h down the road from Lubbock");
    expect(dayHeadingLine({ index: 0, fromKind: "start", fromName: "Amarillo", endKind: "hours", toName: "on the road", minutes: 240 })).toBe("Day 1 · 4 h down the road from Amarillo");
    expect(dayHeadingLine({ index: 1, fromKind: "hours", fromName: "on the road", endKind: "hours", toName: "on the road", minutes: 240 })).toBe("Day 2 · another 4 h down the road");
    expect(dayHeadingLine({ index: 2, fromKind: "hours", fromName: "on the road", endKind: "end", toName: "Austin", minutes: 30 })).toBe("Day 3 · on to Austin · 30 min");
    expect(dayHeadingLine({ index: 2, fromKind: "hours", fromName: "on the road", endKind: "near", toName: "near Austin", minutes: 240 })).toBe("Day 3 · on to near Austin · 4 h");
    expect(dayHeadingLine({ index: 2, fromKind: "hours", fromName: "on the road", endKind: "end", toName: "Austin", minutes: null })).toBe("Day 3 · on to Austin");
    expect(dayHeadingLine({ ...day, minutes: null })).toBe("Day 1 · Amarillo to Lubbock");
    // The trip's shape in one line, for two days or more: the count in
    // words, where each night is (in a stop's town, near a cut's town, or
    // on the road for a cut with none near, those counted last); none
    // for one day.
    const stop = (toName: string) => ({ toName, endKind: "stop" as const });
    const onRoad = { toName: "on the road", endKind: "hours" as const };
    const end = { toName: "Austin", endKind: "end" as const };
    expect(tripShapeLine([stop("Lubbock"), { toName: "near Llano", endKind: "near" }, end])).toBe("Three days, with nights in Lubbock and near Llano");
    expect(tripShapeLine([{ toName: "near Snyder", endKind: "near" }, end])).toBe("Two days, with a night near Snyder");
    expect(tripShapeLine([onRoad, end])).toBe("Two days, with a night on the road");
    expect(tripShapeLine([onRoad, onRoad, end])).toBe("Three days, with two nights on the road");
    expect(tripShapeLine([stop("Lubbock"), onRoad, end])).toBe("Three days, with a night in Lubbock and one on the road");
    expect(tripShapeLine([stop("Lubbock"), stop("Abilene"), onRoad, end])).toBe("Four days, with nights in Lubbock and Abilene, and one on the road");
    expect(tripShapeLine([onRoad, onRoad, { toName: "near Austin", endKind: "near" }, end])).toBe("Four days, with a night near Austin and two on the road");
    expect(tripShapeLine([stop("Lubbock"), stop("Abilene"), end])).toBe("Three days, with nights in Lubbock and Abilene");
    expect(tripShapeLine([stop("Lubbock"), stop("Abilene"), stop("Brady"), end])).toBe("Four days, with nights in Lubbock, Abilene and Brady");
    expect(tripShapeLine([end])).toBeNull();
    expect(tripShapeLine([])).toBeNull();
    // The label over a day's towns, the glossary's own words for what the
    // planner calls candidates (round 6).
    expect(townsFitHeading()).toBe("Towns that fit today");
    expect(townsFitHeading(1)).toBe("Towns that fit today");
    expect(townsFitHeading(2)).toBe("Towns that fit in day 2");
    expect(text).toContain("Towns that fit today");
  });

  it("puts that sentence first: the sheet's title on the handle row, above the roadside heading, reachable by a screen reader", () => {
    // Round 1 had it below the roadside section and the numbers, and the
    // critic saw the sheet open on "N places worth pulling over for" with
    // no sentence in sight. It is the title now: before the scroll box,
    // a live paragraph beside the grab handle, not a child of it.
    const html = clean(screens().sheet);
    const text = visible(html);
    expect(text.indexOf("Lubbock fits today")).toBeLessThan(text.indexOf("places worth pulling over for"));
    expect(html.indexOf("data-fits-today")).toBeLessThan(html.indexOf("plan-sheet-scroll"));
    expect(html).toMatch(/aria-label="Panel [^"]*"[^>]*>(?:<div[^>]*><\/div>)<\/div><p aria-live="polite" data-fits-today/);
    // The sheet's title tells the truth when the towns could not be read.
    const failed = visible(renderToString(
      <PlanWorkspace {...plan} candidateMarkers={[]} waypointFetch={{ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }} initialCandidateFetchFailed />
    ));
    expect(failed).toContain("Couldn't load the towns along the road");
    expect(failed).not.toContain("Nothing fits today");
    expect(failed).toContain("The route is still here.");
    // And says that nothing fits when the towns were read and none fit.
    const none = visible(renderToString(
      <PlanWorkspace {...plan} candidateMarkers={[]} waypointFetch={{ status: "fresh", cities: [], waypoints: [], neighborhoods: {} }} />
    ));
    expect(none).toContain("Nothing fits today; drive on to Austin");
  });

  it("cuts nothing with an ellipsis: no truncate or line-clamp anywhere, on a name, a chip or a description", () => {
    // Round 1 kept line-clamp on descriptions; the critic counted nine
    // painted ellipses on the plan screen. The longest description in the
    // atlas is 234 characters, five lines on a phone, so it wraps whole.
    for (const [name, html] of Object.entries(screens())) {
      for (const { text, classes } of textWithAncestors(html)) {
        const clipped = classes.filter((c) => /\btruncate\b|\bline-clamp-\d/.test(c));
        expect(clipped, `${name}: "${text.trim()}" under ${clipped.join(" | ")}`).toEqual([]);
      }
      expect(html, `${name}: a truncate or line-clamp class`).not.toMatch(/class="[^"]*\b(?:truncate|line-clamp-\d)\b/);
      for (const n of NAMES) {
        if (html.includes(n)) expect(visible(html), `${name}: ${n} whole`).toContain(n);
      }
    }
  });

  it("sets no heading, label or button in letter-spaced capitals, nothing under 16 px, and keeps the mono face for figures alone", () => {
    for (const [name, html] of Object.entries(screens())) {
      expect(html, `${name}: an uppercase class`).not.toMatch(/class="[^"]*\buppercase\b/);
      expect(html, `${name}: a tracking class`).not.toMatch(/class="[^"]*\btracking-/);
      expect(html, `${name}: font-mono on text`).not.toMatch(/class="[^"]*\bfont-mono\b/);
      // Nothing on these screens is smaller than 16 px.
      expect(html, `${name}: text under 16 px`).not.toMatch(/class="[^"]*\btext-(?:xs|sm|\[1[0-5]px\])\b/);
    }
    // The figures carry the mono face and the words around them do not
    // (U3, round 2: "8 h 3 min" set whole in mono came out wide-spaced
    // inside the sentence): the sheet's distance and drive, the town
    // row's drive, and a day's heading.
    const { sheet, itinerary, loading, planError } = screens();
    expect(clean(sheet)).toContain('<span class="num">497</span> mi · <span class="num">8</span> h <span class="num">3</span> min on the road');
    expect(clean(sheet)).toContain('· <span class="num">2</span> h <span class="num">5</span> min away');
    expect(clean(sheet)).not.toMatch(/class="num">[^<]*[a-z]/);
    expect(clean(itinerary)).not.toMatch(/class="num">[^<]*[a-z]/);
    // The plan screen's loading and error states: a sentence each, the
    // error's code the one thing in the mono face, and one action.
    expect(visible(loading)).toContain("Planning the route");
    expect(loading).not.toContain("…");
    expect(visible(planError)).toContain("Couldn't load the plan page");
    expect(clean(planError)).toContain('Error code <span class="num">a1b2c3</span>');
    expect(planError).toMatch(/<a [^>]*href="\/"[^>]*>Back to the start<\/a>/);
    expect(visible(planError)).not.toMatch(/error ref|something went wrong/i);
    // The days' headings carry the legs' drives, the figures alone in mono.
    expect(clean(itinerary)).toContain('Day <span class="num">1</span> · Amarillo to Lubbock · <span class="num">2</span> h <span class="num">5</span> min');
    expect(clean(itinerary)).toContain('Day <span class="num">2</span> · Lubbock to Abilene · <span class="num">1</span> h <span class="num">40</span> min');
    expect(visible(itinerary)).toContain("Day 3 · Abilene to Austin · 3 h 20 min");
    expect(visible(itinerary)).toContain("✓ Added");
    // Two stops: the towns that fit are day 3's, and the title says so.
    expect(visible(itinerary)).toContain("Lubbock fits in day 3");
    expect(visible(itinerary)).not.toContain("fits today");
    expect(visible(itinerary)).not.toMatch(/\d+ stops? ·|Your trip|Route locked/);
  });

  it("sets the date button's words in the body face and only a chosen date in the mono face", () => {
    // The round-1 critic's one failure: "Pick the dates" in the mono face.
    // The dates sit under the home's fold (U4); opened, the button is there.
    const idle = clean(renderToString(<RouteInput initialMoreOpen />));
    expect(idle).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>Pick the dates<\/button>/);
    expect(idle).not.toMatch(/<button[^>]*class="[^"]*\bnum\b[^"]*"[^>]*>Pick the (?:dates|arrival date)/);
    const range = clean(renderToString(<RouteInput initialStartDate="2026-10-10" initialEndDate="2026-10-14" />));
    expect(range).toContain('<span class="num">Oct 10</span> to <span class="num">Oct 14</span>');
    expect(range).not.toMatch(/<button[^>]*class="[^"]*\bnum\b[^"]*"[^>]*aria-haspopup/);
    const arrival = clean(renderToString(<RouteInput initialDateMode="arrival" initialEndDate="2026-10-14" />));
    expect(arrival).toContain('Arrive by <span class="num">Oct 14</span>');
    expect(visible(clean(renderToString(<RouteInput initialDateMode="arrival" />)))).toContain("Pick the arrival date");
    const half = visible(renderToString(<RouteInput initialStartDate="2026-10-10" />));
    expect(half).toContain("Starts Oct 10 ; pick the end date");
    expect(half).not.toContain("to ?");
  });

  it("fits the mood chips: five short words with their glyphs, wrapping and never scrolling sideways, 48 px tall like the hour buttons", () => {
    expect(PERSONA_ORDER.map((id) => PERSONAS[id].label)).toEqual(["Culture", "Food", "Nerd", "Gear", "Outdoors"]);
    for (const id of PERSONA_ORDER) expect(PERSONAS[id].label.length).toBeLessThanOrEqual(8);
    const { home, sheet, today } = screens();
    for (const html of [sheet, today]) {
      expect(html).toContain('aria-label="I&#x27;m in the mood for"');
      expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*flex-wrap/);
      expect(html).not.toContain("overflow-x-auto");
      expect(visible(html)).toContain("I'm in the mood for");
      // Every chip a few pixels over rule 7's 44 (the round-1 critic
      // measured 43): the same for every hour button on the two forms.
      const chips = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
      expect(chips).toHaveLength(5);
      for (const chip of chips) expect(chip).toMatch(/class="[^"]*\bmin-h-\[48px\]/);
    }
    for (const html of [home, today]) {
      const hours = html.match(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>\d h<\/button>/g) ?? [];
      expect(hours).toHaveLength(6);
      for (const h of hours) expect(h).toMatch(/class="[^"]*\bmin-h-\[48px\]/);
    }
  });

  it("keeps the verb on a disabled button and says why beside it", () => {
    const { home, today } = screens();
    // The home form opens empty: the button reads its verb, the reason is its own line.
    expect(visible(home)).toContain("Plan the trip");
    expect(visible(home)).toContain("Choose where you start first");
    expect(home).toMatch(/<button type="submit" disabled="" [^>]*>Plan the trip<\/button>/);
    expect(planReason({ from: true, to: false, dateMode: "range", startDate: "", endDate: "", dateOrderValid: true })).toBe("Choose where you're going first");
    // Dates are optional (U4): from and to are enough; half a range is not.
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "", endDate: "", dateOrderValid: true })).toBe("");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "2026-10-10", endDate: "", dateOrderValid: true })).toBe("Pick the end date too");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "", endDate: "2026-10-14", dateOrderValid: true })).toBe("Pick the start date too");
    expect(planReason({ from: true, to: true, dateMode: "arrival", startDate: "", endDate: "", dateOrderValid: true })).toBe("Pick the arrival date first");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "2026-10-14", endDate: "2026-10-10", dateOrderValid: false })).toBe("The end date is before the start date");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "2026-10-10", endDate: "2026-10-14", dateOrderValid: true })).toBe("");
    // The today form the same.
    expect(visible(today)).toContain("Show me what's in range");
    expect(visible(today)).toContain("Choose where you are first");
    expect(today).toMatch(/<button type="submit" disabled="" [^>]*>Show me what&#x27;s in range<\/button>/);
    expect(visible(today)).not.toContain("Pick where you are first");
    // A full trip: every "Stop here" is off, and one line beside them says why.
    const full = renderToString(
      <RecommendationList
        fetchResult={plan.waypointFetch}
        activePersonaId="culture"
        cityCoords={new Map([["lubbock", { lat: 33.5779, lng: -101.8552 }]])}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
        atCap
      />
    );
    expect(visible(full)).toContain("The trip has all the stops it can hold; take one out to add another.");
    expect(full).toMatch(/<button[^>]*disabled=""[^>]*>\+ Stop here<\/button>/);
  });

  it("gives the trips screen its one action: Plan a trip under the empty state", () => {
    const { trips } = screens();
    const text = visible(trips);
    expect(text).toContain("Saved trips");
    expect(text).toContain("No saved trips in this browser yet.");
    expect(trips).toMatch(/<a [^>]*href="\/"[^>]*>Plan a trip<\/a>/);
    expect(trips).toMatch(/<a [^>]*class="[^"]*\bmin-h-\[44px\][^"]*"[^>]*href="\/"[^>]*>Plan a trip<\/a>|<a [^>]*href="\/"[^>]*class="[^"]*\bmin-h-\[44px\][^"]*"[^>]*>Plan a trip<\/a>/);
  });
});
