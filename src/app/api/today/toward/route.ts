import { NextResponse } from "next/server";
import { parseTowardQuery, towardAnswer, type TowardApiResponse } from "@/lib/today/toward";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";

/**
 * GET /api/today/toward, read-only JSON for the car app: today's towns and
 * roadside stops toward a destination, by time to reach. The contract is
 * docs/car-api.md; the computation is src/lib/today/toward.ts.
 *
 * No paid call (the direction is a cone, John's choice), so the same per-IP
 * burst limit as /api/today and no daily quota (CLAUDE.md, rate limit layers).
 * The path starts /api/today on purpose: the request-log exclusion
 * `drop-api-today-requests` matches it, so the position and destination in
 * the URL are not kept (docs/car-api.md, "What the server keeps").
 */
export const dynamic = "force-dynamic";

function json(body: TowardApiResponse, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, max-age=300", ...headers } });
}

export async function GET(request: Request) {
  maybeSweep();
  const limit = checkRateLimit(getClientIp(request.headers));
  if (!limit.ok) {
    return json({ version: 1, status: "rate-limited", retryAfterSeconds: limit.retryAfterSeconds }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
      "Cache-Control": "no-store",
    });
  }
  const q = parseTowardQuery(new URL(request.url).searchParams);
  if (!q.ok) return json({ version: 1, status: "bad-request", message: q.message }, 400, { "Cache-Control": "no-store" });

  let body: TowardApiResponse;
  try {
    body = await towardAnswer(q.origin, q.to, q.hours, q.moods);
  } catch (err) {
    // JSON, not Next's HTML error page; the cause goes to the log only.
    console.error("[api/today/toward] failed:", err instanceof Error ? err.constructor.name : "unknown");
    return json({ version: 1, status: "error", message: "Something went wrong on our side. Try again." }, 500, { "Cache-Control": "no-store" });
  }
  // One line per call: status, row count, user agent. Never a position or a destination.
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 40);
  console.log(`[api/today/toward] ${body.status} rows=${body.status === "ok" ? body.stops.length : 0} ua=${JSON.stringify(ua)}`);
  if (body.status === "unknown-destination") return json(body, 404, { "Cache-Control": "no-store" });
  return json(body, 200);
}
