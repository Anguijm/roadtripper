import { NextResponse } from "next/server";
import { parseTodayQuery, todayAnswer, type TodayApiResponse } from "@/lib/today/api";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";

/**
 * GET /api/today, read-only JSON for the car app. The contract is
 * docs/car-api.md; the computation is src/lib/today/api.ts.
 *
 * Rate limit: the same per-IP burst limit the /today page uses, which is
 * the layer that matches this work (atlas reads, no Routes API call). The
 * daily recompute quota is for the paid Routes calls and is deliberately
 * not charged here: a car app polling today's towns must not use up a
 * person's 25 plan recomputes (CLAUDE.md, rate limit layers).
 */
export const dynamic = "force-dynamic";

// Five minutes: today's towns change only with the atlas (a re-export every
// few weeks) and the drive graph, so a short private cache saves a car app's
// repeat calls on a flaky connection without serving a stale day; the car
// app keeps its own copy per day besides (docs/car-api.md). Private, because
// the answer depends on where the car is.
function json(body: TodayApiResponse, status: number, headers: Record<string, string> = {}) {
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
  const q = parseTodayQuery(new URL(request.url).searchParams);
  if (!q.ok) return json({ version: 1, status: "bad-request", message: q.message }, 400, { "Cache-Control": "no-store" });
  let body: TodayApiResponse;
  try {
    body = await todayAnswer(q.origin, q.hours, q.moods);
  } catch (err) {
    // JSON, not Next's HTML error page: the client parses every answer
    // (PR #164 council). The cause goes to the log, not to the client.
    console.error("[api/today] failed:", err instanceof Error ? err.constructor.name : "unknown");
    return json({ version: 1, status: "error", message: "Something went wrong on our side. Try again." }, 500, { "Cache-Control": "no-store" });
  }
  // One line per call, so car traffic can be told apart (it sends
  // "RoadtripperCar/<version>"); no coordinates in the log.
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 40);
  console.log(`[api/today] ${body.status} towns=${body.status === "ok" ? body.towns.length : 0} ua=${JSON.stringify(ua)}`);
  return json(body, 200);
}
