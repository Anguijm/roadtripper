import { NextResponse } from "next/server";
import { townList, type TownsApiResponse } from "@/lib/today/towns";
import { checkRateLimit, getClientIp, maybeSweep } from "@/lib/routing/rate-limit";
import { clientTag } from "@/lib/today/client";

/**
 * GET /api/today/towns: the atlas's towns as the car app's pick list
 * (docs/car-api.md). The same for everyone and changed only by an atlas
 * export, so it is cached publicly for a day and carries an ETag (the
 * export time) for a cheap re-check.
 */
export const dynamic = "force-dynamic";

function json(body: TownsApiResponse, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function GET(request: Request) {
  maybeSweep();
  const limit = checkRateLimit(getClientIp(request.headers));
  if (!limit.ok) {
    return json({ version: 1, status: "rate-limited", retryAfterSeconds: limit.retryAfterSeconds }, 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }
  let list: ReturnType<typeof townList>;
  try {
    list = townList();
  } catch (err) {
    console.error("[api/today/towns] failed:", err instanceof Error ? err.constructor.name : "unknown");
    return json({ version: 1, status: "error", message: "Something went wrong on our side. Try again." }, 500);
  }
  const etag = `"${list.atlasVersion ?? "unknown"}"`;
  const cache = { "Cache-Control": "public, max-age=86400", ETag: etag };
  const fresh = request.headers.get("if-none-match") === etag;
  console.log(`[api/today/towns] ${fresh ? "not-modified" : "ok"} client=${clientTag(request.url)}`);
  if (fresh) return new NextResponse(null, { status: 304, headers: cache });
  return json({ version: 1, status: "ok", atlasVersion: list.atlasVersion, towns: list.towns }, 200, cache);
}
