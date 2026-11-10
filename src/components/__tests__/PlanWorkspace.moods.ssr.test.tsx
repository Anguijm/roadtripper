import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import type { RoadsideMarker } from "@/lib/roadside/along";
import type { MoodId } from "@/lib/roadside/tags";

/**
 * The day's places under the chosen moods (Gauntlet U6). The ordering is
 * the point of the whole tag project: before it the list was the general
 * score alone, so a stadium at 0.60 beat a landmark diner at 0.50 for
 * someone who had asked for food.
 *
 * Rendered on the server, which is where the first order is decided, and
 * read back off the `data-roadside-stop` attributes in the order they
 * appear.
 */

const base = {
  origin: { lat: 35.2073, lng: -101.8338 },
  destination: { lat: 30.2672, lng: -97.7431 },
  encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
  candidateMarkers: [],
  waypointFetch: { status: "fresh" as const, cities: [], waypoints: [], neighborhoods: {} },
  budgetHours: 4,
  initialDistanceMeters: 800_000,
  initialDurationSeconds: 29_000,
  fromName: "Amarillo",
  toName: "Austin",
};

/**
 * Three places whose general score runs the opposite way to their tags, so
 * any order the list comes out in is a decision rather than an accident:
 *
 *   the stadium  general 0.60, all sport, no food     nearest on the road
 *   the diner    general 0.50, all food, no sport     furthest
 *   the canyon   general 0.70, neither                middle
 */
const stops: RoadsideMarker[] = [
  {
    id: "osm:way:stadium", name: "The stadium", lat: 35.1, lng: -101.7, kind: "attraction",
    p: 0.6, about: null, url: null, alongKm: 10,
    scores: { sports_place: 0.99, famous_food: 0.01 },
  },
  {
    id: "osm:way:canyon", name: "The canyon", lat: 34.9, lng: -101.5, kind: "attraction",
    p: 0.7, about: null, url: null, alongKm: 40,
    scores: { big_view: 0.95, rock_and_cave: 0.9 },
  },
  {
    id: "osm:way:diner", name: "The diner", lat: 34.7, lng: -101.3, kind: "attraction",
    p: 0.5, about: null, url: null, alongKm: 80,
    scores: { famous_food: 0.94, sports_place: 0.01 },
  },
];

const render = (moods: readonly MoodId[]) =>
  renderToString(<PlanWorkspace {...base} initialMoods={moods} roadsideStops={stops} />);

/** The ids of the day's places, in the order the sheet lists them. */
const order = (html: string) =>
  [...html.matchAll(/data-roadside-stop="([^"]+)"/g)].map((m) => m[1].replace("osm:way:", ""));

describe("the day's places under the chosen moods (U50: in road order, filtered)", () => {
  // U6 ordered the list by the moods and never hid anything, with a control
  // to switch to road order. U50 (John, 2026-11-10): the list is always in
  // the order you pass the places, and a chosen mood hides what answers
  // none of the chosen moods. These tests pin the new rule.

  it("lists every place in road order when no mood is chosen", () => {
    // Stadium at 10 km, canyon at 40, diner at 80; the general score
    // (canyon highest) no longer decides the order.
    expect(order(render([]))).toEqual(["stadium", "canyon", "diner"]);
  });

  it("shows only what answers food when the mood is food", () => {
    expect(order(render(["food"]))).toEqual(["diner"]);
  });

  it("shows only what answers sports when the mood is sports", () => {
    expect(order(render(["sports"]))).toEqual(["stadium"]);
  });

  it("shows what answers either mood when two are chosen, still in road order", () => {
    expect(order(render(["food", "sports"]))).toEqual(["stadium", "diner"]);
  });

  it("says so when a mood leaves the day's road empty, rather than show an empty list", () => {
    const html = render(["machines"]).replace(/<!-- -->/g, "");
    expect(order(html)).toEqual([]);
    expect(html).toContain("Nothing along the way for Machines today.");
    // With places listed, the line is not said.
    expect(render(["food"])).not.toContain("Nothing along the way");
  });

  it("heads the list in the gold the places were always headed in", () => {
    expect(render(["food"])).toMatch(/id="roadside-heading-1"[^>]*class="[^"]*text-\[#e3b341\]/);
  });

  it("says out loud what a tap changed, since the list it moves is off the screen", () => {
    // The chips reorder and filter a list further down the sheet than the
    // chips themselves, so a screen reader is the only way to know the tap
    // did anything. The region is empty on arrival: it reports a change,
    // it does not read the state.
    const html = render(["food"]);
    const live = html.match(/<div aria-live="polite" class="sr-only">([^<]*)<\/div>/g) ?? [];
    expect(live.length).toBeGreaterThan(0);
    for (const region of live) expect(region).toBe('<div aria-live="polite" class="sr-only"></div>');
  });

  it("has no order control: there is one order", () => {
    const html = render(["food"]);
    expect(html).not.toContain("data-sort-control");
    expect(html).not.toContain('role="radio"');
  });
});

describe("where the chosen mood's matches end (U14)", () => {
  /** The leading word of each row's second line, by stop id, read off the markup. */
  const marks = (raw: string) => {
    // React's server render separates adjacent text with `<!-- -->`, so the
    // " · " a person reads is not one run of characters in the markup.
    const html = raw.replace(/<!-- -->/g, "");
    const out: Record<string, string> = {};
    for (const m of html.matchAll(/data-roadside-stop="osm:way:([^"]+)"[\s\S]*?<span class="block text-base leading-snug text-\[#8b949e\]">([\s\S]*?) · /g)) {
      out[m[1]] = m[2].replace(/<[^>]+>/g, "").trim();
    }
    return out;
  };

  it("marks the places that answer the mood with its word, and leaves the rest their kind", () => {
    // On Amarillo → Austin only two day-1 places answered Food, and the
    // list ran on into a helium monument with nothing to say the matches
    // had stopped. Now the matches say which mood they answer.
    const html = render(["food"]);
    // Since U50 the places that answer nothing are hidden, so only the
    // diner is left, marked with the mood it answers.
    expect(marks(html)).toEqual({ diner: "Food" });
  });

  it("colours the mark in the mood's own colour", () => {
    const html = render(["food"]);
    expect(html).toMatch(/data-answers-mood="food" style="color:#[0-9a-f]{6}">Food</);
  });

  it("marks nothing when no mood is chosen", () => {
    expect(render([])).not.toContain("data-answers-mood");
  });

  it("still says a place is in the trip when it also answers the mood", () => {
    // In the trip is the stronger fact about a place you have already
    // chosen (U8), so it wins the line. The first cut had no test with a
    // place that was both, and putting the mood first passed every test.
    const diner = stops.find((s) => s.id === "osm:way:diner")!;
    const html = renderToString(
      <PlanWorkspace
        {...base}
        initialMoods={["food"]}
        roadsideStops={stops}
        initialTrip={{ stops: [{ cityId: diner.id, cityName: diner.name, lat: diner.lat, lng: diner.lng }], legs: [], directMinutesToDestination: 0 }}
      />
    );
    expect(marks(html).diner).toBe("✓ In the trip");
  });

  it("marks each place with the mood it answers when two are chosen", () => {
    expect(marks(render(["food", "sports"]))).toEqual({ diner: "Food", stadium: "Sports" });
  });
});
