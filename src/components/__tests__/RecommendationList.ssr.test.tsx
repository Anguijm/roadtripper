import { STICKY_BAND_PX } from "@/components/RecommendationList";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import RecommendationList, { RecommendationNotices } from "@/components/RecommendationList";
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
    expect(open).toMatch(/<h3 class="text-base leading-6 break-words"><span data-town-name="true" class="font-medium text-\[#f0f6fc\]">Amarillo<\/span><span class="ml-1 text-\[#8b949e\]">· <span class="whitespace-nowrap"><span class="num">20<\/span> min<\/span> away<\/span><\/h3><div class="mt-1 flex gap-2"><button/);
    // Both 44 px tall; Stop here takes three parts of the row to What's
    // in's two (U25, rule 3: the next action is the largest control).
    expect(open).toMatch(/<button[^>]*class="flex-\[2\] min-w-0 min-h-\[44px\] [^"]*"[^>]*>What&#x27;s in Amarillo<\/button>/);
    expect(open).toMatch(/<button[^>]*class="flex-\[3\] min-h-\[44px\] [^"]*"[^>]*>\+ Stop here<\/button>/);
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
    expect(fits).toMatch(/<h3 class="text-base leading-6 break-words"><span data-town-name="true" class="font-medium text-\[#f0f6fc\]">Amarillo<\/span><span class="ml-1 text-\[#8b949e\]">· <span class="whitespace-nowrap"><span class="num">20<\/span> min<\/span> away<\/span><\/h3>/);
    const stop = render(["amarillo"]);
    expect(stop).toMatch(/<h3 class="text-base leading-6 break-words"><span data-town-name="true" class="font-medium text-\[#f0f6fc\]">Amarillo<\/span><\/h3>/);
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


describe("a read that failed does not look like a road with nothing on it", () => {
  // Council round 4 on #94. A degraded fetch that came back with no towns
  // returned null, so the screen said nothing and the person had no way to
  // know a reload would help.
  const degraded = {
    status: "degraded" as const,
    cities: [],
    waypoints: [],
    neighborhoods: {},
    failures: [{ cityId: "lubbock", reason: "timeout" }],
  };
  const fresh = { status: "fresh" as const, cities: [], waypoints: [], neighborhoods: {} };

  it("says the towns did not load when the read was degraded and brought none", () => {
    const html = renderToString(
      <RecommendationNotices fetchResult={degraded as never} moodProfile={PROFILE} moodKey="museums" />
    );
    expect(html).toContain("did not load");
    expect(html).toContain("Reload to try again");
  });

  it("still says nothing when the read was fine and the road simply has no towns", () => {
    const html = renderToString(
      <RecommendationNotices fetchResult={fresh as never} moodProfile={PROFILE} moodKey="museums" />
    );
    expect(html).toBe("");
  });
});

