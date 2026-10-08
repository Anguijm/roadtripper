import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";

vi.mock("@/app/plan/actions", () => ({
  recomputeAndRefreshAction: vi.fn(),
  fetchNeighborhoodsAction: vi.fn(),
}));

import PlanWorkspace from "@/components/PlanWorkspace";
import { SORT_LABELS, SORT_LEAD } from "@/lib/roadside/tags";
import { SORT_ACCENT } from "@/components/SortControl";
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

  it("fills the chosen order in the same gold the places are headed in", () => {
    // SORT_ACCENT is written in SortControl.tsx and the heading's colour in
    // PlanWorkspace.tsx; importing one into the other would make a cycle,
    // so this is what stops the two drifting apart.
    const html = render(["food"]);
    expect(SORT_ACCENT).toBe("#e3b341");
    expect(html).toContain(`style="background-color:${SORT_ACCENT}"`);
    expect(html).toMatch(new RegExp(`id="roadside-heading-1"[^>]*class="[^"]*text-\\[${SORT_ACCENT}\\]`));
  });

  it("says out loud what a tap changed, since the list it moves is off the screen", () => {
    // The chips and the order control both reorder a list further down the
    // sheet than the control itself, so a screen reader is the only way to
    // know the tap did anything. The region is empty on arrival: it reports
    // a change, it does not read the state.
    const html = render(["food"]);
    const live = html.match(/<div aria-live="polite" class="sr-only">([^<]*)<\/div>/g) ?? [];
    expect(live.length).toBeGreaterThan(0);
    for (const region of live) expect(region).toBe('<div aria-live="polite" class="sr-only"></div>');
  });

  it("offers the two orders once for the sheet, not once per day", () => {
    const html = render(["food"]);
    expect(html.match(/data-sort-control/g)).toHaveLength(1);
    expect(html).toContain(SORT_LEAD);
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
    expect(marks(html)).toEqual({ diner: "Food", canyon: "attraction", stadium: "attraction" });
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
    expect(marks(render(["food", "sports"]))).toEqual({ diner: "Food", stadium: "Sports", canyon: "attraction" });
  });
});
