import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { planRequests, splitRequest, neighboursWithin } from "../matrix-plan.mjs";

const city = (id, lat, lng) => ({ id, name: id, lat, lng });

/** Every pair the plan asked for, as "from|to". */
const wantedPairs = (plan) =>
  new Set(plan.flatMap((p) => p.neighbours.map((n) => `${p.city.id}|${n.id}`)));

/** Every pair the requests promise to answer, as "from|to", with duplicates counted. */
const promisedPairs = (requests) => requests.flatMap((r) => [...r.pairs]);

describe("planRequests", () => {
  // Four cities in a line along one longitude band; each needs its neighbours.
  const a = city("a", 30, -100), b = city("b", 31, -100), c = city("c", 32, -100), d = city("d", 33, -100);
  const plan = [
    { city: a, neighbours: [b, c] },
    { city: b, neighbours: [a, c, d] },
    { city: c, neighbours: [a, b, d] },
    { city: d, neighbours: [b, c] },
  ];

  it("covers every wanted pair exactly once and never exceeds the cap", () => {
    const reqs = planRequests(plan, 12);
    const promised = promisedPairs(reqs);
    expect(new Set(promised)).toEqual(wantedPairs(plan));
    expect(promised.length).toBe(wantedPairs(plan).size);
    for (const r of reqs) expect(r.sources.length * r.destinations.length).toBeLessThanOrEqual(12);
  });

  it("groups neighbouring origins into one request when the cap allows", () => {
    // 4 sources x 4 destinations = 16 fits under 20: one request for the lot.
    expect(planRequests(plan, 20)).toHaveLength(1);
    // Under a cap of 1, nothing can share a request: one pair per request.
    expect(planRequests(plan, 1)).toHaveLength(wantedPairs(plan).size);
  });

  it("splits an origin whose own neighbours exceed the cap", () => {
    const hub = city("hub", 40, -90);
    const spokes = Array.from({ length: 7 }, (_, i) => city(`s${i}`, 40 + i, -90));
    const reqs = planRequests([{ city: hub, neighbours: spokes }], 3);
    expect(reqs).toHaveLength(3);  // 3 + 3 + 1
    expect(new Set(promisedPairs(reqs)).size).toBe(7);
  });

  it("skips origins with nothing left to fetch and rejects a bad cap", () => {
    expect(planRequests([{ city: a, neighbours: [] }], 100)).toEqual([]);
    expect(() => planRequests(plan, 0)).toThrow(/positive integer/);
  });

  it("keeps only wanted pairs in `pairs` even when a request computes extras", () => {
    // b needs d but a does not; grouping a and b makes a->d a computed extra
    // that must not be promised.
    const reqs = planRequests([{ city: a, neighbours: [b] }, { city: b, neighbours: [d] }], 4);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].pairs.has("a|d")).toBe(false);
    expect(reqs[0].pairs.has("a|b")).toBe(true);
    expect(reqs[0].pairs.has("b|d")).toBe(true);
  });
});

describe("planRequests on the real atlas", () => {
  const db = new Database("data/atlas.sqlite", { readonly: true, fileMustExist: true });
  const cities = db.prepare(
    `select id, name, lat, lng from cities where lat between 24 and 50 and lng between -125 and -66`
  ).all();
  db.close();
  const plan = cities.map((c) => ({ city: c, neighbours: neighboursWithin(c, cities, 650) }));
  const wanted = wantedPairs(plan);

  it("needs about a dozen ORS requests for the whole US graph, not one per city", () => {
    // This is the whole point. One request per origin was `plan.length`
    // requests (191 on 2026-09-27) and emptied the free day after 13 of them.
    const reqs = planRequests(plan, 3500);
    expect(wanted.size).toBeGreaterThan(5000);
    expect(reqs.length).toBeLessThanOrEqual(15);
    expect(reqs.length).toBeLessThan(plan.length / 10);
    const promised = promisedPairs(reqs);
    expect(new Set(promised)).toEqual(wanted);
    expect(promised.length).toBe(wanted.size);
    for (const r of reqs) expect(r.sources.length * r.destinations.length).toBeLessThanOrEqual(3500);
  });

  it("fits Google's 625-element cap in well under a hundred requests", () => {
    const reqs = planRequests(plan, 625);
    expect(reqs.length).toBeLessThan(100);
    expect(new Set(promisedPairs(reqs))).toEqual(wanted);
    for (const r of reqs) expect(r.sources.length * r.destinations.length).toBeLessThanOrEqual(625);
  });
});

describe("splitRequest", () => {
  const a = city("a", 30, -100), b = city("b", 31, -100), c = city("c", 32, -100), d = city("d", 33, -100);
  const plan = [
    { city: a, neighbours: [b, c] },
    { city: b, neighbours: [a, c, d] },
    { city: c, neighbours: [a, b, d] },
    { city: d, neighbours: [b, c] },
  ];

  it("carries forward exactly the promised pairs, split across two halves", () => {
    const [whole] = planRequests(plan, 20);
    expect(whole.sources).toHaveLength(4);
    const halves = splitRequest(whole, 20);
    expect(halves.length).toBeGreaterThanOrEqual(2);
    const promised = halves.flatMap((r) => [...r.pairs]);
    expect(new Set(promised)).toEqual(whole.pairs);
    expect(promised.length).toBe(whole.pairs.size);
    for (const r of halves) expect(r.sources.length * r.destinations.length).toBeLessThanOrEqual(20);
  });

  it("does not resurrect pairs the request never promised", () => {
    // Trim the promise to one pair and split: only that pair may come back,
    // even though the origins' full neighbour lists hold more.
    const [whole] = planRequests(plan, 20);
    const trimmed = { ...whole, pairs: new Set(["a|b", "d|c"]) };
    const promised = splitRequest(trimmed, 20).flatMap((r) => [...r.pairs]);
    expect(new Set(promised)).toEqual(new Set(["a|b", "d|c"]));
  });

  it("cannot split a single-origin request", () => {
    expect(splitRequest({ sources: [a], destinations: [b, c], pairs: new Set(["a|b", "a|c"]) }, 20)).toEqual([]);
  });

  it("sorts numeric ids without throwing", () => {
    const n1 = city(1, 30, -100), n2 = city(2, 30.5, -100);
    expect(() => planRequests([{ city: n1, neighbours: [n2] }, { city: n2, neighbours: [n1] }], 10)).not.toThrow();
  });
});
