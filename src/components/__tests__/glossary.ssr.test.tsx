import { describe, it, expect, beforeAll, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

/**
 * The words on the screens against the glossary in gauntlet/quality-bar.md
 * (Gauntlet U2; quality bar, rules 1 and 2). Three screens are rendered on
 * the server, as /health renders them: the home form (RouteInput), the plan
 * sheet (PlanWorkspace, with a town, two places and two roadside stops, the
 * fixtures of PlanWorkspace.roadside.ssr.test.tsx) and the today form
 * (TodayStart). The markup is walked three ways: the text with every tag
 * gone, for the glossary's never phrases; every text node on its own, for a
 * minutes count standing as a label; and the tags with their ancestors, for
 * a name cut with an ellipsis or set in letter-spaced capitals.
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
import TodayStart from "@/components/TodayStart";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { fitsTodayLine, kindWord } from "@/lib/plan/words";
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
  return { home, sheet, today };
};

describe("the words on the screens, against the glossary", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "test-key-not-a-real-key";
  });

  it("carries no phrase from the glossary's never column on the home form, the plan sheet or the today form", () => {
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
    expect(fitsTodayLine(["Abilene"], "Austin", "Lubbock")).toBe("Abilene fits today after Lubbock");
    expect(fitsTodayLine([], "Austin", "Lubbock")).toBe("Nothing fits today after Lubbock; drive on to Austin");
    // A kind of place in sentence case, never an identifier.
    expect(kindWord("hidden_gem")).toBe("Hidden gem");
    expect(text).not.toMatch(/hidden_gem|HIDDEN GEM/);
  });

  it("cuts no name with an ellipsis: no place, town or chip sits under truncate or line-clamp", () => {
    for (const [name, html] of Object.entries(screens())) {
      for (const { text, classes } of textWithAncestors(html)) {
        const isName = NAMES.some((n) => text.includes(n));
        if (!isName) continue;
        const clipped = classes.filter((c) => /\btruncate\b|\bline-clamp-\d/.test(c));
        expect(clipped, `${name}: "${text.trim()}" under ${clipped.join(" | ")}`).toEqual([]);
      }
      // A description may be clamped; that is the only place the class remains.
      for (const { text, classes } of textWithAncestors(html)) {
        if (classes.some((c) => /\bline-clamp-\d/.test(c))) {
          expect(text, `${name}: line-clamp on something other than a description`).toMatch(/museum|ranch|steakhouse/i);
        }
      }
    }
  });

  it("sets no heading, label or button in letter-spaced capitals, and keeps the mono face for numbers", () => {
    for (const [name, html] of Object.entries(screens())) {
      expect(html, `${name}: an uppercase class`).not.toMatch(/class="[^"]*\buppercase\b/);
      expect(html, `${name}: a tracking class`).not.toMatch(/class="[^"]*\btracking-(?:widest|wider|wide|\[)/);
      expect(html, `${name}: font-mono on text`).not.toMatch(/class="[^"]*\bfont-mono\b/);
      // Nothing on these screens is smaller than 16 px.
      expect(html, `${name}: text under 16 px`).not.toMatch(/class="[^"]*\btext-(?:xs|sm|\[1[0-5]px\])\b/);
    }
    // The numbers carry the mono face: the sheet's distance and drive.
    const sheet = clean(screens().sheet);
    expect(sheet).toMatch(/class="num">497 mi</);
    expect(sheet).toMatch(/class="num">8 h 3 min</);
  });

  it("fits the mood chips: five short words with their glyphs, wrapping and never scrolling sideways", () => {
    expect(PERSONA_ORDER.map((id) => PERSONAS[id].label)).toEqual(["Culture", "Food", "Nerd", "Gear", "Outdoors"]);
    for (const id of PERSONA_ORDER) expect(PERSONAS[id].label.length).toBeLessThanOrEqual(8);
    const { sheet, today } = screens();
    for (const html of [sheet, today]) {
      expect(html).toContain('aria-label="I&#x27;m in the mood for"');
      expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*flex-wrap/);
      expect(html).not.toContain("overflow-x-auto");
      expect(visible(html)).toContain("I'm in the mood for");
    }
  });

  it("keeps the verb on a disabled button and says why beside it", () => {
    const { home, today } = screens();
    // The home form opens empty: the button reads its verb, the reason is its own line.
    expect(visible(home)).toContain("Plan the trip");
    expect(visible(home)).toContain("Choose where you start first");
    expect(home).toMatch(/<button type="submit" disabled="" [^>]*>Plan the trip<\/button>/);
    expect(planReason({ from: true, to: false, dateMode: "range", startDate: "", endDate: "", dateOrderValid: true })).toBe("Choose where you're going first");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "", endDate: "", dateOrderValid: true })).toBe("Pick the dates first");
    expect(planReason({ from: true, to: true, dateMode: "arrival", startDate: "", endDate: "", dateOrderValid: true })).toBe("Pick the arrival date first");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "2026-10-14", endDate: "2026-10-10", dateOrderValid: false })).toBe("The end date is before the start date");
    expect(planReason({ from: true, to: true, dateMode: "range", startDate: "2026-10-10", endDate: "2026-10-14", dateOrderValid: true })).toBe("");
    // The today form the same.
    expect(visible(today)).toContain("Show me what's in range");
    expect(visible(today)).toContain("Choose where you are first");
    expect(today).toMatch(/<button type="submit" disabled="" [^>]*>Show me what&#x27;s in range<\/button>/);
    expect(visible(today)).not.toContain("Pick where you are first");
  });
});
