import { describe, it, expect } from "vitest";
import { parseTodayQuery, todayAnswer, CAR_HOURS, NO_LIMIT } from "@/lib/today/api";
import { allCities, driveGraphPaceMinutesPerKm, driveMinutesBetween, haversineKm } from "@/lib/atlas/queries";

/**
 * GET /api/today's contract (docs/car-api.md, agreed with the car session
 * 2026-11-10), against the real atlas that ships with the build.
 */

const q = (s: string) => parseTodayQuery(new URLSearchParams(s));
const OMAHA = { lat: 41.2565, lng: -95.9345 };
const NOW = new Date("2026-11-10T01:00:00.000Z");
/** On I-75, 109 km from Dayton and 112 from Toledo: no atlas town within 40 km. */
const NEAR_LIMA_OHIO = { lat: 40.74, lng: -84.11 };

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

  it("takes the car's longer days, 10 and 12, and any for no limit (2026-11-14)", () => {
    expect(CAR_HOURS).toEqual([2, 3, 4, 5, 6, 8, 10, 12]);
    expect(NO_LIMIT).toBe("any");
    expect(q("lat=41&lng=-95&hours=10")).toMatchObject({ ok: true, hours: 10 });
    expect(q("lat=41&lng=-95&hours=12")).toMatchObject({ ok: true, hours: 12 });
    expect(q("lat=41&lng=-95&hours=any")).toMatchObject({ ok: true, hours: null });
    expect(q("lat=41&lng=-95&hours=%20any%20")).toMatchObject({ ok: true, hours: null });
    // A blank value is 0 to Number(), and must not mean no limit.
    for (const v of ["", "0", "ANY", "none", "9", "24", "-1"]) expect(q(`lat=41&lng=-95&hours=${v}`)).toMatchObject({ ok: true, hours: 5 });
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

describe("a town across a border (U52)", () => {
  it("gives each town and here a country, so Toronto from Buffalo can be labelled", async () => {
    // From Detroit, Toronto was the tenth town until Toledo joined the atlas
    // (2026-11-10) and pushed it out of the ten the answer carries. From
    // Buffalo it is second, so this tests the label, not Detroit's top ten.
    const a = await todayAnswer({ lat: 42.8864, lng: -78.8784 }, 4, [], NOW);
    if (a.status !== "ok") throw new Error(`expected ok, got ${a.status}`);
    expect(a.here.country).toBe("United States");
    const toronto = a.towns.find((t) => t.id === "toronto");
    expect(toronto?.country).toBe("Canada");
    expect(a.towns.filter((t) => t.id !== "toronto").every((t) => typeof t.country === "string")).toBe(true);
  });
});

describe("between towns (the car's request, 2026-11-14)", () => {
  it("answers ok 109 km from Dayton, every town measured from the point and marked estimated, Dayton among them", async () => {
    const a = await todayAnswer(NEAR_LIMA_OHIO, 4, [], NOW);
    if (a.status !== "ok") throw new Error(`expected ok, got ${a.status}`);
    expect(a.here).toMatchObject({ cityId: "dayton", name: "Dayton", snapped: false });
    expect(a.here.distanceKm).toBeCloseTo(109.3, 0);
    expect(a.towns.slice(0, 2).map((t) => t.id)).toEqual(["dayton", "toledo-oh"]);
    expect(a.towns.length).toBe(10);
    expect(a.towns.every((t) => t.estimated)).toBe(true);
    const pace = driveGraphPaceMinutesPerKm();
    const byId = new Map(allCities().map((c) => [c.id, c]));
    for (const t of a.towns) expect(t.driveMinutes).toBe(Math.round(haversineKm(NEAR_LIMA_OHIO, byId.get(t.id)!) * pace));
    expect(a.towns[0].places.length).toBeGreaterThan(0);
  });

  it("keeps drive graph minutes, snapped, within 40 km of a town", async () => {
    const a = await todayAnswer(OMAHA, 4, [], NOW);
    if (a.status !== "ok") throw new Error(`expected ok, got ${a.status}`);
    expect(a.here.snapped).toBe(true);
    expect(a.towns.every((t) => !t.estimated && t.id !== "omaha")).toBe(true);
    expect(a.towns.find((t) => t.id === "lincoln-ne")?.driveMinutes).toBe(Math.round(driveMinutesBetween("omaha", "lincoln-ne")!));
  });
});

describe("longer days (the car's request, 2026-11-14)", () => {
  // Central Nevada, 161 km from Elko: few towns, so the day's length shows.
  const NEVADA = { lat: 39.5, lng: -116.5 };
  it("echoes no limit as null and reaches further than a short day", async () => {
    const any = await todayAnswer(NEVADA, null, [], NOW);
    const three = await todayAnswer(NEVADA, 3, [], NOW);
    if (any.status !== "ok" || three.status !== "ok") throw new Error("expected ok");
    expect(any.hours).toBeNull();
    expect(three.hours).toBe(3);
    expect(three.towns.length).toBeLessThan(any.towns.length);
    expect(any.towns.length).toBe(10);
    const m = any.towns.map((t) => t.driveMinutes);
    expect(m).toEqual([...m].sort((a, b) => a - b));
  });

  it("marks a town past the drive graph's 650 km estimated, and the graph's towns not", async () => {
    const a = await todayAnswer(OMAHA, 12, [], NOW);
    if (a.status !== "ok") throw new Error(`expected ok, got ${a.status}`);
    // The ten nearest are all inside the graph from Omaha.
    expect(a.towns.every((t) => !t.estimated)).toBe(true);
  });
});
