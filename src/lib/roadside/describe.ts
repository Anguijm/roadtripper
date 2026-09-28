/**
 * A line about each stop, from the two free encyclopedias (step 20, moved
 * ahead of the labels).
 *
 * A name and a kind are not enough to judge a place by; John said so
 * looking at the first sheet, and the model has the same problem. Every
 * stop with a Wikidata id can reach Wikidata's short description ("roller
 * coaster", "airport") and, where an English Wikipedia page exists, its
 * first two sentences. Both come through the MediaWiki APIs, batched and
 * paced. Pure parsers here; the script (scripts/describe-corridor.ts) does
 * the reading and writing.
 */

import type { RoadsideStop } from "./record";
import { USER_AGENT } from "./overpass";

export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
export const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
/** wbgetentities takes up to 50 ids a request; prop=extracts up to 20 titles. */
export const WIKIDATA_BATCH = 50;
export const EXTRACT_BATCH = 20;
/** Between requests. Wikimedia asks for serial requests and a contact; 250 ms is four a second, serial. */
export const PAUSE_MS = 250;
/** After a 429 or a 5xx, one retry after this long. */
export const RETRY_PAUSE_MS = 5_000;
/** Same bound as a rendered reason (MAX_REASON_LENGTH), so a description never runs longer on screen than a waypoint's. */
export const MAX_DESCRIPTION = 240;

export interface StopDescription {
  wikidata: string | null;
  /** English Wikipedia page title, from the OSM tag or the Wikidata sitelink. */
  title: string | null;
  url: string | null;
  /** Wikidata's short description, a few words. */
  short: string | null;
  /** The page's opening, clipped. */
  extract: string | null;
}

/** "en:Big Texan Steak Ranch" -> "Big Texan Steak Ranch". Other languages and bare values are not English pages. */
export function wikipediaTitle(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const m = /^en:(.+)$/.exec(tag.trim());
  const title = m?.[1]?.trim();
  return title ? title : null;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function wikidataUrl(ids: readonly string[]): string {
  const q = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "descriptions|sitelinks",
    languages: "en",
    sitefilter: "enwiki",
    format: "json",
  });
  return `${WIKIDATA_API}?${q}`;
}

/** Entities that exist, with their English page title and short description; missing ids are left out. */
export function parseWikidataEntities(json: unknown): Map<string, { title: string | null; short: string | null }> {
  const out = new Map<string, { title: string | null; short: string | null }>();
  const entities = (json as { entities?: Record<string, unknown> } | null)?.entities;
  if (!entities || typeof entities !== "object") return out;
  for (const [id, raw] of Object.entries(entities)) {
    const e = raw as { missing?: unknown; descriptions?: { en?: { value?: unknown } }; sitelinks?: { enwiki?: { title?: unknown } } };
    if (e.missing !== undefined) continue;
    const short = typeof e.descriptions?.en?.value === "string" ? e.descriptions.en.value : null;
    const title = typeof e.sitelinks?.enwiki?.title === "string" ? e.sitelinks.enwiki.title : null;
    out.set(id, { title, short });
  }
  return out;
}

export function extractsUrl(titles: readonly string[]): string {
  const q = new URLSearchParams({
    action: "query",
    prop: "extracts|description|info",
    inprop: "url",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    redirects: "1",
    titles: titles.join("|"),
    format: "json",
    formatversion: "2",
  });
  return `${WIKIPEDIA_API}?${q}`;
}

export interface PageExtract {
  title: string;
  extract: string | null;
  description: string | null;
  url: string | null;
}

/**
 * Pages keyed by the title we asked for. MediaWiki answers under the
 * canonical title, and says how it got there in `normalized` (case and
 * underscores) and `redirects` (one page pointing at another); both are
 * followed back so "Cadillac_ranch" finds the answer filed under
 * "Cadillac Ranch". Missing pages are left out.
 */
