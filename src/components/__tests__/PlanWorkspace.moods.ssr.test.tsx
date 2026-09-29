import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import { SORT_LABELS } from "@/lib/roadside/tags";
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

describe("the day's places under the chosen moods", () => {
  it("puts the general score first when no mood is chosen, exactly as before U6", () => {
    // The sheet at rest must not reshuffle merely because the moods
    // arrived: with nothing chosen rankFor is the general score.
    expect(order(render([]))).toEqual(["canyon", "stadium", "diner"]);
  });

  it("puts the diner over the stadium when the mood is food, which the general score alone never did", () => {
    const listed = order(render(["food"]));
    expect(listed[0]).toBe("diner");
    // And the two that answer nothing about food keep their own order
    // below it, by general score.
    expect(listed).toEqual(["diner", "canyon", "stadium"]);
  });

  it("puts the stadium over the diner when the mood is sports", () => {
    expect(order(render(["sports"]))[0]).toBe("stadium");
  });

  it("puts what answers both moods above what answers one", () => {
    // Neither the diner nor the stadium answers both, so the band is one
    // deep for each; the diner leads on food and the stadium follows,
    // both above the canyon, which answers neither.
    const listed = order(render(["food", "sports"]));
    expect(listed[2]).toBe("canyon");
    expect(listed.slice(0, 2).sort()).toEqual(["diner", "stadium"]);
  });

  it("leaves nothing out of the list whatever is chosen", () => {
    // The bands order the list; they never filter it. A place that answers
    // no chosen mood still appears, at the bottom.
    for (const moods of [[], ["food"], ["sports"], ["food", "sports"], ["machines"]] as const) {
      expect(order(render(moods)).sort(), JSON.stringify(moods)).toEqual(["canyon", "diner", "stadium"]);
    }
  });

  it("offers the two orders once for the sheet, not once per day", () => {
    const html = render(["food"]);
    expect(html.match(/data-sort-control/g)).toHaveLength(1);
    expect(html).toContain(SORT_LABELS.best);
    expect(html).toContain(SORT_LABELS.along);
    expect(html).toContain('aria-label="Order the day&#x27;s places"');
    // Not the heading's own words: two tests in
    // PlanWorkspace.roadside.ssr.test.tsx find "places worth pulling over
    // for" by position, and a second copy of it in a label above them
    // moved what they measure.
    expect(html.match(/places worth pulling over for/g)).toHaveLength(1);
    // Exactly one of the two is on: this control is a radiogroup, unlike
    // the chips, because the list has exactly one order.
    const sortChecked = html.match(/role="radio" aria-checked="true"/g) ?? [];
    expect(sortChecked).toHaveLength(1);
    expect(html).toMatch(new RegExp(`role="radio" aria-checked="true"[^>]*>${SORT_LABELS.best}</button>`));
  });
});
