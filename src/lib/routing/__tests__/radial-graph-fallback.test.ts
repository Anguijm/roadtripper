import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Separate file from radial-graph.test.ts on purpose: vi.mock is hoisted and
 * module-wide, and the other suite needs the real driveTimesFrom.
 *
 * The case council blocked on: a database error inside the graph read must
 * reach the live API as a fallback, not the user as an empty map. Before this,
 * driveTimesFrom caught and returned [], which the caller reported as a hit
 * with nothing in range, and no fallback ever ran.
 */
vi.mock("@/lib/atlas/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atlas/queries")>();
  return {
    ...actual,
    driveTimesFrom: vi.fn(() => {
      throw new Error("database is locked");
    }),
  };
});

import { findCitiesInRadius } from "../radial";
import { allCities, hasDriveGraphFor } from "@/lib/atlas/queries";

describe("a failing graph read falls back to the API", () => {
  const realFetch = globalThis.fetch;
  let calls: string[];
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error(`unexpected network call to ${String(input)}`);
    }) as unknown as typeof fetch;
    process.env.GOOGLE_MAPS_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    quiet.mockClear();
  });

  it("reaches the Routes API when driveTimesFrom throws for a covered city", async () => {
    // A city the graph genuinely covers, so the code gets past hasDriveGraphFor
    // and into the (mocked, throwing) driveTimesFrom.
    const origin = allCities().find((c) => hasDriveGraphFor(c.id));
    expect(origin, "no graph-covered city to test with").toBeDefined();

    await expect(
      findCitiesInRadius(
        { lat: origin!.lat, lng: origin!.lng },
        { lat: 34.0549, lng: -118.2426 },
        600
      )
    ).rejects.toThrow(/unexpected network call/);

    expect(calls.length, "the fallback never reached the API").toBeGreaterThan(0);
    expect(quiet).toHaveBeenCalledWith(
      expect.stringContaining("drive-graph lookup failed"),
      expect.any(Error)
    );
  });
});
