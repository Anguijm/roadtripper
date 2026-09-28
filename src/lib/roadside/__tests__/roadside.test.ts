import { describe, it, expect, vi } from "vitest";
import { fromOsmElement, kindFromTags, wikidataId, RoadsideStopSchema, type OsmElement } from "../record";
import { corridorTiles, paddedBox, withinCorridor } from "../corridor";
import { fetchBoxFromOverpass, fetchCorridorFromOverpass, overpassQuery, OverpassError, PAUSE_MS, RETRY_PAUSES_MS, USER_AGENT } from "../overpass";
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
      reason: null,
      detail: null, wikidata: "Q1025849", wikipedia: "en:Cadillac Ranch",
    });
    expect(RoadsideStopSchema.safeParse(s).success).toBe(true);
  });

  it("uses the node's own position, and the centre for a way or relation", () => {
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { historic: "monument", name: "X" } })?.lat).toBe(1);
    expect(fromOsmElement({ type: "relation", id: 1, center: { lat: 3, lon: 4 }, tags: { historic: "castle", name: "Y" } })?.lng).toBe(4);
    expect(fromOsmElement({ type: "node", id: 2, lat: 1, lon: 2, tags: { historic: "yes", name: "A house" } })).toBeNull();
  });

  it("refuses an element with no name, no position, or none of our kinds", () => {
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { tourism: "attraction" } })).toBeNull();
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { tourism: "attraction", name: "   " } })).toBeNull();
    expect(fromOsmElement({ type: "way", id: 1, tags: { tourism: "attraction", name: "No centre" } })).toBeNull();
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { amenity: "fuel", name: "A gas station" } })).toBeNull();
  });

  it("pulls the historic things people stop for and not the registered houses (step 19)", () => {
    // Real tag sets from the first ten tiles of Amarillo to Austin.
    expect(kindFromTags({ historic: "building", name: "Clarence and Lorraine Eakle House" })).toBeNull();
    expect(kindFromTags({ historic: "church", name: "First Baptist Church of Plainview" })).toBeNull();
    expect(kindFromTags({ historic: "yes", name: "Slaton Bakery" })).toBeNull();
    expect(kindFromTags({ historic: "district", name: "Arts District" })).toBeNull();
    expect(kindFromTags({ historic: "monument", name: "Helium Monument" })).toBe("historic");
    expect(kindFromTags({ historic: "locomotive", name: "Madam Queen" })).toBe("historic");
    expect(kindFromTags({ historic: "aircraft", name: "Douglas C-47 Skytrain" })).toBe("historic");
    // a memorial that is a plaque is a roadside marker, not a stop
    expect(kindFromTags({ historic: "memorial", memorial: "plaque", name: "Site of the First Courthouse" })).toBeNull();
    expect(kindFromTags({ historic: "memorial", memorial: "statue", name: "Buddy Holly Statue" })).toBe("historic");
    expect(kindFromTags({ historic: "memorial", name: "Texas Panhandle War Memorial" })).toBe("historic");
  });

  it("pulls observation towers and not radio masts", () => {
    expect(kindFromTags({ man_made: "tower", "tower:type": "communication", name: "KFDA-TV (Amarillo)" })).toBeNull();
    expect(kindFromTags({ man_made: "tower", name: "KQIZ-FM (Amarillo)" })).toBeNull();
    expect(kindFromTags({ man_made: "tower", "tower:type": "observation", name: "Enchanted Rock Overlook Tower" })).toBe("tower");
  });

  it("pulls parks, and anything named on Wikidata that no other kind claims, except the things that are not stops", () => {
    expect(kindFromTags({ boundary: "protected_area", name: "Palo Duro Canyon State Park", wikidata: "Q2047283" })).toBe("park");
    expect(kindFromTags({ leisure: "nature_reserve", name: "Buffalo Lake" })).toBe("park");
    expect(kindFromTags({ amenity: "restaurant", name: "The Big Texan Steak Ranch", wikidata: "Q4904873" })).toBe("notable");
    expect(kindFromTags({ amenity: "restaurant", name: "Some Diner" })).toBeNull();
    const notStops: Record<string, string>[] = [
      { place: "city", name: "Amarillo", wikidata: "Q49262" },
      { highway: "primary", name: "Route 66", wikidata: "Q1005" },
      { waterway: "river", name: "Brazos River", wikidata: "Q1085628" },
      { boundary: "administrative", admin_level: "6", name: "Potter County", wikidata: "Q26786" },
      { landuse: "farmland", name: "XIT Ranch", wikidata: "Q7999999" },
    ];
    for (const notAStop of notStops) expect(kindFromTags(notAStop)).toBeNull();
    // tourism still wins over notable
    expect(kindFromTags({ tourism: "attraction", amenity: "restaurant", name: "Cadillac Ranch", wikidata: "Q254602" })).toBe("attraction");
  });

  it("reads the Q-id out of the forms the wikidata tag actually takes", () => {
    expect(wikidataId("Q254602")).toBe("Q254602");
    expect(wikidataId("https://www.wikidata.org/wiki/Q254602")).toBe("Q254602");
    expect(wikidataId("Q254602;Q2112754")).toBe("Q254602");
    expect(wikidataId(" q254602 ")).toBe("Q254602");
    expect(wikidataId("not-a-qid")).toBeNull();
    expect(wikidataId(undefined)).toBeNull();
    expect(fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { tourism: "museum", name: "M", wikidata: "https://www.wikidata.org/wiki/Q42" } })?.wikidata).toBe("Q42");
  });

  it("maps tags to kinds, tourism first, and drops a malformed wikidata id", () => {
    expect(kindFromTags({ tourism: "viewpoint", historic: "monument" })).toBe("viewpoint");
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
    expect(q).toContain('["historic"~"^(monument|memorial|');
    expect(q).not.toContain('["historic"]["name"]');
    expect(q).toContain('["man_made"="tower"]["tower:type"="observation"]');
    expect(q).toContain('["boundary"~"^(national_park|protected_area)$"]');
    expect(q).toContain('["wikidata"]["name"]');
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

  it("retries with growing pauses on 429 or 504, at most three times, then gives up with the status", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(504, "busy")).mockResolvedValueOnce(reply(200, { elements: [] }));
    const sleep = vi.fn(async () => {});
    await fetchBoxFromOverpass(box, { fetch: fetchMock as never, sleep });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(RETRY_PAUSES_MS[0]);

    const always = vi.fn().mockResolvedValue(reply(429, "slow down"));
    const pauses: number[] = [];
    const err = await fetchBoxFromOverpass(box, { fetch: always as never, sleep: vi.fn(async (ms: number) => { pauses.push(ms); }) }).catch((e) => e);
    expect(err).toBeInstanceOf(OverpassError);
    expect(err.status).toBe(429);
    expect(always).toHaveBeenCalledTimes(1 + RETRY_PAUSES_MS.length);
    expect(pauses).toEqual([...RETRY_PAUSES_MS]);
  });

  it("also retries 502 and 503, the gateway and overload answers", async () => {
    for (const status of [502, 503]) {
      const once = vi.fn().mockResolvedValueOnce(reply(status, "later")).mockResolvedValueOnce(reply(200, { elements: [] }));
      await fetchBoxFromOverpass(box, { fetch: once as never, sleep: vi.fn(async () => {}) });
      expect(once).toHaveBeenCalledTimes(2);
    }
    // a 400 is our fault and is not retried
    const bad = vi.fn().mockResolvedValue(reply(400, "bad query"));
    await expect(fetchBoxFromOverpass(box, { fetch: bad as never, sleep: vi.fn(async () => {}) })).rejects.toBeInstanceOf(OverpassError);
    expect(bad).toHaveBeenCalledTimes(1);
  });

  it("treats a client-side timeout like a 504: retried on the same schedule, then reported as a timeout", async () => {
    const timeout = () => { const e = new Error("The operation timed out."); e.name = "TimeoutError"; return Promise.reject(e); };
    const once = vi.fn().mockImplementationOnce(timeout).mockResolvedValueOnce(reply(200, { elements: [] }));
    const sleep = vi.fn(async () => {});
    await fetchBoxFromOverpass(box, { fetch: once as never, sleep });
    expect(once).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(RETRY_PAUSES_MS[0]);

    const always = vi.fn().mockImplementation(timeout);
    const err = await fetchBoxFromOverpass(box, { fetch: always as never, sleep: vi.fn(async () => {}) }).catch((e) => e);
    expect(err).toBeInstanceOf(OverpassError);
    expect(err.message).toMatch(/timed out/);
    expect(always).toHaveBeenCalledTimes(1 + RETRY_PAUSES_MS.length);

    // a cancellation is not a timeout: it is thrown as it is, no retry
    const controller = new AbortController();
    const aborted = vi.fn(async () => { controller.abort(); const e = new Error("aborted"); e.name = "AbortError"; throw e; });
    const cancelled = await fetchBoxFromOverpass(box, { fetch: aborted as never, sleep: vi.fn(async () => {}), signal: controller.signal }).catch((e) => e);
    expect(cancelled.name).toBe("AbortError");
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it("gives every retry a fresh, unaborted timeout signal", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(async (_u: RequestInfo | URL, i?: RequestInit) => {
      signals.push(i!.signal as AbortSignal);
      if (signals.length < 3) return reply(504, "busy");
      return reply(200, { elements: [] });
    });
    await fetchBoxFromOverpass(box, { fetch: fetchMock as never, sleep: vi.fn(async () => {}) });
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);            // a different signal each try
    for (const s of signals) expect(s.aborted).toBe(false);  // none of them already fired
  });

  it("can be pointed at another instance", async () => {
    let url: string | undefined;
    const fetchMock = vi.fn(async (u: RequestInfo | URL) => { url = String(u); return reply(200, { elements: [] }); });
    await fetchBoxFromOverpass(box, { fetch: fetchMock as never, sleep: vi.fn(async () => {}), url: "https://example.test/api" });
    expect(url).toBe("https://example.test/api");
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

  it("resumes: tiles already held are not fetched again, and a failure names its tile", async () => {
    const other = { ...node, id: 8, tags: { ...node.tags, name: "Palo Duro Canyon" } };
    const held = new Map<number, ReturnType<typeof fromOsmElement>[]>();
    // First run: tile 3 fails after the retries; tiles 1 and 2 were reported and kept by the caller.
    let calls = 0;
    const failing = vi.fn(async () => (++calls <= 2 ? reply(200, { elements: [node] }) : reply(504, "busy")));
    const quiet = { sleep: vi.fn(async () => {}) };
    const err = await fetchCorridorFromOverpass([box, box, box], { fetch: failing as never, ...quiet }, (i, _n, stops) => held.set(i - 1, stops)).catch((e) => e);
    expect(err).toBeInstanceOf(OverpassError);
    expect(err.message).toMatch(/tile 3 of 3/);
    expect(held.size).toBe(2);
    // Second run, with what the first run held: only tile 3 is fetched, with
    // no pause first, since nothing was fetched before it in this run.
    const second = vi.fn(async () => reply(200, { elements: [other] }));
    const sleep2 = vi.fn(async () => {});
    const stops = await fetchCorridorFromOverpass([box, box, box], { fetch: second as never, sleep: sleep2 }, undefined, held as never);
    expect(second).toHaveBeenCalledTimes(1);
    expect(stops.map((s) => s.name).sort()).toEqual(["Big Texan", "Palo Duro Canyon"]);
    expect(sleep2).not.toHaveBeenCalled();
  });
});

