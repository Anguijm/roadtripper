import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * The plan page, server-rendered with the paid calls mocked out. What it
 * proves here is the masthead and the deadline: in arrival mode the
 * deadline is a sentence on the sheet (Gauntlet U3), built from the
 * server's day, and the start date was derived from the route rather than
 * typed; a range's dates stay on the masthead; and the masthead is the
 * height the map's fit at rest counts on (PLAN_HEADER_PX).
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
import { PLAN_HEADER_PX } from "@/components/RouteMap";
import { MOOD_CONFIG, type MoodId } from "@/lib/roadside/tags";

const BASE = {
  fromName: "Amarillo", fromLat: "35.2073", fromLng: "-101.8338",
  toName: "Austin", toLat: "30.2672", toLng: "-97.7431",
  budget: "4",
};
/** The page's text: the dates sit in `.num` spans (the mono face is for numbers, U2), and React puts a comment between adjacent expressions. */
const render = async (params: Record<string, string>) =>
  renderToString(await PlanPage({ searchParams: Promise.resolve({ ...BASE, ...params }) }))
    .replace(/<!-- -->/g, "")
    .replace(/<\/?span[^>]*>/g, "");

describe("the plan page knows the deadline", () => {
  it("arrival mode: says the arrival sentence on the sheet, from the server's day, and keeps the masthead to the trip's names", async () => {
    const html = await render({ dateMode: "arrival", endDate: "2026-10-14" });
    // The count is the real clock's, so it is any of the sentence's shapes;
    // the fixed-now shapes are pinned in src/lib/plan/__tests__/deadline.test.ts.
    // The year appears only when the date is not this year, so the pin
    // allows it, for a run of this test after 2026.
    expect(html).toMatch(/<p data-arrival="true"[^>]*>Arrive in Austin by October 14(?:, \d{4})?, (?:today|tomorrow|yesterday|[a-z0-9]+ days (?:from now|ago))<\/p>/);
    expect(html).not.toContain("Arrive by");
    expect(html).toContain("Amarillo to Austin");
    expect(html).not.toContain("Amarillo → Austin");
    // The masthead carries no deadline in arrival mode: one line on the right.
    expect(html).toMatch(/<header [^>]*><a [^>]*href="\/">← Roadtripper<\/a><div class="min-w-0 text-base text-\[#8b949e\] text-right"><div class="break-words">Amarillo to Austin<\/div><\/div><\/header>/);
  });

  it("range mode: says the range on the masthead and no arrival sentence", async () => {
    const html = await render({ startDate: "2026-10-10", endDate: "2026-10-14" });
    expect(html).toContain("Oct 10 to Oct 14");
    expect(html).not.toContain("Arrive in");
  });

  it("no dates: says neither", async () => {
    const html = await render({});
    expect(html).not.toContain("Arrive in");
    expect(html).not.toContain(" to Oct");
  });

  it("keeps the masthead at the height the fit at rest counts on: a 44 px link, no vertical padding, one border", async () => {
    // Gauntlet U3: U2's `py-3` around the 44 px link made the masthead 69
    // px (73 with a deadline line), which took the strip of map above the
    // sheet below what the road needs at zoom 5 and the fit at rest showed
    // a third of the country. The row is the link's 44 px and the border;
    // a second line on the right (a range's dates) makes it 49, which is
    // the number the fit test in PlanWorkspace.roadside.ssr.test.tsx takes.
    const html = await render({ startDate: "2026-10-10", endDate: "2026-10-14" });
    const header = /<header class="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(header).toContain("flex items-center");
    expect(header).toContain("border-b");
    expect(header).not.toMatch(/\bpy-[1-9]|\bpt-[1-9]|\bpb-[1-9]|\bh-\[/);
    expect(html).toMatch(/<a class="min-h-\[44px\] flex items-center [^"]*" href="\/">← Roadtripper<\/a>/);
    expect(PLAN_HEADER_PX).toBe(44 + 1 + 4);
  });
});

describe("the plan page reads the moods from the URL", () => {
  /** The chip for `id`, pressed or not; its label sits in a span the render strips. */
  const chip = (id: MoodId, pressed: boolean) =>
    new RegExp(`<button type="button" aria-pressed="${pressed}"[^>]*>${MOOD_CONFIG[id].label}</button>`);

  it("takes the known moods as the pressed chips, and presses none for an arbitrary string, not an error", async () => {
    // The home sends `moods` only when a chip was tapped (Gauntlet U4, U6).
    // The page reads it through parseMoods, which drops anything it cannot
    // read rather than defaulting, so a link with a made-up mood plans the
    // same as a link with none — which is the sheet at rest, a real state.
    const known = await render({ moods: "museums" });
    expect(known).toMatch(chip("museums", true));
    expect(known).toMatch(chip("food", false));

    // Two at a time is the point of U6.
    const two = await render({ moods: "museums,food" });
    expect(two).toMatch(chip("museums", true));
    expect(two).toMatch(chip("food", true));

    for (const moods of ["banana", "MUSEUMS", "", ","]) {
      const html = await render({ moods });
      expect(html, JSON.stringify(moods)).not.toContain("Something is off with this link");
      expect(html, JSON.stringify(moods)).not.toContain('aria-pressed="true"');
    }
    expect(await render({})).not.toContain('aria-pressed="true"');
  });

  it("drops a repeat and never presses more than two, however the link was built", async () => {
    const repeat = await render({ moods: "food,food" });
    expect(repeat.match(/aria-pressed="true"/g)).toHaveLength(1);
    // A link carrying three is not an error; the first two win, so the one
    // dropped is the same one `toggleMood` would have dropped.
    const three = await render({ moods: "museums,food,outdoors" });
    expect(three.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(three).toMatch(chip("museums", true));
    expect(three).toMatch(chip("food", true));
    expect(three).toMatch(chip("outdoors", false));
  });

  it("still plans when a link built before U6 carries a persona", async () => {
    // Trips saved before U6 link with `?persona=nerd`. The page no longer
    // reads that parameter; it must plan as the sheet at rest rather than
    // fail on a word it does not know.
    const old = await render({ persona: "nerd" });
    expect(old).not.toContain("Something is off with this link");
    expect(old).not.toContain('aria-pressed="true"');
  });
});
