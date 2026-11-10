import { NextResponse } from "next/server";
import { parseTownRequest } from "@/lib/today/town-request";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";

/**
 * POST /api/today/town-requests: the car app's "add this town" button
 * (docs/car-api.md; rules in src/lib/today/town-request.ts). Writes nothing
 * but one log line, `[town-request] "<name>"`, which Cloud Logging keeps 30
 * days and the atlas work reads in batches. The per-IP burst limit applies;
 * the phone sends one request per place, on the driver's tap.
 */
export const dynamic = "force-dynamic";

/**
 * A body larger than this is not a town name. The only field is a name of at
 * most 80 characters (MAX_TOWN_REQUEST_CHARS), which is under 400 bytes as
 * JSON even in a script of four-byte characters; 1 KB leaves room for that
 * and refuses a padded body before it is parsed, so a large post costs the
 * server nothing. Tested in __tests__/route.test.ts ("a big body").
 */
const MAX_BODY_BYTES = 1024;

type Body =
  | { version: 1; status: "accepted" }
  | { version: 1; status: "bad-request"; message: string }
  | { version: 1; status: "rate-limited"; retryAfterSeconds: number }
  | { version: 1; status: "error"; message: string };

function json(body: Body, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  maybeSweep();
  const limit = checkRateLimit(getClientIp(request.headers));
  if (!limit.ok) {
    return json({ version: 1, status: "rate-limited", retryAfterSeconds: limit.retryAfterSeconds }, 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ version: 1, status: "bad-request", message: "send Content-Type: application/json" }, 400);
  }
  let parsed: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ version: 1, status: "bad-request", message: "body too large" }, 400);
    parsed = JSON.parse(text);
  } catch {
    return json({ version: 1, status: "bad-request", message: "body is not JSON" }, 400);
  }
  const q = parseTownRequest(parsed);
  if (!q.ok) return json({ version: 1, status: "bad-request", message: q.message }, 400);
  // JSON-quoted, so a name can never start a second log line or pass for another entry.
  console.log(`[town-request] ${JSON.stringify(q.name)}`);
  return json({ version: 1, status: "accepted" }, 202);
}
