import { describe, it, expect } from "vitest";
import { wikipediaTitle, parseWikidataEntities, parseExtracts, clip, describeStops, chunk, WIKIDATA_BATCH, EXTRACT_BATCH, PAUSE_MS } from "../describe";
import type { RoadsideStop } from "../record";

const stop = (i: number, extra: Partial<RoadsideStop> = {}): RoadsideStop => ({
  id: `osm:node:${i}`, name: `Stop ${i}`, lat: 35, lng: -101, kind: "attraction", source: "osm",
  reason: null, wikidata: null, wikipedia: null, ...extra,
});

describe("the Wikipedia title on a stop", () => {
  it("takes an English tag and nothing else", () => {
    expect(wikipediaTitle("en:Big Texan Steak Ranch")).toBe("Big Texan Steak Ranch");
    expect(wikipediaTitle(" en:Cadillac Ranch ")).toBe("Cadillac Ranch");
    expect(wikipediaTitle("de:Cadillac Ranch")).toBeNull();
    expect(wikipediaTitle("Cadillac Ranch")).toBeNull();
    expect(wikipediaTitle("en:")).toBeNull();
    expect(wikipediaTitle(null)).toBeNull();
  });
});

describe("parsing Wikidata entities", () => {
  it("keeps the short description and the English page, and drops a missing id", () => {
    const json = { entities: {
      Q1: { descriptions: { en: { value: "airport" } }, sitelinks: { enwiki: { title: "Some Airport" } } },
      Q2: { descriptions: {}, sitelinks: {} },
      Q3: { missing: "" },
    } };
    const m = parseWikidataEntities(json);
    expect(m.get("Q1")).toEqual({ title: "Some Airport", short: "airport" });
    expect(m.get("Q2")).toEqual({ title: null, short: null });
    expect(m.has("Q3")).toBe(false);
    expect(parseWikidataEntities(null).size).toBe(0);
  });
});

describe("parsing Wikipedia extracts", () => {
  const json = { query: {
    normalized: [{ from: "cadillac_Ranch", to: "Cadillac Ranch" }],
    redirects: [{ from: "Cadillac Ranch", to: "Cadillac Ranch (Amarillo)" }],
    pages: [
      { pageid: 1, title: "Cadillac Ranch (Amarillo)", extract: "Cadillac Ranch is a public art installation. It was created in 1974.", description: "Art installation in Texas", fullurl: "https://en.wikipedia.org/wiki/Cadillac_Ranch" },
      { pageid: 2, title: "Big Texan Steak Ranch", extract: "The Big Texan is a steakhouse.", fullurl: "https://en.wikipedia.org/wiki/Big_Texan_Steak_Ranch" },
      { title: "Nowhere Place", missing: true, fullurl: "https://en.wikipedia.org/wiki/Nowhere_Place" },
    ],
  } };

  it("keys each page by the title that was asked for, following normalized and redirects", () => {
    const m = parseExtracts(json);
    expect(m.get("cadillac_Ranch")?.title).toBe("Cadillac Ranch (Amarillo)");
    expect(m.get("cadillac_Ranch")?.extract).toContain("public art installation");
    expect(m.get("cadillac_Ranch")?.description).toBe("Art installation in Texas");
    expect(m.get("Big Texan Steak Ranch")?.url).toBe("https://en.wikipedia.org/wiki/Big_Texan_Steak_Ranch");
    expect(m.get("Big Texan Steak Ranch")?.description).toBeNull();
    expect(m.has("Nowhere Place")).toBe(false);
  });

  it("returns nothing, not a crash, for a malformed body", () => {
    expect(parseExtracts(null).size).toBe(0);
    expect(parseExtracts({ query: { pages: "nope", normalized: 3 } }).size).toBe(0);
    expect(parseExtracts({ query: { pages: [{ title: 5 }, { extract: "no title" }] } }).size).toBe(0);
    expect(parseWikidataEntities({ entities: "nope" }).size).toBe(0);
  });
});

