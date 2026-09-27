import { describe, it, expect, vi, afterEach } from "vitest";
import { openRouteService, googleRoutes, ProviderError } from "../routing-providers.mjs";

const A = { id: "a", lat: 35.22, lng: -101.83 };
const B = { id: "b", lat: 35.08, lng: -106.65 };
const C = { id: "c", lat: 36.17, lng: -115.14 };

const reply = (status, body) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  });

afterEach(() => vi.unstubAllGlobals());

describe("openRouteService.durationsMatrix", () => {
  it("places sources first, destinations after, and maps the grid back by index", async () => {
    let sent;
    vi.stubGlobal("fetch", (_url, init) => {
      sent = JSON.parse(init.body);
      return reply(200, {
        durations: [[600, null], [1200, 1800]],
        distances: [[10000, null], [20000, 30000]],
      });
    });
    const grid = await openRouteService("k").durationsMatrix([A, B], [B, C]);
    expect(sent.locations).toEqual([[A.lng, A.lat], [B.lng, B.lat], [B.lng, B.lat], [C.lng, C.lat]]);
    expect(sent.sources).toEqual([0, 1]);
    expect(sent.destinations).toEqual([2, 3]);
    expect(grid).toEqual([
      [{ minutes: 10, meters: 10000 }, null],
      [{ minutes: 20, meters: 20000 }, { minutes: 30, meters: 30000 }],
    ]);
  });

  it("keeps the HTTP status on failure so the build can tell quota from a bad request", async () => {
    vi.stubGlobal("fetch", () => reply(403, { error: "Quota exceeded" }));
    const err = await openRouteService("k").durationsMatrix([A], [B]).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/Quota exceeded/);
  });

  it("durationsFromOne is the first row of a one-source matrix", async () => {
    vi.stubGlobal("fetch", () => reply(200, { durations: [[60, 120]], distances: [[1, 2]] }));
    const row = await openRouteService("k").durationsFromOne(A, [B, C]);
    expect(row).toEqual([{ minutes: 1, meters: 1 }, { minutes: 2, meters: 2 }]);
  });

  it("caps at 3,500 pairs per request and paces 1.5 s regardless of size", () => {
    const p = openRouteService("k");
    expect(p.maxRoutesPerRequest).toBe(3500);
    expect(p.pauseAfter(1)).toBe(1500);
    expect(p.pauseAfter(3500)).toBe(1500);
  });
});

describe("googleRoutes.durationsMatrix", () => {
  it("fills the grid from originIndex/destinationIndex and ignores what it cannot trust", async () => {
    vi.stubGlobal("fetch", () =>
      reply(200, [
        { originIndex: 0, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "600s", distanceMeters: 10000 },
        { originIndex: 1, destinationIndex: 1, condition: "ROUTE_EXISTS", duration: "1800s", distanceMeters: 30000 },
        null,                                                                                   // must not crash
        { originIndex: 0, destinationIndex: 1, condition: "ROUTE_NOT_FOUND" },                  // stays null
        { originIndex: 7, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "1s" },      // out of range
        { originIndex: 1, destinationIndex: 0, condition: "ROUTE_EXISTS", duration: "nonsense" }, // unparsable
      ])
    );
    const grid = await googleRoutes("k").durationsMatrix([A, B], [B, C]);
    expect(grid).toEqual([
      [{ minutes: 10, meters: 10000 }, null],
      [null, { minutes: 30, meters: 30000 }],
    ]);
  });

  it("sends no routingPreference, which keeps it on the Essentials SKU", async () => {
    let sent;
    vi.stubGlobal("fetch", (_url, init) => { sent = JSON.parse(init.body); return reply(200, []); });
    await googleRoutes("k").durationsMatrix([A], [B]);
    expect(sent.routingPreference).toBeUndefined();
    expect(sent.origins).toHaveLength(1);
    expect(sent.destinations).toHaveLength(1);
  });

  it("caps at 625 elements and paces to 3,000 elements a minute", () => {
    const p = googleRoutes("k");
    expect(p.maxRoutesPerRequest).toBe(625);
    expect(p.pauseAfter(1)).toBe(120);      // the floor
    expect(p.pauseAfter(625)).toBe(12500);  // 625 x 20 ms
  });
});

describe("malformed 200s and timeouts", () => {
  it("ORS: a 200 without a durations grid throws instead of writing an all-null grid", async () => {
    vi.stubGlobal("fetch", () => reply(200, { info: "ok but empty" }));
    const err = await openRouteService("k").durationsMatrix([A], [B]).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(200);
    expect(err.message).toMatch(/malformed/);
  });

  it("Google: a 200 that is not an element array throws", async () => {
    vi.stubGlobal("fetch", () => reply(200, { error: { message: "nope" } }));
    const err = await googleRoutes("k").durationsMatrix([A], [B]).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(200);
    expect(err.message).toMatch(/malformed/);
  });

  it("both providers send an abort signal so a hung connection cannot hold the run", async () => {
    const signals = [];
    vi.stubGlobal("fetch", (_url, init) => { signals.push(init.signal); return reply(200, []); });
    await googleRoutes("k").durationsMatrix([A], [B]);
    vi.stubGlobal("fetch", (_url, init) => { signals.push(init.signal); return reply(200, { durations: [[1]] }); });
    await openRouteService("k").durationsMatrix([A], [B]);
    expect(signals).toHaveLength(2);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });
});