describe("one pick per town on the list (U24)", () => {
  // Two museum-kind places (primary for "Museums"), neither with a reason,
  // and a lower one with a reason, which leads the card.
  const many: WaypointFetchResult = {
    status: "fresh",
    cities: [{ id: "lubbock", name: "Lubbock", vibeClass: null, detourMinutes: 40, lat: 33.58, lng: -101.86 }],
    waypoints: [
      { id: "m1", cityId: "lubbock", name: "Museum one", type: "culture", trendingScore: 0.9, neighborhoodId: null, description: null },
      { id: "m2", cityId: "lubbock", name: "Museum two", type: "culture", trendingScore: 0.8, neighborhoodId: null, description: null },
      { id: "l1", cityId: "lubbock", name: "A landmark", type: "landmark", trendingScore: 0.1, neighborhoodId: null, description: "Has a reason." },
    ],
    neighborhoods: {},
  };
  const render = (fetchResult: WaypointFetchResult) =>
    renderToString(
      <RecommendationList
        fetchResult={fetchResult}
        moodProfile={PROFILE}
        moodKey="museums"
        cityCoords={new Map([["lubbock", { lat: 33.58, lng: -101.86 }]])}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
      />
    );
  it("badges one place the pick and the next Also good", () => {
    const html = render(many);
    expect(html.match(/★ The pick/g)?.length).toBe(1);
    expect(html.indexOf("Museum one")).toBeLessThan(html.indexOf("★ The pick"));
    expect(html.indexOf("★ The pick")).toBeLessThan(html.indexOf("Museum two"));
    expect(html).toContain("Also good");
    // On the kind line, as words, not a box at the row's right (U42).
    expect(html).toMatch(/<p class="text-base text-\[#8b949e\] mt-0\.5">Culture<!-- --> · <span data-badge="good" class="whitespace-nowrap">Also good<\/span><\/p>/);
    expect(html).toMatch(/<p class="text-base text-\[#8b949e\] mt-0\.5">Culture<!-- --> · <span data-badge="pick" class="font-medium whitespace-nowrap" style="color:#[0-9a-f]{6}">★ The pick<\/span><\/p>/i);
    expect(html).not.toMatch(/data-badge="[^"]*"[^>]*class="[^"]*border/);
  });
  it("gives a town out of the way no pick", () => {
    const html = render({ ...many, cities: [{ ...many.cities[0], outOfTheWay: true }] });
    expect(html).not.toContain("★ The pick");
  });
});

describe("one obvious action on a town's card (U25)", () => {
  it("draws Stop here in the town's accent and What's in in the neutral outline", () => {
    const html = renderToString(
      <RecommendationList
        fetchResult={result}
        moodProfile={PROFILE}
        moodKey="museums"
        cityCoords={new Map([["amarillo", { lat: 35.22, lng: -101.83 }]])}
        addedCityIds={new Set()}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
        onCityPreview={() => {}}
      />
    );
    const stop = html.match(/<button[^>]*>\+ Stop here<\/button>/)?.[0] ?? "";
    const whats = html.match(/<button[^>]*>What&#x27;s in (<!-- -->)?Amarillo<\/button>/)?.[0] ?? "";
    // The largest control and the only filled one (round 2: an accent
    // outline the same size as "What's in" was not enough for rule 3).
    expect(stop).toMatch(/style="background-color:#[0-9a-f]{6};color:#0d1117"/i);
    expect(stop).toContain("flex-[3]");
    expect(whats).not.toBe("");
    expect(whats).not.toMatch(/style=/);
    expect(whats).toContain("border-[#30363d]");
    expect(whats).toContain("flex-[2]");
  });

  it("steps an added town's button back to an outline: the action is done", () => {
    const html = renderToString(
      <RecommendationList
        fetchResult={result}
        moodProfile={PROFILE}
        moodKey="museums"
        cityCoords={new Map([["amarillo", { lat: 35.22, lng: -101.83 }]])}
        addedCityIds={new Set(["amarillo"])}
        onAddCity={() => {}}
        onRemoveCity={() => {}}
        onCityPreview={() => {}}
      />
    );
    const added = html.match(/<button[^>]*>✓ Added<\/button>/)?.[0] ?? "";
    expect(added).toMatch(/style="border-color:#[0-9a-f]{6};color:#[0-9a-f]{6}"/i);
    expect(added).not.toMatch(/background-color/);
  });
});


describe("a pinned town header covers the scroll box's padding above it (U32)", () => {
  it("draws a band of its own colour as tall as the sheet's scroll padding", () => {
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
    // And room above for the band, so an unpinned header's band covers
    // nothing (U37: it clipped "Towns that fit today").
    expect(html).toMatch(new RegExp(`class="sticky top-0[^"]*" style="box-shadow:0 -${STICKY_BAND_PX}px 0 0 #161b22;margin-top:${STICKY_BAND_PX}px"`));
    // Tied to the scroll box's padding: p-2 is 8 px.
    const sheet = readFileSync(new URL("../PlanWorkspace.tsx", import.meta.url), "utf8");
    expect(sheet).toContain('className="plan-sheet-scroll flex-1 overflow-y-auto p-2 space-y-2"');
    expect(STICKY_BAND_PX).toBe(8);
  });
});