describe("clipping a description", () => {
  it("leaves a short one alone and collapses whitespace", () => {
    expect(clip("  A place.\n\nWith  space.  ")).toBe("A place. With space.");
  });
  it("cuts a long one at the last sentence end, or at a word with an ellipsis when no sentence end is late enough", () => {
    const two = "The first sentence is here and long enough. " + "x".repeat(300);
    expect(clip(two, 100)).toBe("The first sentence is here and long enough.");
    const words = ("word ".repeat(100)).trim();
    const c = clip(words, 50);
    expect(c.endsWith("…")).toBe(true);
    expect(c.length).toBeLessThanOrEqual(51);
    expect(c.slice(0, -1).endsWith("word")).toBe(true);
    // A sentence end too early (under a quarter of max) is not used.
    const early = "Hi. " + "y".repeat(300);
    expect(clip(early, 100).endsWith("…")).toBe(true);
  });
});

describe("describing a corridor", () => {
  /** A fake Wikimedia: every Q gets a description, Q even numbers get a page; every asked title gets an extract. */
  function fakeFetch(calls: string[]) {
    return async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      calls.push(url.host);
      if (url.host === "www.wikidata.org") {
        const ids = (url.searchParams.get("ids") ?? "").split("|");
        const entities: Record<string, unknown> = {};
        for (const q of ids) {
          const n = Number(q.slice(1));
          entities[q] = { descriptions: { en: { value: `thing ${n}` } }, sitelinks: n % 2 === 0 ? { enwiki: { title: `Page ${n}` } } : {} };
        }
        return new Response(JSON.stringify({ entities }), { status: 200 });
      }
      const titles = (url.searchParams.get("titles") ?? "").split("|");
      return new Response(JSON.stringify({ query: { pages: titles.map((t) => ({ title: t, extract: `About ${t}. More.`, fullurl: `https://en.wikipedia.org/wiki/${t.replace(/ /g, "_")}` })) } }), { status: 200 });
    };
  }

  it("batches Wikidata by 50 and Wikipedia by 20, pauses between requests, and fills each stop from both", async () => {
    const stops: RoadsideStop[] = [];
    for (let i = 1; i <= 55; i++) stops.push(stop(i, { wikidata: `Q${i}` }));
    stops.push(stop(100, { wikipedia: "en:Tagged Page" })); // a page from the tag, no Wikidata
    stops.push(stop(101)); // nothing to describe
    const calls: string[] = [];
    const sleeps: number[] = [];
    const seen: Array<[number, number]> = [];
    const out = await describeStops(stops, { fetch: fakeFetch(calls), sleep: async (ms) => { sleeps.push(ms); } }, (d, t) => seen.push([d, t]));
    // 55 ids -> 2 Wikidata requests; 27 even Qs + 1 tagged title = 28 titles -> 2 extract requests.
    expect(calls.filter((h) => h === "www.wikidata.org")).toHaveLength(Math.ceil(55 / WIKIDATA_BATCH));
    expect(calls.filter((h) => h === "en.wikipedia.org")).toHaveLength(Math.ceil(28 / EXTRACT_BATCH));
    expect(sleeps).toEqual([PAUSE_MS, PAUSE_MS, PAUSE_MS]);
    expect(seen.at(-1)).toEqual([4, 4]);
    expect(out.get("osm:node:2")).toEqual({ wikidata: "Q2", title: "Page 2", url: "https://en.wikipedia.org/wiki/Page_2", short: "thing 2", extract: "About Page 2. More." });
    expect(out.get("osm:node:3")).toEqual({ wikidata: "Q3", title: null, url: null, short: "thing 3", extract: null });
    expect(out.get("osm:node:100")?.extract).toBe("About Tagged Page. More.");
    expect(out.has("osm:node:101")).toBe(false);
  });

  it("chunks evenly and keeps order", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
