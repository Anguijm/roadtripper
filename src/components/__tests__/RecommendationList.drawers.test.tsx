// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import React from "react";
import RecommendationList, { drawerSummary, hiddenTownsLine } from "@/components/RecommendationList";
import type { WaypointFetchResult } from "@/lib/routing/scoring";
import { waypointProfileForMoods } from "@/lib/personas/moodProfile";
import type { MoodId } from "@/lib/roadside/tags";

/**
 * The towns as drawers, in the order you pass them, filtered by the moods
 * (Gauntlet U50, John's design 2026-11-10). Each test names what it pins.
 */

afterEach(cleanup);

const town = (id: string, name: string, detourMinutes: number) => ({ id, name, vibeClass: null, detourMinutes, lat: 40, lng: -98 });
const wp = (id: string, cityId: string, name: string, type: "culture" | "food" | "landmark" | "nature", trendingScore: number) =>
  ({ id, cityId, name, type, trendingScore, neighborhoodId: null, description: null });

// Detour order (townOrder) and road order disagree on purpose: Kearney is
// the nearest detour but the furthest along the road.
const fetchResult: WaypointFetchResult = {
  status: "fresh",
  cities: [town("kearney", "Kearney", 10), town("lincoln", "Lincoln", 50), town("grand-island", "Grand Island", 30)],
  waypoints: [
    wp("k1", "kearney", "The Archway", "landmark", 0.9),
    wp("k2", "kearney", "Kearney diner", "food", 0.5),
    wp("l1", "lincoln", "Capitol mosaic", "culture", 0.9),
    wp("g1", "grand-island", "Grand Island tacos", "food", 0.8),
  ],
  neighborhoods: {},
};
const roadKm = new Map([["lincoln", 80], ["grand-island", 220], ["kearney", 290]]);

const props = (moods: readonly MoodId[], moodFilter: string | null) => ({
  fetchResult,
  moodProfile: waypointProfileForMoods(moods),
  moodKey: moods.join(","),
  cityCoords: new Map(fetchResult.cities.map((c) => [c.id, { lat: c.lat, lng: c.lng }])),
  addedCityIds: new Set<string>(),
  onAddCity: () => {},
  onRemoveCity: () => {},
  onCityPreview: () => {},
  roadKm,
  drawers: true,
  moodFilter,
});

const townOrderIn = (html: string) => [...html.matchAll(/data-town="([^"]+)"/g)].map((m) => m[1]);

