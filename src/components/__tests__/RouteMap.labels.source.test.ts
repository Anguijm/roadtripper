import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The map's label wiring runs only inside a real Google map, which no test
// has; this reads RouteMap's source to guard it, the way the days and
// roadside tests guard effects 2d and 4 (U20).
const map = readFileSync(new URL("../RouteMap.tsx", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../PlanWorkspace.tsx", import.meta.url), "utf8");

describe("the map names only the towns whose names fit (U20)", () => {
  it("draws a town's name above its dot", () => {
    expect(map).toMatch(/function candidateMarkerIcon[\s\S]*?labelOrigin: new google\.maps\.Point\(22, 22 \+ TOWN_LABEL_DY\)/);
  });
  it("measures which names fit on every zoom, with the start, the end and the stops' names fixed first", () => {
    expect(map).toContain("const fit = labelsThatFit(fixed, towns);");
    expect(map).toContain('map.addListener("zoom_changed", measure)');
    expect(map).toContain("pin(origin.lat, origin.lng, originName);");
    expect(map).toContain("pin(destination.lat, destination.lng, destinationName);");
    expect(map).toContain("for (const stop of tripStops ?? []) pin(stop.lat, stop.lng, tripStopLabel(stop)?.text);");
  });
  it("puts the open day's towns before the rest", () => {
    expect(map).toContain("[...named.filter((c) => focusCandidateIds.has(c.id)), ...named.filter((c) => !focusCandidateIds.has(c.id))]");
  });
  it("draws a named town above the diamonds and under the endpoints", () => {
    expect(map).toContain("marker.setZIndex(named ? NAMED_TOWN_Z : undefined);");
    const z = Number(map.match(/const NAMED_TOWN_Z = (\d+);/)?.[1]);
    expect(z).toBeGreaterThan(1600);
    expect(z).toBeLessThan(1800);
  });
  it("hands the map its towns in the title's order", () => {
    expect(sheet).toContain("candidates={mapCandidates}");
    expect(sheet).toContain("inTitleOrder(liveCandidateMarkers, effectiveWaypointFetch.cities.map((c) => c.id))");
  });
  it("gives the map's names a dark halo so they read over a diamond (round 1 critic)", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.rt-candidate-label \{\s*text-shadow: [^;]*#0d1117/);
  });
});