export function parseExtracts(json: unknown): Map<string, PageExtract> {
  const out = new Map<string, PageExtract>();
  const query = (json as { query?: { normalized?: unknown; redirects?: unknown; pages?: unknown } } | null)?.query;
  if (!query) return out;
  const byTitle = new Map<string, PageExtract>();
  for (const raw of Array.isArray(query.pages) ? query.pages : []) {
    const p = raw as { title?: unknown; missing?: unknown; extract?: unknown; description?: unknown; fullurl?: unknown };
    if (typeof p.title !== "string" || p.missing) continue;
    byTitle.set(p.title, {
      title: p.title,
      extract: typeof p.extract === "string" && p.extract.trim() ? p.extract : null,
      description: typeof p.description === "string" && p.description.trim() ? p.description : null,
      url: typeof p.fullurl === "string" ? p.fullurl : null,
    });
  }
  // Requested title -> canonical title, following normalized then redirects.
  const step = (list: unknown): Map<string, string> => {
    const m = new Map<string, string>();
    for (const raw of Array.isArray(list) ? list : []) {
      const r = raw as { from?: unknown; to?: unknown };
      if (typeof r.from === "string" && typeof r.to === "string") m.set(r.from, r.to);
    }
    return m;
  };
  const normalized = step(query.normalized);
  const redirects = step(query.redirects);
  const asked = new Set<string>([...normalized.keys(), ...redirects.keys(), ...byTitle.keys()]);
  for (const from of asked) {
    let t = normalized.get(from) ?? from;
    t = redirects.get(t) ?? t;
    const page = byTitle.get(t);
    if (page) out.set(from, page);
  }
  return out;
}

/**
 * At most `max` characters, whitespace collapsed. A long text is cut at the
 * last sentence end that leaves at least a quarter of `max`, else at a word
 * boundary with an ellipsis, so a description never ends mid-word.
 */
export function clip(text: string, max = MAX_DESCRIPTION): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd >= max / 4) return head.slice(0, sentenceEnd + 1);
  const space = head.lastIndexOf(" ");
  return (space > 0 ? head.slice(0, space) : head.slice(0, max - 1)).replace(/[\s,;:.]+$/, "") + "…";
}

export interface DescribeDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

async function getJson(url: string, deps: DescribeDeps): Promise<unknown> {
  const once = () => deps.fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  let res = await once();
  if (res.status === 429 || res.status >= 500) {
    await deps.sleep(RETRY_PAUSE_MS);
    res = await once();
  }
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

/**
 * Describe every stop that can be: Wikidata for all with an id (short
 * description and, where present, the English page title), then Wikipedia
 * for every title, from the tag or the sitelink. Returns one entry per stop
 * that has at least a Wikidata id or a title. `onRequest` counts requests
 * for the script's progress line.
 */
export async function describeStops(
  stops: readonly RoadsideStop[],
  deps: DescribeDeps,
  onRequest?: (done: number, total: number) => void
): Promise<Map<string, StopDescription>> {
  const out = new Map<string, StopDescription>();
  const titles = new Map<string, string>(); // stop id -> title
  const qids = new Map<string, string[]>(); // Q -> stop ids (two stops can share a Q)
  for (const s of stops) {
    const t = wikipediaTitle(s.wikipedia);
    if (t) titles.set(s.id, t);
    if (s.wikidata) {
      const ids = qids.get(s.wikidata) ?? [];
      ids.push(s.id);
      qids.set(s.wikidata, ids);
    }
    if (t || s.wikidata) out.set(s.id, { wikidata: s.wikidata, title: t, url: null, short: null, extract: null });
  }
  const qBatches = chunk([...qids.keys()], WIKIDATA_BATCH);
  // Titles are known only after Wikidata answers, so the total is an estimate refined as we go.
  let total = qBatches.length + Math.ceil(titles.size / EXTRACT_BATCH);
  let done = 0;
  const tick = () => onRequest?.(++done, total);

  for (const batch of qBatches) {
    if (done > 0) await deps.sleep(PAUSE_MS);
    const entities = parseWikidataEntities(await getJson(wikidataUrl(batch), deps));
    tick();
    for (const [q, e] of entities) {
      for (const id of qids.get(q) ?? []) {
        const d = out.get(id)!;
        d.short = e.short;
        if (!d.title && e.title) {
          d.title = e.title;
          titles.set(id, e.title);
        }
      }
    }
  }

  const byTitle = new Map<string, string[]>();
  for (const [id, t] of titles) byTitle.set(t, [...(byTitle.get(t) ?? []), id]);
  const tBatches = chunk([...byTitle.keys()], EXTRACT_BATCH);
  total = qBatches.length + tBatches.length;
  for (const batch of tBatches) {
    if (done > 0) await deps.sleep(PAUSE_MS);
    const pages = parseExtracts(await getJson(extractsUrl(batch), deps));
    tick();
    for (const t of batch) {
      const page = pages.get(t);
      if (!page) continue;
      for (const id of byTitle.get(t) ?? []) {
        const d = out.get(id)!;
        d.url = page.url;
        d.extract = page.extract ? clip(page.extract) : null;
        // Wikipedia's short description fills in where Wikidata had none.
        if (!d.short && page.description) d.short = page.description;
      }
    }
  }
  return out;
}
