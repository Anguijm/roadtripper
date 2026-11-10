import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/today/route";

/** The route's HTTP shape: statuses, headers and the rate limit (docs/car-api.md). */

const call = (qs: string, ip: string) =>
  GET(new Request(`http://localhost/api/today?${qs}`, { headers: { "x-forwarded-for": ip, "user-agent": "RoadtripperCar/test" } }));

describe("GET /api/today", () => {
  it("answers 200 JSON with a private five-minute cache", async () => {
    const res = await call("lat=41.2565&lng=-95.9345&hours=4", "10.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    const body = await res.json();
    expect(body).toMatchObject({ version: 1, status: "ok", hours: 4 });
  });

  it("answers 400 with a message for a bad query, not cached", async () => {
    const res = await call("lat=41&lng=-95&moods=nope", "10.0.0.2");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ version: 1, status: "bad-request" });
  });

  it("answers 429 with Retry-After once one address asks too often", async () => {
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await call("lat=0&lng=-140", "10.0.0.3");
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await last!.json()).toMatchObject({ version: 1, status: "rate-limited" });
    // Another address is unaffected.
    expect((await call("lat=0&lng=-140", "10.0.0.4")).status).toBe(200);
  });
});
