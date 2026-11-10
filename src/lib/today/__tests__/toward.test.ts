import { describe, it, expect } from "vitest";
import { parseTowardQuery, pickStops, towardAnswer, townAt, MAX_ROWS, ARRIVED_KM, MAX_DETOUR_MINUTES } from "@/lib/today/toward";
import type { RoadsideMarker } from "@/lib/roadside/along";
import { placeNameKey } from "@/lib/plan/days";
import { inCone } from "@/lib/today/cone";
import { resolveStorePath } from "@/lib/roadside/store";

/** The real roadside store is fetched at build and is not in CI; its checks run where it is (survivorsInCone is checked on a made-up store in src/lib/roadside/__tests__/store.cone.test.ts). */
const HAS_STORE = resolveStorePath() !== null;

/**
 * GET /api/today/toward's contract (docs/car-api.md, agreed with the car
 * session 2026-11-10), against the real atlas and roadside store.
 */

const q = (s: string) => parseTowardQuery(new URLSearchParams(s));
const DETROIT = { lat: 42.33, lng: -83.05 };
const LOUISVILLE = { kind: "city" as const, id: "louisville" };
const MAMMOTH_CAVE = { lat: 37.19, lng: -86.1 };
const NOW = new Date("2026-11-10T13:00:00.000Z");

describe("parseTowardQuery", () => {
  it("takes an atlas id, or a point, as the destination", () => {
    expect(q("lat=42.33&lng=-83.05&to=louisville")).toMatchObject({ ok: true, to: { kind: "city", id: "louisville" }, hours: 5 });
    expect(q("lat=42.33&lng=-83.05&toLat=37.19&toLng=-86.1&hours=8")).toMatchObject({ ok: true, to: { kind: "point", at: MAMMOTH_CAVE }, hours: 8 });
  });

  it("refuses both forms, neither, a bad id or a bad point", () => {
    expect(q("lat=42.33&lng=-83.05&to=louisville&toLat=37&toLng=-86")).toMatchObject({ ok: false, message: expect.stringMatching(/not both/) });
    expect(q("lat=42.33&lng=-83.05")).toMatchObject({ ok: false, message: expect.stringMatching(/destination is required/) });
    expect(q("lat=42.33&lng=-83.05&to=Louisville, KY")).toMatchObject({ ok: false });
    expect(q("lat=42.33&lng=-83.05&toLat=37.19")).toMatchObject({ ok: false, message: expect.stringMatching(/toLng/) });
    expect(q("lat=42.33&lng=-83.05&toLat=%20&toLng=-86")).toMatchObject({ ok: false, message: expect.stringMatching(/toLat/) });
  });

  it("keeps /api/today's rules for the rest", () => {
    expect(q("lat=42.33&lng=-83.05&to=louisville&moods=nope")).toMatchObject({ ok: false });
    expect(q("lng=-83.05&to=louisville")).toMatchObject({ ok: false });
  });
});

describe("townAt", () => {
  it("names the atlas town whose own radius holds a typed point, and nothing for a place it lacks", () => {
    expect(townAt({ lat: 38.26, lng: -85.75 })?.id).toBe("louisville");
    expect(townAt(MAMMOTH_CAVE)).toBeNull();
  });
});

