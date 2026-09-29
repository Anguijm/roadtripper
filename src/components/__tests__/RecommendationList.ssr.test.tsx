import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import RecommendationList from "@/components/RecommendationList";
import type { WaypointFetchResult } from "@/lib/routing/scoring";
import { waypointProfileForMoods } from "@/lib/personas/moodProfile";

/** The profile "Museums" makes, standing in for the old "nerd" persona. */
const PROFILE = waypointProfileForMoods(["museums"]);

const result: WaypointFetchResult = {
  status: "fresh",
  cities: [{ id: "amarillo", name: "Amarillo", vibeClass: null, detourMinutes: 40, lat: 35.22, lng: -101.83 }],
  waypoints: [
    {
      id: "w1", cityId: "amarillo", name: "Cadillac Ranch", type: "landmark", trendingScore: 0.9, neighborhoodId: null,
      description: "Ten Cadillacs nose-down in a wheat field, repainted daily by whoever brings a can. <b>not markup</b>",
    },
    { id: "w2", cityId: "amarillo", name: "A bare name", type: "food", trendingScore: 0.5, neighborhoodId: null, description: null },
  ],
  neighborhoods: {},
};

describe("the candidate list shows the reason under every stop", () => {
  it("renders the description as text under the name, and nothing under a stop without one", () => {
    const html = renderToString(
      <RecommendationList
        fetchResult={result}
        moodProfile={PROFILE}
        moodKey="museums"
        cityCoords={new Map([["amarillo", { lat: 35.22, lng: -101.83 }]])}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
      />
    );
    expect(html).toContain("Cadillac Ranch");
    expect(html).toContain("Ten Cadillacs nose-down in a wheat field");
    // untrusted text is text: the tag is escaped, never markup
    expect(html).not.toContain("<b>not markup</b>");
    expect(html).toContain("&lt;b&gt;not markup&lt;/b&gt;");
    // exactly one reason paragraph: the stop without a description gets no empty line
    expect(html.match(/data-reason/g)?.length ?? 0).toBe(1);
    expect(html).toContain("A bare name");
  });

  it("leads each card with the top spot that has a reason, before every other row", () => {
    // For the nerd persona the fixture ranks the food spot first, and it has
    // no description; the lead must be the first spot with a reason.
    const html = renderToString(
      <RecommendationList
        fetchResult={result}
        moodProfile={PROFILE}
        moodKey="museums"
        cityCoords={new Map([["amarillo", { lat: 35.22, lng: -101.83 }]])}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
      />
    );
    const lead = html.indexOf("data-lead");
    const leadReason = html.indexOf("Ten Cadillacs nose-down");
    const secondRow = html.indexOf("A bare name");
    expect(lead).toBeGreaterThan(-1);
    expect(leadReason).toBeGreaterThan(lead);
    expect(secondRow).toBeGreaterThan(leadReason);
    // the lead is not repeated as a row below
    expect(html.match(/Cadillac Ranch/g)?.length).toBe(1);
  });

  it("offers to show a city's lore before it is added, and marks the open one as pressed", () => {
    const render = (previewed: string | null) =>
      renderToString(
        <RecommendationList
          fetchResult={result}
          moodProfile={PROFILE}
        moodKey="museums"
          cityCoords={new Map([["amarillo", { lat: 35.22, lng: -101.83 }]])}
          addedCityIds={new Set()}
          onAddCity={() => {}}
          onRemoveCity={() => {}}
          onCityPreview={() => {}}
          previewedCityId={previewed}
        />
      );
    // The button's name is its visible words, "What's in Amarillo" (the
    // glossary's), with no aria-label saying them another way (U2, round 2).
    const closed = render(null).replace(/<!-- -->/g, "");
    expect(closed).toMatch(/aria-pressed="false"[^>]*>What&#x27;s in Amarillo<\/button>/);
    expect(closed).not.toContain("aria-label=\"See what");
    expect(closed).toContain("+ Stop here");   // still not added
    const open = render("amarillo").replace(/<!-- -->/g, "");
    expect(open).toMatch(/aria-pressed="true"[^>]*>What&#x27;s in Amarillo<\/button>/);
    // The town's header is two rows (Gauntlet U3, round 2: the drive ran
    // under the buttons and the buttons were 30 px on the screen): the
    // name with its drive, the figures in the mono face, then the two
    // buttons on a row of their own, each 44 px tall and sharing the
    // width, with no invisible hit area.
    expect(open).toMatch(/<h3 class="text-base leading-6 break-words">Amarillo<span class="ml-2 text-\[#8b949e\]">· <span class="num">20<\/span> min away<\/span><\/h3><div class="mt-1 flex gap-2"><button/);
    expect(open).toMatch(/<button[^>]*class="flex-1 min-h-\[44px\] [^"]*"[^>]*>What&#x27;s in Amarillo<\/button>/);
    expect(open).toMatch(/<button[^>]*class="flex-1 min-h-\[44px\] [^"]*"[^>]*>\+ Stop here<\/button>/);
    expect(open).not.toContain("before:");
  });

  it("keeps a town's row with no place written up only when asked, and draws the answer under its own town", () => {
    // A stop is its day's end and has a row whatever the atlas holds
    // (Gauntlet U3, round 2); a town that merely fits with nothing to
    // show draws nothing, as before.
    const bare: WaypointFetchResult = { ...result, waypoints: [] };
    const props = { ...baseProps, fetchResult: bare, addedCityIds: new Set(["amarillo"]), onCityPreview: () => {} };
    expect(renderToString(<RecommendationList {...props} notices={false} />)).toBe("");
    const kept = renderToString(<RecommendationList {...props} notices={false} keepEmpty />).replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
    expect(kept).toContain("What's in Amarillo");
    expect(kept).toContain("✓ Added");
    expect(kept).toContain("Nothing written up for Amarillo yet.");
    // The answer to "What's in Amarillo" sits under Amarillo's rows, and
    // under no other town.
    const withDetail = renderToString(
      <RecommendationList {...baseProps} fetchResult={result} detail={{ cityId: "amarillo", node: <p data-answer>Its parts of town</p> }} />
    );
    expect(withDetail.indexOf("data-answer")).toBeGreaterThan(withDetail.indexOf("A bare name"));
    expect(renderToString(<RecommendationList {...baseProps} fetchResult={result} detail={{ cityId: "lubbock", node: <p data-answer /> }} />)).not.toContain("data-answer");
  });

  it("drops the drive from a stop's row: the day's heading above it says the drive the route measured", () => {
    // Gauntlet U3, round 3: "Lubbock · 1 h 40 min away" sat under "Day 1 ·
    // Amarillo to Lubbock · 1 h 43 min", two figures for one drive. A town
    // that fits keeps its drive, the only figure for it on the sheet.
    const render = (added: string[]) =>
      renderToString(<RecommendationList {...baseProps} fetchResult={result} addedCityIds={new Set(added)} />).replace(/<!-- -->/g, "");
    const fits = render([]);
    expect(fits).toMatch(/<h3 class="text-base leading-6 break-words">Amarillo<span class="ml-2 text-\[#8b949e\]">· <span class="num">20<\/span> min away<\/span><\/h3>/);
    const stop = render(["amarillo"]);
    expect(stop).toMatch(/<h3 class="text-base leading-6 break-words">Amarillo<\/h3>/);
    expect(stop).not.toContain("away");
    expect(stop).toContain("✓ Added");
  });

  it("shows no preview button when the parent does not offer one", () => {
    const html = renderToString(
      <RecommendationList
        fetchResult={result}
        moodProfile={PROFILE}
        moodKey="museums"
        cityCoords={new Map()}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
      />
    );
    expect(html).not.toContain("What&#x27;s in Amarillo");
  });
});

const baseProps = {
  moodProfile: PROFILE,
  moodKey: "museums",
  cityCoords: new Map<string, { lat: number; lng: number }>(),
  addedCityIds: new Set<string>(),
  onAddCity: () => {},
  onRemoveCity: () => {},
};

/**
 * Council round 1 on #85, item 1. WaypointFetchResult has no "failed"
 * member: a page whose town read failed passes an empty "fresh" set and
 * `initialCandidateFetchFailed` to the workspace, which says the failure
 * as the sheet's title. So the list's failed state is an empty set, which
 * draws nothing, and its degraded state carries the towns it could read.
 */
describe("the candidate list on a failed or degraded fetch", () => {
  it("draws nothing, and does not throw, for the empty set the page passes when the towns could not be read", () => {
    const empty: WaypointFetchResult = { status: "fresh", cities: [], waypoints: [], neighborhoods: {} };
    const emptyDegraded: WaypointFetchResult = {
      status: "degraded",
      cities: [],
      waypoints: [],
      neighborhoods: {},
      failures: [{ kind: "waypoints", reason: "atlas read failed" }],
    };
    let html = "x";
    expect(() => {
      html = renderToString(<RecommendationList {...baseProps} fetchResult={empty} />);
    }).not.toThrow();
    expect(html).toBe("");
    expect(() => {
      html = renderToString(<RecommendationList {...baseProps} fetchResult={emptyDegraded} />);
    }).not.toThrow();
    expect(html).toBe("");
  });

  it("says the places did not load when the fetch was degraded and no place came back", () => {
    const degraded: WaypointFetchResult = {
      status: "degraded",
      cities: result.cities,
      waypoints: [],
      neighborhoods: {},
      failures: [{ kind: "waypoints", cityId: "amarillo", reason: "atlas read failed" }],
    };
    const html = renderToString(<RecommendationList {...baseProps} fetchResult={degraded} />);
    expect(html).toContain("Nothing written up for these towns yet");
    expect(html).toContain("Some of the places did not load. Reload to try again.");
  });

  it("says the places did not load above the rows when the fetch was degraded and some came back", () => {
    const degraded: WaypointFetchResult = {
      status: "degraded",
      cities: result.cities,
      waypoints: result.waypoints,
      neighborhoods: {},
      failures: [{ kind: "neighborhoods", cityId: "amarillo", reason: "timeout" }],
    };
    const html = renderToString(<RecommendationList {...baseProps} fetchResult={degraded} />);
    expect(html).toContain("Some of the places did not load.");
    expect(html).toContain("Cadillac Ranch");
  });
});
