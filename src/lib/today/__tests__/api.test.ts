import { describe, it, expect } from "vitest";
import { parseTodayQuery, todayAnswer } from "@/lib/today/api";

/**
 * GET /api/today's contract (docs/car-api.md, agreed with the car session
 * 2026-11-10), against the real atlas that ships with the build.
 */

const q = (s: string) => parseTodayQuery(new URLSearchParams(s));
const OMAHA = { lat: 41.2565, lng: -95.9345 };
const NOW = new Date("2026-11-10T01:00:00.000Z");

describe("the query", () => {
  it("needs lat and lng in range", () => {
    expect(q("lng=-95")).toEqual({ ok: false, message: "lat must be a number between -90 and 90" });
    expect(q("lat=91&lng=-95")).toMatchObject({ ok: false });
    expect(q("lat=41&lng=abc")).toEqual({ ok: false, message: "lng must be a number between -180 and 180" });
  });

  it("falls back to 5 hours for a missing or unknown value, and keeps a known one", () => {
    expect(q("lat=41&lng=-95")).toMatchObject({ ok: true, hours: 5 });
    expect(q("lat=41&lng=-95&hours=7")).toMatchObject({ ok: true, hours: 5 });
    expect(q("lat=41&lng=-95&hours=8")).toMatchObject({ ok: true, hours: 8 });
  });

  it("is loud about an unknown mood or more than two", () => {
    expect(q("lat=41&lng=-95&moods=history,food")).toMatchObject({ ok: true, moods: ["history", "food"] });
    expect(q("lat=41&lng=-95&moods=")).toMatchObject({ ok: true, moods: [] });
    expect(q("lat=41&lng=-95&moods=historyy")).toMatchObject({ ok: false });
    expect(q("lat=41&lng=-95&moods=history,food,art")).toEqual({ ok: false, message: "at most two moods" });
    // A repeated mood counts once.
    expect(q("lat=41&lng=-95&moods=food,food")).toMatchObject({ ok: true, moods: ["food"] });
  });
});

describe("the answer", () => {
  it("lists Omaha's towns nearest first, each with up to five placed, described places and at most one pick", async () => {
    const a = await todayAnswer(OMAHA, 4, ["history"], NOW);
    expect(a.status).toBe("ok");
    if (a.status !== "ok") return;
    expect(a.version).toBe(1);
    expect(a.generatedAt).toBe("2026-11-10T01:00:00.000Z");
    expect(a.here.cityId).toBe("omaha");
    expect(a.hours).toBe(4);
    expect(a.moods).toEqual(["history"]);
    expect(a.towns.length).toBeGreaterThan(0);
    expect(a.towns.length).toBeLessThanOrEqual(10);
    const minutes = a.towns.map((t) => t.driveMinutes);
    expect(minutes).toEqual([...minutes].sort((x, y) => x - y));
    expect(Math.max(...minutes)).toBeLessThanOrEqual(4 * 60);
    for (const t of a.towns) {
      expect(t.places.length).toBeLessThanOrEqual(5);
      expect(t.places.filter((p) => p.badge === "pick").length).toBeLessThanOrEqual(1);
      for (const p of t.places) {
        expect(Number.isFinite(p.lat) && Number.isFinite(p.lng)).toBe(true);
        expect(typeof p.id).toBe("string");
        expect(p.kind).toMatch(/^[A-Z]/);
        expect(p.line === null || typeof p.line === "string").toBe(true);
      }
    }
    // Lincoln, an hour away, is there with its pick.
    const lincoln = a.towns.find((t) => t.id === "lincoln-ne");
    expect(lincoln?.places.some((p) => p.badge === "pick")).toBe(true);
  });

  it("ranks by the moods, as the /today page does", async () => {
    const food = await todayAnswer(OMAHA, 4, ["food"], NOW);
    const history = await todayAnswer(OMAHA, 4, ["history"], NOW);
    if (food.status !== "ok" || history.status !== "ok") throw new Error("expected ok");
    const lead = (a: typeof food) => a.towns.find((t) => t.id === "lincoln-ne")?.places[0]?.kind;
    expect(lead(food)).toMatch(/Food|Drink/);
    expect(lead(history)).not.toMatch(/Food|Drink/);
  });

  it("says no-city for a point no known city is near", async () => {
    expect(await todayAnswer({ lat: 0, lng: -140 }, 4, [], NOW)).toEqual({ version: 1, status: "no-city", generatedAt: "2026-11-10T01:00:00.000Z" });
  });
});

describe("PR #164 council", () => {
  it("refuses a blank lat or lng instead of reading it as 0", () => {
    expect(q("lat=%20&lng=-95")).toMatchObject({ ok: false });
    expect(q("lat=41&lng=%20%20")).toMatchObject({ ok: false });
    expect(q("lat=%2041.5%20&lng=-95")).toMatchObject({ ok: true, origin: { lat: 41.5, lng: -95 } });
  });
});
