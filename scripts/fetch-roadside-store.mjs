// Fetch the roadside store before a build, if it is not already here.
//
//   node scripts/fetch-roadside-store.mjs [--to=data/roadside.sqlite] [--from=<url>]
//
// The deployed app is built from git and the 58 MB store is not in git, so
// the build downloads the published snapshot and checks it against the
// checksum that is in git (data/roadside.sqlite.sha256). A file already
// here that matches is left alone. Anything that goes wrong leaves no file,
// says why, and exits 0: the site deploys without roadside stops rather
// than not at all, and the store's own warning names the missing file.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const to = args.get("to") ?? "data/roadside.sqlite";
const from = args.get("from") ?? "https://github.com/Anguijm/roadtripper/releases/download/roadside-store/roadside.sqlite";
const sumFile = args.get("sum") ?? "data/roadside.sqlite.sha256";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const say = (m) => console.log(`[roadside store] ${m}`);

if (!existsSync(sumFile)) { say(`${sumFile} is missing; nothing to check against, not fetching`); process.exit(0); }
const expected = readFileSync(sumFile, "utf8").trim().split(/\s+/)[0];
if (!/^[0-9a-f]{64}$/.test(expected)) { say(`${sumFile} does not hold a SHA-256; not fetching`); process.exit(0); }

if (existsSync(to)) {
  const have = sha256(readFileSync(to));
  if (have === expected) { say(`${to} is here and matches; nothing to do`); process.exit(0); }
  say(`${to} is here but does not match the checksum in git (${have.slice(0, 12)}… vs ${expected.slice(0, 12)}…); fetching the published one`);
}
try {
  const res = await fetch(from, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${from} answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== expected) throw new Error(`downloaded file's checksum ${got.slice(0, 12)}… does not match ${expected.slice(0, 12)}… in git`);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, buf);
  say(`fetched ${to}, ${(buf.length / 1e6).toFixed(0)} MB, checksum verified`);
} catch (err) {
  if (existsSync(to)) { try { unlinkSync(to); } catch { /* leave it */ } }
  say(`not fetched: ${err instanceof Error ? err.message : String(err)}. The site builds without roadside stops.`);
  process.exit(0);
}
