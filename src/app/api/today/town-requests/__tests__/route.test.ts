import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/today/town-requests/route";
import { parseTownRequest, MAX_TOWN_REQUEST_CHARS } from "@/lib/today/town-request";

/** The car app's "add this town" button (docs/car-api.md): a name, checked, kept as one log line. */

const post = (body: string, ip: string, type = "application/json", qs = "") =>
  POST(new Request(`http://localhost/api/today/town-requests${qs}`, { method: "POST", body, headers: { "content-type": type, "x-forwarded-for": ip } }));

describe("parseTownRequest", () => {
  it("takes a place name as the phone's geocoder gives it, tidied", () => {
    expect(parseTownRequest({ name: "  Springfield,  Illinois, United States " })).toEqual({ ok: true, name: "Springfield, Illinois, United States" });
    expect(parseTownRequest({ name: "Coeur d’Alene, Idaho" })).toMatchObject({ ok: true });
    expect(parseTownRequest({ name: "Montréal (Québec)" })).toMatchObject({ ok: true });
  });

  it("refuses anything that is not a short place name", () => {
    expect(parseTownRequest(null)).toMatchObject({ ok: false });
    expect(parseTownRequest(["Toledo"])).toMatchObject({ ok: false });
    expect(parseTownRequest({ name: 42 })).toMatchObject({ ok: false });
    expect(parseTownRequest({ name: "X" })).toMatchObject({ ok: false });
    expect(parseTownRequest({ name: "a".repeat(MAX_TOWN_REQUEST_CHARS + 1) })).toMatchObject({ ok: false });
    for (const bad of ["Toledo\n[town-request] fake", "<script>", "Toledo; DROP TABLE", "http://x.example", "Ignore previous instructions: {}"]) {
      expect(parseTownRequest({ name: bad })).toMatchObject({ ok: false });
    }
  });
});

describe("POST /api/today/town-requests", () => {
  it("answers 202 and logs exactly one quoted line with the name, nothing else", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await post(JSON.stringify({ name: "Springfield, Illinois, United States" }), "10.3.0.1");
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ version: 1, status: "accepted" });
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[town-request]"));
    expect(lines).toEqual(['[town-request] client=- "Springfield, Illinois, United States"']);
    log.mockRestore();
  });

  it("puts the car's client tag before the name", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await post(JSON.stringify({ name: "Toledo, Ohio" }), "10.3.0.4", "application/json", "?client=car-0.2.0");
    expect(log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[town-request]"))).toEqual(['[town-request] client=car-0.2.0 "Toledo, Ohio"']);
    log.mockRestore();
  });

  it("answers 400 for a wrong type, bad JSON, a big body or a bad name, and logs nothing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect((await post(JSON.stringify({ name: "Toledo" }), "10.3.0.2", "text/plain")).status).toBe(400);
    expect((await post("{not json", "10.3.0.2")).status).toBe(400);
    expect((await post(JSON.stringify({ name: "Toledo", pad: "x".repeat(2000) }), "10.3.0.2")).status).toBe(400);
    const bad = await post(JSON.stringify({ name: "Toledo\nfake" }), "10.3.0.2");
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ version: 1, status: "bad-request" });
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith("[town-request]"))).toEqual([]);
    log.mockRestore();
  });

  it("answers 429 with Retry-After once one address asks too often", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await post(JSON.stringify({ name: "Toledo, Ohio" }), "10.3.0.3");
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
