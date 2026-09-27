import { describe, it, expect, vi } from "vitest";
import { fromOsmElement, kindFromTags, RoadsideStopSchema, type OsmElement } from "../record";
import { corridorTiles, paddedBox, withinCorridor } from "../corridor";
import { fetchBoxFromOverpass, fetchCorridorFromOverpass, overpassQuery, OverpassError, PAUSE_MS, RETRY_PAUSE_MS, USER_AGENT } from "../overpass";
import { haversineKm, projectOntoPolyline, type LatLng } from "@/lib/routing/polyline";

// ───────────────────────── the record ─────────────────────────

describe("the roadside record", () => {
  const cadillac: OsmElement = {
    type: "way", id: 42, center: { lat: 35.1872, lon: -101.9871 },
    tags: { tourism: "attraction", name: "Cadillac Ranch", wikidata: "Q1025849", wikipedia: "en:Cadillac Ranch" },
  };

  it("needs only a name, a position and a kind; no city, no neighbourhood", () => {
    const s = fromOsmElement(cadillac);
    expect(s).toEqual({
      id: "osm:way:42", name: "Cadillac Ranch", lat: 35.1872, lng: -101.9871, kind: "attraction", source: "osm",
      reason: null, wikidata: "Q1025849", wikipedia: "en:Cadillac Ranch",
    });
    expect(RoadsideStopSchema.safeParse(s).success).toBe(true);
  });

  it("uses the node's own position, and the centre for a way or relation", () => {
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { historic: "monument", name: "X" } })?.lat).toBe(1);
    expect(fromOsmElement({ type: "relation", id: 1, center: { lat: 3, lon: 4 }, tags: { historic: "castle", name: "Y" } })?.lng).toBe(4);
  });

  it("refuses an element with no name, no position, or none of our kinds", () => {
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { tourism: "attraction" } })).toBeNull();
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { tourism: "attraction", name: "   " } })).toBeNull();
    expect(fromOsmElement({ type: "way", id: 1, tags: { tourism: "attraction", name: "No centre" } })).toBeNull();
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { amenity: "fuel", name: "A gas station" } })).toBeNull();
  });

  it("maps tags to kinds, tourism first, and drops a malformed wikidata id", () => {
    expect(kindFromTags({ tourism: "viewpoint", historic: "yes" })).toBe("viewpoint");
    expect(kindFromTags({ natural: "waterfall" })).toBe("waterfall");
    expect(kindFromTags({ man_made: "lighthouse" })).toBe("lighthouse");
    expect(kindFromTags({ shop: "gift" })).toBeNull();
    const s = fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { tourism: "museum", name: "M", wikidata: "not-a-qid" } });
    expect(s?.wikidata).toBeNull();
  });
});

// ───────────────────────── the corridor ─────────────────────────

/** A zigzag road heading east from (35, -102): 8 legs of about 20 km each. */
function zigzag(): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i <= 8; i++) pts.push({ lat: 35 + (i % 2 === 0 ? 0 : 0.12), lng: -102 + i * 0.2 });
  return pts;
}

