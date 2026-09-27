import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import RecommendationList from "@/components/RecommendationList";
import type { WaypointFetchResult } from "@/lib/routing/scoring";

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
        activePersonaId="nerd"
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

  it("offers to show a city's lore before it is added, and marks the open one as pressed", () => {
    const render = (previewed: string | null) =>
      renderToString(
        <RecommendationList
          fetchResult={result}
          activePersonaId="nerd"
          cityCoords={new Map([["amarillo", { lat: 35.22, lng: -101.83 }]])}
          addedCityIds={new Set()}
          onAddCity={() => {}}
          onRemoveCity={() => {}}
          onCityPreview={() => {}}
          previewedCityId={previewed}
        />
      );
    const closed = render(null);
    expect(closed).toContain('aria-label="See what is in Amarillo"');
    expect(closed).toMatch(/aria-pressed="false"[^>]*aria-label="See what is in Amarillo"/);
    expect(closed).toContain("+ Add city to trip");   // still not added
    const open = render("amarillo");
    expect(open).toMatch(/aria-pressed="true"[^>]*aria-label="See what is in Amarillo"/);
    // the header is tall enough to hold the 44 px hit areas without them reaching the rows
    expect(open).toMatch(/<h3[^>]*min-h-\[44px\]/);
  });

  it("shows no preview button when the parent does not offer one", () => {
    const html = renderToString(
      <RecommendationList
        fetchResult={result}
        activePersonaId="nerd"
        cityCoords={new Map()}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
      />
    );
    expect(html).not.toContain("See what is in");
  });
});
