import { describe, it, expect, vi } from "vitest";
import { GET } from "@/app/api/today/toward/route";
import * as toward from "@/lib/today/toward";

/** The route's HTTP shape: statuses, headers, the rate limit and the log line (docs/car-api.md). */

const call = (qs: string, ip: string) =>
  GET(new Request(`http://localhost/api/today/toward?${qs}`, { headers: { "x-forwarded-for": ip, "user-agent": "RoadtripperCar/test" } }));

describe("GET /api/today/toward", () => {
  it("answers 200 JSON with a private five-minute cache, and logs no position", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await call("lat=42.33&lng=-83.05&to=louisville&hours=5", "10.1.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(await res.json()).toMatchObject({ version: 1, status: "ok", hours: 5 });
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[api/today/toward]"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[api\/today\/toward\] ok rows=\d+ ua="RoadtripperCar\/test"$/);
    expect(lines[0]).not.toMatch(/42\.33|83\.05|louisville/);
    log.mockRestore();
  });

  it("answers 400 for a bad query and 404 for an unknown town, neither cached", async () => {
    const bad = await call("lat=42.33&lng=-83.05", "10.1.0.2");
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");
    expect(await bad.json()).toMatchObject({ status: "bad-request" });
    const unknown = await call("lat=42.33&lng=-83.05&to=atlantis", "10.1.0.2");
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("cache-control")).toBe("no-store");
    expect(await unknown.json()).toMatchObject({ status: "unknown-destination" });
  });

  it("answers 429 with Retry-After once one address asks too often", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await call("lat=0&lng=-140&to=louisville", "10.1.0.3");
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers 500 JSON when the computation throws", async () => {
    const spy = vi.spyOn(toward, "towardAnswer").mockRejectedValueOnce(new Error("store gone"));
    const res = await call("lat=42.33&lng=-83.05&to=louisville", "10.1.0.9");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ version: 1, status: "error" });
    spy.mockRestore();
  });
});
