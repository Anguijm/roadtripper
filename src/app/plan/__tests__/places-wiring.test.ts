import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The plan page is a Server Component that calls the Routes API, so no
// test renders it; this reads its source to guard the one line that hands
// the sheet the towns on its road (U19). Without it every cut is named by
// the atlas alone, and every test of the sheet still passes.
describe("the plan page passes the towns on its road (U19)", () => {
  it("gives the sheet placesForRoute of the route it drew", () => {
    const src = readFileSync("src/app/plan/page.tsx", "utf8");
    expect(src).toMatch(/roadPlaces=\{placesForRoute\(route\.encodedPolyline\)\}/);
  });
  it("keeps the list off the client: only server modules import it", () => {
    expect(readFileSync("src/components/PlanWorkspace.tsx", "utf8")).not.toMatch(/lib\/plan\/places["']/);
    expect(readFileSync("src/lib/plan/places.ts", "utf8")).toMatch(/^import "server-only";/m);
  });
});