describe("cancelling a pull", () => {
  it("stops between tiles once the signal is aborted, and passes the signal to fetch", async () => {
    const controller = new AbortController();
    let signalSeen: AbortSignal | null | undefined;
    const fetchMock = vi.fn(async (_u: RequestInfo | URL, i?: RequestInit) => {
      signalSeen = i?.signal;
      controller.abort();  // cancel after the first tile answers
      return reply(200, { elements: [node] });
    });
    const err = await fetchCorridorFromOverpass([box, box, box], { fetch: fetchMock as never, sleep: vi.fn(async () => {}), signal: controller.signal }).catch((e) => e);
    expect(err).toBeInstanceOf(OverpassError);
    expect(err.message).toMatch(/cancelled/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signalSeen).toBeInstanceOf(AbortSignal);
  });
});

describe("what the tags say about a place (detail)", () => {
  const at = (tags: Record<string, string>) => fromOsmElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "X", ...tags } })?.detail;

  it("takes the mapper's description first, then the inscription, then the subtype, and reads underscores as spaces", () => {
    // Spirit Rock, node 12119451158, as the corridor pull saw it.
    expect(at({ tourism: "attraction", description: "A large boulder in the center of a circular garden." })).toBe("A large boulder in the center of a circular garden.");
    expect(at({ tourism: "attraction", "description:en": "  English wins over nothing  " })).toBe("English wins over nothing");
    expect(at({ historic: "memorial", inscription: "To those who served" })).toBe("To those who served");
    expect(at({ historic: "memorial", memorial: "war_memorial" })).toBe("war memorial");
    expect(at({ tourism: "artwork", artwork_type: "mural" })).toBe("mural");
    expect(at({ tourism: "museum", museum: "history;railway" })).toBe("history, railway");
  });

  it("says what a Wikidata-only place is, and nothing when the tags say nothing beyond the kind", () => {
    expect(at({ wikidata: "Q1", amenity: "school", building: "yes" })).toBe("school");
    expect(at({ wikidata: "Q1", building: "hotel" })).toBe("hotel");
    expect(at({ wikidata: "Q1", building: "yes" })).toBeNull();
    expect(at({ tourism: "attraction" })).toBeNull();
    expect(at({ tourism: "artwork", artwork_type: "yes" })).toBeNull();
  });

  it("clips a long description at a word, never mid-word, within the reason bound", () => {
    const long = "word ".repeat(100).trim();
    const d = at({ tourism: "attraction", description: long })!;
    expect(d.length).toBeLessThanOrEqual(240);
    expect(d.endsWith("…")).toBe(true);
    expect(d.slice(0, -1).endsWith("word")).toBe(true);
  });
});
