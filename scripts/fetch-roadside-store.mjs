// Fetch the roadside store before a build, if it is not already here.
//
//   node scripts/fetch-roadside-store.mjs [--to=data/roadside.sqlite] [--from=<url>] [--sum=<sha256 file>]
//
// The deployed app is built from git and the 77 MB store is not in git, so
// the build downloads the published snapshot and checks it against the
// checksum that is in git (data/roadside.sqlite.sha256). A file already
// here that matches is left alone. The download is streamed to a temporary
// file and hashed as it streams, then renamed into place, so nothing ever
// reads a partial file and the build never holds the whole store in memory.
// Anything that goes wrong leaves no file, says why, and exits 0: the site
// deploys without roadside stops rather than not at all (a build without
// the file succeeds; checked 2026-09-28), and the store's own warning names
// the missing file.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const to = args.get("to") ?? "data/roadside.sqlite";
const from = args.get("from") ?? "https://github.com/Anguijm/roadtripper/releases/download/roadside-store/roadside.sqlite";
const sumFile = args.get("sum") ?? "data/roadside.sqlite.sha256";
// Two minutes for 77 MB: about 650 KB/s, a fifth of what a slow build
// runner sees, and well under App Hosting's build budget. A bigger store
// or a slower runner raises this; the cost of too short is one build
// without roadside stops, never a failed build.
const TIMEOUT_MS = 120_000;
const UA = "roadtripper build (fetches its own release asset; contact: anguijm@gmail.com)";

const say = (m) => console.log(`[roadside store] ${m}`);
const fileSha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

if (!existsSync(sumFile)) { say(`${sumFile} is missing; nothing to check against, not fetching`); process.exit(0); }
const expected = readFileSync(sumFile, "utf8").trim().split(/\s+/)[0];
if (!/^[0-9a-f]{64}$/.test(expected)) { say(`${sumFile} does not hold a SHA-256; not fetching`); process.exit(0); }

if (existsSync(to)) {
  const have = fileSha256(to);
  if (have === expected) { say(`${to} is here and matches; nothing to do`); process.exit(0); }
  say(`${to} is here but does not match the checksum in git (${have.slice(0, 12)}… vs ${expected.slice(0, 12)}…); fetching the published one`);
}
const tmp = `${to}.tmp`;
try {
  const res = await fetch(from, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`${from} answered ${res.status}`);
  mkdirSync(dirname(to), { recursive: true });
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(res.body),
    async function* (source) { for await (const chunk of source) { hash.update(chunk); bytes += chunk.length; yield chunk; } },
    createWriteStream(tmp)
  );
  const got = hash.digest("hex");
  if (got !== expected) throw new Error(`downloaded file's checksum ${got.slice(0, 12)}… does not match ${expected.slice(0, 12)}… in git`);
  // The checksum says the bytes are the published ones; quick_check says
  // those bytes are a database SQLite can read, page by page.
  const db = new Database(tmp, { readonly: true, fileMustExist: true });
  const check = db.prepare("PRAGMA quick_check").pluck().get();
  db.close();
  if (check !== "ok") throw new Error(`downloaded file fails SQLite's quick_check: ${String(check).slice(0, 80)}`);
  renameSync(tmp, to);
  say(`fetched ${to}, ${(bytes / 1e6).toFixed(0)} MB, checksum verified, database intact`);
} catch (err) {
  for (const p of [tmp, to]) { if (existsSync(p)) { try { unlinkSync(p); } catch { /* leave it */ } } }
  say(`not fetched: ${err instanceof Error ? err.message : String(err)}. The site builds without roadside stops.`);
  process.exit(0);
}
