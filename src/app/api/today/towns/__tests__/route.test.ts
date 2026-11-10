import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/today/towns/route";
import { stateFor, townList } from "@/lib/today/towns";

/** The car app's pick list (docs/car-api.md): every atlas town, with a state in the US. */

const call = (ip: string, headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/today/towns", { headers: { "x-forwarded-for": ip, ...headers } }));

describe("townList and stateFor", () => {
  it("lists every atlas town once, sorted by name, with the US ones' states", () => {
    const { towns, atlasVersion } = townList();
    expect(atlasVersion).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(towns.length).toBeGreaterThan(300);
    expect(new Set(towns.map((t) => t.id)).size).toBe(towns.length);
    const byId = new Map(towns.map((t) => [t.id, t]));
    expect(byId.get("toledo-oh")).toMatchObject({ name: "Toledo", state: "OH", country: "United States" });
    expect(byId.get("lincoln-ne")?.state).toBe("NE");
    expect(byId.get("louisville")?.state).toBe("KY");
    expect(byId.get("toronto")?.state).toBeNull();
    const us = towns.filter((t) => t.country === "United States");
    expect(us.filter((t) => t.state === null)).toEqual([]);
  });

  it("tells two Portlands apart by state", () => {
    expect(stateFor({ id: "portland", name: "Portland", lat: 45.5152, lng: -122.6784, country: "United States" })).toBe("OR");
    expect(stateFor({ id: "portland-me", name: "Portland", lat: 43.6591, lng: -70.2568, country: "United States" })).toBe("ME");
  });

  it("falls back to the id's state for a town too small for the places list, only when it is a real state", () => {
    const nowhere = { lat: 29.3, lng: -103.6, country: "United States" };
    expect(stateFor({ id: "terlingua-tx", name: "Terlingua", ...nowhere }, [["Austin", "TX", 30.27, -97.74]])).toBe("TX");
    expect(stateFor({ id: "somewhere-zz", name: "Somewhere", ...nowhere }, [["Austin", "TX", 30.27, -97.74]])).toBeNull();
  });
});

describe("GET /api/today/towns", () => {
  it("answers 200 with a public day-long cache and an ETag, and 304 on a matching re-check", async () => {
    const res = await call("10.2.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    const etag = res.headers.get("etag");
    expect(etag).toMatch(/^".+"$/);
    expect(await res.json()).toMatchObject({ version: 1, status: "ok" });
    const again = await call("10.2.0.1", { "if-none-match": etag! });
    expect(again.status).toBe(304);
  });
});