describe("the corridor query", () => {
  it("pads a box by the buffer in kilometres, wider in longitude at higher latitude", () => {
    const at35 = paddedBox([{ lat: 35, lng: -102 }], 10);
    const at60 = paddedBox([{ lat: 60, lng: -102 }], 10);
    expect(at35.maxLat - at35.minLat).toBeCloseTo(20 / 111.32, 3);
    expect(at60.maxLng - at60.minLng).toBeGreaterThan(at35.maxLng - at35.minLng);
  });

  it("cuts the route into tiles of at most the tile length, sharing boundary points, covering the whole route", () => {
    const route = zigzag();
    const tiles = corridorTiles(route, { tileKm: 25, bufferKm: 10 });
    expect(tiles.length).toBeGreaterThan(3);
    expect(tiles[0].fromKm).toBe(0);
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].fromKm).toBe(tiles[i - 1].toKm);
      expect(tiles[i].points[0]).toEqual(tiles[i - 1].points[tiles[i - 1].points.length - 1]);
    }
    const total = route.slice(1).reduce((s, p, i) => s + haversineKm(route[i], p), 0);
    expect(tiles[tiles.length - 1].toKm).toBeCloseTo(total, 6);
  });

  it("every point inside the buffer of the route falls in at least one tile's box", () => {
    const route = zigzag();
    const tiles = corridorTiles(route, { tileKm: 25, bufferKm: 10 });
    let checked = 0;
    for (let lat = 34.8; lat <= 35.35; lat += 0.02) {
      for (let lng = -102.2; lng <= -100.2; lng += 0.02) {
        const p = { lat, lng };
        if (!withinCorridor(p, route, 10)) continue;
        checked++;
        const inSome = tiles.some((t) => p.lat >= t.box.minLat && p.lat <= t.box.maxLat && p.lng >= t.box.minLng && p.lng <= t.box.maxLng);
        expect(inSome).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("drops a point outside the buffer even when a tile's box contains it", () => {
    // One long diagonal leg: its padded box has corners about 24 km from
    // the road. The box keeps them; the corridor test must not.
    const route: LatLng[] = [{ lat: 35, lng: -102 }, { lat: 35.3, lng: -101.6 }];
    const [tile] = corridorTiles(route, { tileKm: 25, bufferKm: 10 });
    const corner = { lat: tile.box.maxLat, lng: tile.box.minLng };
    expect(projectOntoPolyline(corner, route).distanceKm).toBeGreaterThan(20);
    expect(withinCorridor(corner, route, 10)).toBe(false);
    // and a point 8 km from the road, in the same box, is kept
    const mid = { lat: 35.15, lng: -101.8 };
    const near = { lat: mid.lat + 8 / 111.32, lng: mid.lng };
    expect(projectOntoPolyline(near, route).distanceKm).toBeLessThan(10);
    expect(withinCorridor(near, route, 10)).toBe(true);
  });

  it("handles the degenerate routes and refuses bad options", () => {
    expect(corridorTiles([])).toEqual([]);
    expect(corridorTiles([{ lat: 1, lng: 1 }])).toHaveLength(1);
    expect(() => corridorTiles(zigzag(), { tileKm: 0 })).toThrow();
    expect(withinCorridor({ lat: 1, lng: 1 }, [], 10)).toBe(false);
  });
});

// ───────────────────────── the Overpass client ─────────────────────────

const reply = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response);

const box = { minLat: 35, minLng: -102, maxLat: 35.2, maxLng: -101.8 };
const node = { type: "node", id: 7, lat: 35.1, lon: -101.9, tags: { tourism: "attraction", name: "Big Texan" } };

describe("the Overpass client", () => {
  it("asks for our kinds with names inside the box, with a server-side timeout and centres", () => {
    const q = overpassQuery(box, 45);
    expect(q).toContain("[out:json][timeout:45]");
    expect(q).toContain("35,-102,35.2,-101.8");
    expect(q).toContain('["tourism"~"^(attraction|museum|viewpoint|artwork|theme_park|zoo)$"]["name"]');
    expect(q).toContain('["historic"]["name"]');
    expect(q).toContain("out center tags;");
  });

  it("sends a descriptive User-Agent, posts the query, and returns records", async () => {
    let init: RequestInit | undefined;
    const deps = { fetch: vi.fn(async (_u: RequestInfo | URL, i?: RequestInit) => { init = i; return reply(200, { elements: [node] }); }), sleep: vi.fn(async () => {}) };
    const stops = await fetchBoxFromOverpass(box, deps as never);
    expect(stops).toHaveLength(1);
    expect(stops[0].name).toBe("Big Texan");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(String(init?.body)).toMatch(/^data=/);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it("retries once after a long pause on 429 or 504, then gives up with the status", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(504, "busy")).mockResolvedValueOnce(reply(200, { elements: [] }));
    const sleep = vi.fn(async () => {});
    await fetchBoxFromOverpass(box, { fetch: fetchMock as never, sleep });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(RETRY_PAUSE_MS);

    const twice = vi.fn().mockResolvedValue(reply(429, "slow down"));
    const err = await fetchBoxFromOverpass(box, { fetch: twice as never, sleep: vi.fn(async () => {}) }).catch((e) => e);
    expect(err).toBeInstanceOf(OverpassError);
    expect(err.status).toBe(429);
    expect(twice).toHaveBeenCalledTimes(2);
  });

  it("fails on a malformed 200 rather than returning nothing", async () => {
    const err = await fetchBoxFromOverpass(box, { fetch: vi.fn(async () => reply(200, { nope: true })) as never, sleep: vi.fn(async () => {}) }).catch((e) => e);
    expect(err).toBeInstanceOf(OverpassError);
    expect(err.message).toMatch(/malformed/);
  });

  it("pulls tiles in order with a pause between, and merges a stop seen in two tiles", async () => {
    const fetchMock = vi.fn(async () => reply(200, { elements: [node] }));
    const sleep = vi.fn(async () => {});
    const seen: number[] = [];
    const stops = await fetchCorridorFromOverpass([box, box, box], { fetch: fetchMock as never, sleep }, (i) => seen.push(i));
    expect(stops).toHaveLength(1);
    expect(seen).toEqual([1, 2, 3]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(PAUSE_MS);
  });
});