describe("towardAnswer, Detroit toward Louisville", () => {
  it("lists towns and roadside stops in the cone, nearest first, within the cap, ids unique", async () => {
    const a = await towardAnswer(DETROIT, LOUISVILLE, 5, [], NOW);
    if (a.status !== "ok") throw new Error(`expected ok, got ${a.status}`);
    expect(a.here.name).toBe("Detroit");
    expect(a).toMatchObject({ hours: 5, moods: [] });
    expect(a.destination).toMatchObject({ cityId: "louisville", name: "Louisville", estimated: false, withinToday: false });
    expect(a.stops.length).toBeGreaterThan(5);
    expect(a.stops.length).toBeLessThanOrEqual(MAX_ROWS);
    const minutes = a.stops.map((s) => s.reachMinutes);
    expect(minutes).toEqual([...minutes].sort((x, y) => x - y));
    expect(new Set(a.stops.map((s) => s.id)).size).toBe(a.stops.length);
    const dest = { lat: a.destination.lat, lng: a.destination.lng };
    for (const s of a.stops) {
      expect(inCone(DETROIT, dest, s)).toBe(true);
      expect(s.detourMinutes).toBeGreaterThanOrEqual(0);
      // John's cap (2026-11-11): nothing that adds more than 40 minutes.
      expect(s.detourMinutes).toBeLessThanOrEqual(MAX_DETOUR_MINUTES);
      expect(s.isDestination).toBe(false);
      expect(s.reachMinutes).toBeLessThanOrEqual(5 * 60);
    }
    const names = a.stops.map((s) => s.name);
    expect(names).toContain("Toledo");
    // Columbus is toward Louisville but adds about 43 minutes: over the cap.
    expect(names).not.toContain("Columbus");
    expect(names).not.toContain("Flint");
    expect(names).not.toContain("Detroit");
  });

  it("gives towns drive-graph minutes and their places", async () => {
    const a = await towardAnswer(DETROIT, LOUISVILLE, 5, [], NOW);
    if (a.status !== "ok") throw new Error(a.status);
    const towns = a.stops.filter((s) => s.type === "town");
    expect(towns.length).toBeGreaterThan(0);
    for (const t of towns) {
      expect(t.estimated).toBe(false);
      expect(t).toMatchObject({ kind: "Town", near: null, line: null });
      if (t.type === "town") expect(t.places.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!HAS_STORE)("gives roadside stops estimated minutes, an OSM id and a nearby town (real store)", async () => {
    const a = await towardAnswer(DETROIT, LOUISVILLE, 5, [], NOW);
    if (a.status !== "ok") throw new Error(a.status);
    const stops = a.stops.filter((s) => s.type === "stop");
    expect(stops.length).toBeGreaterThan(0);
    for (const s of stops) {
      expect(s.estimated).toBe(true);
      expect(s.id).toMatch(/^osm:/);
      expect("places" in s).toBe(false);
    }
    expect(stops.some((s) => s.near !== null)).toBe(true);
  });

  it("never lists a roadside stop that is already a place in one of its towns", async () => {
    const a = await towardAnswer(DETROIT, LOUISVILLE, 8, [], NOW);
    if (a.status !== "ok") throw new Error(a.status);
    const key = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const placeNames = new Set(a.stops.flatMap((s) => (s.type === "town" ? s.places.map((p) => key(p.name)) : [])));
    for (const s of a.stops) if (s.type === "stop") expect(placeNames.has(key(s.name))).toBe(false);
  });

  it("adds the destination as the last town row with its places when today reaches it", async () => {
    const a = await towardAnswer(DETROIT, LOUISVILLE, 8, [], NOW);
    if (a.status !== "ok") throw new Error(a.status);
    expect(a.destination.withinToday).toBe(true);
    const dest = a.stops.filter((s) => s.isDestination);
    expect(dest).toHaveLength(1);
    expect(dest[0]).toMatchObject({ type: "town", id: "louisville", detourMinutes: 0 });
    if (dest[0].type === "town") expect(dest[0].places.length).toBeGreaterThan(0);
  });

  it("with a mood chosen, every stop answers it", async () => {
    const a = await towardAnswer(DETROIT, LOUISVILLE, 5, ["history"], NOW);
    if (a.status !== "ok") throw new Error(a.status);
    for (const s of a.stops) if (s.type === "stop") expect(s.badge).toBe("good");
  });
});

describe("towardAnswer, the other answers", () => {
  it("aims a typed place the atlas lacks, with an estimated drive", async () => {
    const a = await towardAnswer(DETROIT, { kind: "point", at: MAMMOTH_CAVE }, 8, [], NOW);
    if (a.status !== "ok") throw new Error(a.status);
    expect(a.destination).toMatchObject({ cityId: null, name: null, lat: MAMMOTH_CAVE.lat, lng: MAMMOTH_CAVE.lng, estimated: true });
    expect(a.stops.some((s) => s.isDestination)).toBe(false);
    const names = a.stops.map((s) => s.name);
    // The most on-the-way towns, not the nearest: Lexington is on the road
    // south; Cleveland and Akron are nearer but 90 minutes off it, and Flint
    // is behind (both seen on the first run).
    expect(names).toEqual(expect.arrayContaining(["Toledo", "Dayton", "Cincinnati", "Lexington"]));
    for (const off of ["Cleveland", "Akron", "Flint", "Kalamazoo"]) expect(names).not.toContain(off);
  });

  it("says arrived within 15 km, with here and the destination", async () => {
    const a = await towardAnswer({ lat: 38.25, lng: -85.76 }, LOUISVILLE, 5, [], NOW);
    expect(a).toMatchObject({ status: "arrived", here: { cityId: "louisville" }, destination: { cityId: "louisville" }, hours: 5 });
    expect(ARRIVED_KM).toBe(15);
  });

  it("says unknown-destination for an id the atlas lacks, and no-city far from any town", async () => {
    expect(await towardAnswer(DETROIT, { kind: "city", id: "atlantis" }, 5, [], NOW)).toMatchObject({ status: "unknown-destination" });
    expect(await towardAnswer({ lat: 0, lng: -140 }, LOUISVILLE, 5, [], NOW)).toMatchObject({ status: "no-city" });
  });
});

describe("pickStops", () => {
  const stop = (id: string, name: string, p: number, scores?: RoadsideMarker["scores"]): RoadsideMarker => ({
    id, name, lat: 41, lng: -84, kind: "attraction", p, about: null, url: null, alongKm: 10, ...(scores ? { scores } : {}),
  });
  const memorial = stop("osm:node:1", "Old Courthouse", 0.6, { old_building: 0.9 });
  const tomato = stop("osm:node:2", "The Giant Tomato", 0.9);
  const twin = stop("osm:node:3", "the giant tomato", 0.5);

  it("leaves out a stop that answers no chosen mood, however strong", () => {
    expect(pickStops([memorial, tomato], ["history"], new Set()).map((s) => s.id)).toEqual(["osm:node:1"]);
    expect(pickStops([memorial, tomato], [], new Set()).map((s) => s.id)).toEqual(["osm:node:2", "osm:node:1"]);
  });

  it("drops a stop already listed as a town's place, and a second stop of one name", () => {
    // The towns' place names arrive as placeNameKey keys, as towardAnswer builds them.
    expect(pickStops([tomato, memorial], [], new Set([placeNameKey("The Giant Tomato")])).map((s) => s.id)).toEqual(["osm:node:1"]);
    expect(pickStops([tomato, twin], [], new Set()).map((s) => s.id)).toEqual(["osm:node:2"]);
  });

  it("stops at the cap", () => {
    expect(pickStops([tomato, memorial], [], new Set(), 1)).toHaveLength(1);
  });
});

