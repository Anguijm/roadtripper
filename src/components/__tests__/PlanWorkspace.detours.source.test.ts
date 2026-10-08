import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The map's towns go only to Google's map, which no test renders; this
// reads the sheet's source to guard the line that keeps a town the trip
// has no room for off the map (U21), as the label wiring is guarded.
describe("the sheet hands the map only the towns it offers (U21)", () => {
  it("filters the map's towns by the offered set", () => {
    const sheet = readFileSync(new URL("../PlanWorkspace.tsx", import.meta.url), "utf8");
    expect(sheet).toContain("return onlyOffered(all, effectiveWaypointFetch);");
    expect(sheet).toContain("() => offeredTowns(markOffRoad(rawWaypointFetch, road, { origin, destination }), roomForDetours),");
  });
});
