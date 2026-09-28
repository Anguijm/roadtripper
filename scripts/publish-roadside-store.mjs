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
const snapshot = "data/osm/roadside-snapshot.sqlite";

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
writeFileSync("data/roadside.sqlite.sha256", `${sha}  ${ASSET}\n`);
console.log(`snapshot ${snapshot}: ${(bytes.length / 1e6).toFixed(0)} MB, ${stops.toLocaleString()} stops, ${scored.toLocaleString()} scored, sha256 ${sha.slice(0, 16)}…`);

const notes = `Roadside store snapshot, ${new Date().toISOString()}: ${stops.toLocaleString()} stops, ${scored.toLocaleString()} scored. Built by scripts/osm/extract-roadside.py and scripts/roadside-store.ts; see docs/roadside-store.md. The checksum lives in data/roadside.sqlite.sha256.`;
const exists = (() => { try { execFileSync("gh", ["release", "view", TAG], { stdio: "ignore" }); return true; } catch { return false; } })();
if (!exists) {
  execFileSync("gh", ["release", "create", TAG, `${snapshot}#${ASSET}`, "--title", "Roadside store", "--notes", notes], { stdio: "inherit" });
} else {
  execFileSync("gh", ["release", "upload", TAG, `${snapshot}#${ASSET}`, "--clobber"], { stdio: "inherit" });
  execFileSync("gh", ["release", "edit", TAG, "--notes", notes], { stdio: "inherit" });
}
console.log(`published ${ASSET} to release ${TAG}. Now commit data/roadside.sqlite.sha256, or the next build will refuse the new file.`);
