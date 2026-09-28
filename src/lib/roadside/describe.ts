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

import { z } from "zod/v4";
import type { RoadsideStop } from "./record";
import { USER_AGENT } from "./overpass";
import { MAX_REASON_LENGTH } from "@/lib/routing/scoring";
import { clip } from "./text";
export { clip };

export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
export const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
/** wbgetentities takes up to 50 ids a request; prop=extracts up to 20 titles. */
export const WIKIDATA_BATCH = 50;
export const EXTRACT_BATCH = 20;
/**
 * Between requests. Wikimedia's API etiquette asks for one request at a time
 * from a client and a User-Agent with a contact, and it blocks agents that
 * hammer or that hide who they are; it publishes no fixed rate, so 250 ms
 * (four a second, serial) is well inside anything it has ever objected to
 * and still finishes a corridor in under two minutes. To tune: lower it
 * only with a reason, and never below the time one request takes, since
 * requests are serial anyway; raise it if a run ever sees 429.
 */
export const PAUSE_MS = 250;
/**
 * After a 429 or a 5xx, one retry after five seconds. Five is long enough
 * for a rate limit's window to pass and short enough that the person at
 * the terminal is still watching. Exactly one retry, not a loop: a second
 * failure means the service is down or we are blocked, and either way the
 * right move is to stop and read the status, not to keep asking. The run
 * is 31 requests and a minute; rerunning it is the recovery.
 */
export const RETRY_PAUSE_MS = 5_000;
/**
 * The same bound as a waypoint's reason, MAX_REASON_LENGTH in
 * src/lib/routing/scoring.ts (240), imported rather than copied so the two
 * cannot drift. Both render in the same clamped description slot on the
 * plan and today screens; a longer description there would be cut by CSS
 * mid-word where a reason would not.
 */
export const MAX_DESCRIPTION = MAX_REASON_LENGTH;
/** A stalled connection is abandoned after this long; the retry above then gets its turn. */
export const REQUEST_TIMEOUT_MS = 30_000;

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

/**
 * The sidecar `data/corridors/<name>.descriptions.json` as the script writes
 * it and the sampler reads it: one entry per described stop, every field
 * present (null when the source had nothing). `.loose()` is zod 4's name
 * for keeping keys the schema does not list (zod 3 called it
 * `.passthrough()`), so a field added to the writer later does not break
 * the reader; a field removed does, loudly, which is the point of a schema.
 */
export const StopDescriptionSchema = z
  .object({
    wikidata: z.string().nullable(),
    title: z.string().nullable(),
    url: z.string().nullable(),
    short: z.string().nullable(),
    extract: z.string().nullable(),
  })
  .loose();
export const DescriptionsFileSchema = z.object({
  name: z.string().min(1),
  describedAt: z.string().min(1),
  stops: z.number().int().nonnegative(),
  described: z.number().int().nonnegative(),
  byId: z.record(z.string(), StopDescriptionSchema),
});
export type DescriptionsFile = z.infer<typeof DescriptionsFileSchema>;

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

export interface DescribeDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

async function getJson(url: string, deps: DescribeDeps): Promise<unknown> {
  // A fresh timeout signal per try (the Overpass client learned this the hard way in #65).
  const once = () => deps.fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  // A dropped connection ("other side closed", a timeout) throws rather than
  // answering; it gets the same one retry as a 429 or a 5xx. The store's
  // describe pass died at row 60,000 of 195,000 on exactly that, 2026-09-28.
  let res: Response;
  try {
    res = await once();
  } catch (err) {
    await deps.sleep(RETRY_PAUSE_MS);
    try {
      res = await once();
    } catch {
      throw new Error(`${new URL(url).host} could not be reached twice: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
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