describe("the towns as drawers (U50)", () => {
  it("lists the towns in the order you pass them, not by detour", () => {
    expect(townOrderIn(renderToString(<RecommendationList {...props([], null)} />))).toEqual(["lincoln", "grand-island", "kearney"]);
    // Without roadKm, the old order (detour) stands: Kearney first.
    const { roadKm: _omit, ...noRoad } = props([], null);
    void _omit;
    expect(townOrderIn(renderToString(<RecommendationList {...noRoad} />))[0]).toBe("kearney");
  });

  it("starts every town closed, its places hidden, with what it holds said under the name", () => {
    const html = renderToString(<RecommendationList {...props([], null)} />).replace(/<!-- -->/g, "");
    expect(html.match(/data-town-toggle[^>]*aria-expanded="false"/g)).toHaveLength(3);
    expect(html).toMatch(/id="town-places-kearney" hidden=""/);
    expect(html).toContain("The Archway and 1 more");
    // The header keeps its two actions.
    expect(html).toContain("What&#x27;s in Kearney");
    expect(html).toContain("+ Stop here");
  });

  it("opens and closes a town with a tap on its name", () => {
    render(<RecommendationList {...props([], null)} />);
    const toggle = screen.getByText("Kearney").closest("button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("town-places-kearney")!.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("town-places-kearney")!.hidden).toBe(false);
    // Opening one town opens only that one.
    expect(document.getElementById("town-places-lincoln")!.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(document.getElementById("town-places-kearney")!.hidden).toBe(true);
  });

  it("hides what a chosen mood does not want, and a town left empty, and counts those towns", () => {
    const html = renderToString(<RecommendationList {...props(["food"], "Food")} />).replace(/<!-- -->/g, "");
    // Lincoln has only a museum: hidden. Kearney keeps its diner, not its arch.
    expect(townOrderIn(html)).toEqual(["grand-island", "kearney"]);
    expect(html).toContain("Kearney diner");
    expect(html).not.toContain("The Archway");
    expect(html).toContain("1 town has nothing for Food today.");
  });

  it("leaves the towns whole when the filter is off (no mood, or only Machines or Sports)", () => {
    const html = renderToString(<RecommendationList {...props(["machines"], null)} />);
    expect(townOrderIn(html)).toEqual(["lincoln", "grand-island", "kearney"]);
    expect(html).toContain("The Archway");
    expect(html).not.toContain("data-hidden-towns");
  });
});

describe("the drawer's words", () => {
  it("names the pick and counts the rest", () => {
    expect(drawerSummary([{ name: "Stuhr Museum" }, { name: "a" }, { name: "b" }])).toBe("Stuhr Museum and 2 more");
    expect(drawerSummary([{ name: "Stuhr Museum" }])).toBe("Stuhr Museum");
    expect(drawerSummary([])).toBe("Nothing written up yet");
  });

  it("counts hidden towns in a sentence, or says nothing", () => {
    expect(hiddenTownsLine(0, "History")).toBeNull();
    expect(hiddenTownsLine(1, "History")).toBe("1 town has nothing for History today.");
    expect(hiddenTownsLine(3, "History or Food")).toBe("3 towns have nothing for History or Food today.");
  });
});

describe("a town's write-up and its drawer (U50, round 1)", () => {
  it("opens the drawer of a town whose write-up is asked for, so the answer is not hidden", () => {
    const { rerender } = render(<RecommendationList {...props([], null)} />);
    expect(document.getElementById("town-places-lincoln")!.hidden).toBe(true);
    // As a tap on Lincoln's marker on the map does, through the workspace.
    rerender(<RecommendationList {...props([], null)} previewedCityId="lincoln" />);
    expect(document.getElementById("town-places-lincoln")!.hidden).toBe(false);
  });

  it("keeps one way to open a town in its header: What's in is inside the drawer", () => {
    const html = renderToString(<RecommendationList {...props([], null)} />).replace(/<!-- -->/g, "");
    const header = /<section data-town="lincoln"[\s\S]*?id="town-places-lincoln"/.exec(html)![0];
    expect(header).not.toContain("What&#x27;s in");
    expect(header).toContain("+ Stop here");
    expect(html).toMatch(/id="town-places-lincoln"[^>]*>[\s\S]*?data-whats-in[^>]*>What&#x27;s in Lincoln: its parts of town</);
  });
});

describe("PR #162 council: two edge cases", () => {
  it("reopens a drawer closed by hand when the town's write-up is then asked for", () => {
    const { rerender } = render(<RecommendationList {...props([], null)} />);
    const toggle = screen.getByText("Lincoln").closest("button")!;
    fireEvent.click(toggle); // open
    fireEvent.click(toggle); // close by hand
    expect(document.getElementById("town-places-lincoln")!.hidden).toBe(true);
    rerender(<RecommendationList {...props([], null)} previewedCityId="lincoln" />);
    expect(document.getElementById("town-places-lincoln")!.hidden).toBe(false);
    // A close made while the write-up shows is kept.
    fireEvent.click(screen.getByText("Lincoln").closest("button")!);
    expect(document.getElementById("town-places-lincoln")!.hidden).toBe(true);
  });

  it("orders towns with no place on the road last, and two of them stably", async () => {
    const { byRoad } = await import("@/components/RecommendationList");
    expect(byRoad(10, 20)).toBeLessThan(0);
    expect(byRoad(undefined, 20)).toBeGreaterThan(0);
    expect(byRoad(20, undefined)).toBeLessThan(0);
    expect(byRoad(undefined, undefined)).toBe(0);
  });
});

describe("a town across a border (U52)", () => {
  const abroadResult: WaypointFetchResult = {
    ...fetchResult,
    cities: fetchResult.cities.map((c) => (c.id === "kearney" ? { ...c, country: "Canada" } : { ...c, country: "United States" })),
  };

  it("says 'in Canada' beside a town in another country than the start, and nothing beside the rest", () => {
    const html = renderToString(<RecommendationList {...props([], null)} fetchResult={abroadResult} homeCountry="United States" />).replace(/<!-- -->/g, "");
    expect(html.match(/data-abroad/g)).toHaveLength(1);
    expect(/<section data-town="kearney"[\s\S]*?<\/h3>/.exec(html)![0]).toContain("· in Canada");
    expect(/<section data-town="lincoln"[\s\S]*?<\/h3>/.exec(html)![0]).not.toContain("in Canada");
  });

  it("labels nothing when the start's country is unknown", () => {
    expect(renderToString(<RecommendationList {...props([], null)} fetchResult={abroadResult} homeCountry={null} />)).not.toContain("data-abroad");
  });
});
