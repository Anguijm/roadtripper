// Publish a snapshot of the roadside store as a GitHub release asset.
//
//   node scripts/publish-roadside-store.mjs [--db=data/roadside.sqlite]
//
// VACUUM INTO writes a compact, consistent copy even while the describe or
// score pass is writing (WAL gives the copy a single snapshot). The SHA-256
// goes to data/roadside.sqlite.sha256, which is committed, and the copy goes
// up as the asset `roadside.sqlite` of the release `roadside-store`,
// replacing the previous one. Then commit the checksum: the fetch on the
// next build compares against it.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";

const args = new Map(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const dbPath = args.get("db") ?? "data/roadside.sqlite";
const TAG = "roadside-store";
const ASSET = "roadside.sqlite";
// The asset's download URL uses the uploaded file's own name (the `#label`
// form of gh only changes the display label; the first publish learned
// that with a 404), so the snapshot is written under the asset's name.
const snapshot = `data/osm/${ASSET}`;

if (!existsSync(dbPath)) throw new Error(`${dbPath} is missing`);
mkdirSync("data/osm", { recursive: true });
if (existsSync(snapshot)) unlinkSync(snapshot);
const db = new Database(dbPath, { readonly: true });
db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
const stops = db.prepare("SELECT COUNT(*) AS n FROM roadside_stop").get().n;
const scored = db.prepare("SELECT COUNT(*) AS n FROM roadside_stop WHERE p IS NOT NULL").get().n;
db.close();
const bytes = readFileSync(snapshot);
const sha = createHash("sha256").update(bytes).digest("hex");
console.log(`snapshot ${snapshot}: ${(bytes.length / 1e6).toFixed(0)} MB, ${stops.toLocaleString()} stops, ${scored.toLocaleString()} scored, sha256 ${sha.slice(0, 16)}…`);

const notes = `Roadside store snapshot, ${new Date().toISOString()}: ${stops.toLocaleString()} stops, ${scored.toLocaleString()} scored. Built by scripts/osm/extract-roadside.py and scripts/roadside-store.ts; see docs/roadside-store.md. The checksum lives in data/roadside.sqlite.sha256.`;
// Publishing goes through the GitHub CLI (`gh`), which must be installed
// and signed in (`gh auth status`) as someone who can write releases on
// this repository. Unauthenticated or without that permission, the
// `release` commands below fail with gh's own message and this script
// stops before touching the release; the snapshot and the checksum file
// are already written by then, so a rerun after `gh auth login` picks up
// where it stopped. The download side needs no token: the repo is public.
const exists = (() => { try { execFileSync("gh", ["release", "view", TAG], { stdio: "ignore" }); return true; } catch { return false; } })();
if (!exists) {
  execFileSync("gh", ["release", "create", TAG, snapshot, "--title", "Roadside store", "--notes", notes], { stdio: "inherit" });
} else {
  execFileSync("gh", ["release", "upload", TAG, snapshot, "--clobber"], { stdio: "inherit" });
  execFileSync("gh", ["release", "edit", TAG, "--notes", notes], { stdio: "inherit" });
}
const url = `https://github.com/Anguijm/roadtripper/releases/download/${TAG}/${ASSET}`;
const head = await fetch(url, { method: "HEAD", redirect: "follow" });
if (!head.ok) throw new Error(`published, but ${url} answers ${head.status}; the fetch at build would find nothing`);
// The checksum file is written only now, after the asset is up and answers:
// a failed upload must not leave a checksum in the working tree that no
// published file matches, waiting to be committed by mistake.
writeFileSync("data/roadside.sqlite.sha256", `${sha}  ${ASSET}\n`);
console.log(`published ${ASSET} to release ${TAG}; ${url} answers ${head.status}. Now commit data/roadside.sqlite.sha256, or the next build will refuse the new file.`);
