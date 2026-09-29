import { describe, it, expect, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { roadsideStore, survivorsAlongRoute, closeRoadsideStores, resolveStorePath, resolveStore, roadsideForRoute, mainWorktreeDir } from "../store";

/** A road due south from 35,-101 for about 111 km, a point every 0.01 degrees. */
const route = Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i / 100, lng: -101 }));

const dir = mkdtempSync(join(tmpdir(), "roadside-store-"));
const path = join(dir, "roadside.sqlite");
const db = new Database(path);
db.exec(`CREATE TABLE roadside_stop (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, kind TEXT NOT NULL, detail TEXT, wikidata TEXT, wikipedia TEXT, short TEXT, extract TEXT, url TEXT, described_at TEXT, p REAL, scored_at TEXT); CREATE INDEX i ON roadside_stop (lat, lng);`);
const ins = db.prepare("INSERT INTO roadside_stop (id, name, lat, lng, kind, detail, short, extract, url, p) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
ins.run("osm:node:1", "Inside above the line", 34.5, -101 + 0.05, "attraction", null, "roadside oddity", null, null, 0.6);
ins.run("osm:node:2", "Inside below the line", 34.6, -101 + 0.05, "museum", "local", null, null, null, 0.3);
ins.run("osm:node:3", "Outside the buffer", 34.5, -101 + 0.16, "viewpoint", null, null, null, null, 0.9);
ins.run("osm:node:4", "On a tile boundary", 34.775, -101, "artwork", "mural", null, "Painted in 1999.", "https://en.wikipedia.org/wiki/X", 0.5);
ins.run("osm:node:5", "Unscored", 34.4, -101, "attraction", null, null, null, null, null);
ins.run("osm:node:6", "Bad kind", 34.45, -101, "spaceport", null, null, null, null, 0.9);
db.close();
afterAll(() => { closeRoadsideStores(); rmSync(dir, { recursive: true, force: true }); });

describe("the roadside store", () => {
  it("keeps scored stops above the line inside the corridor, once each, in road order, with the line to read", () => {
    const store = roadsideStore(path)!;
    const out = survivorsAlongRoute(store, route);
    expect(out.map((s) => s.id)).toEqual(["osm:node:4", "osm:node:1"]);
    expect(out[0].about).toBe("Painted in 1999.");
    expect(out[0].url).toBe("https://en.wikipedia.org/wiki/X");
    expect(out[1].about).toBe("roadside oddity");
    expect(out[1].alongKm).toBeCloseTo(55.6, 0);
  });

  it("drops the unscored, the below-the-line, the outside and the malformed", () => {
    const store = roadsideStore(path)!;
    const ids = survivorsAlongRoute(store, route).map((s) => s.id);
    for (const gone of ["osm:node:2", "osm:node:3", "osm:node:5", "osm:node:6"]) expect(ids).not.toContain(gone);
    expect(survivorsAlongRoute(store, route, 0.3).map((s) => s.id)).toContain("osm:node:2");
  });

  it("opens a path once and hands the same connection back", () => {
    expect(roadsideStore(path)).toBe(roadsideStore(path));
  });

  it("gives nothing for a missing store or a route with one point", () => {
    expect(roadsideStore(join(dir, "nope.sqlite"))).toBeNull();
    expect(roadsideStore(null)).toBeNull();
    expect(survivorsAlongRoute(roadsideStore(path)!, [route[0]])).toEqual([]);
  });
});

describe("where the store is", () => {
  /**
   * A main checkout and a linked worktree beside it, laid out as git lays
   * them out: the worktree's `.git` is a file naming the main checkout's
   * `.git/worktrees/<name>`. The Gauntlet builds each component in such a
   * worktree, and the store (gitignored) is beside the main checkout's
   * atlas alone (round 4 of U3: three rounds of captures drew no roadside
   * place because the resolver looked in the worktree's own data/ only).
   */
  const root = mkdtempSync(join(tmpdir(), "roadside-where-"));
  const main = join(root, "main");
  const wt = join(root, "wt");
  mkdirSync(join(main, ".git", "worktrees", "wt"), { recursive: true });
  mkdirSync(join(main, "data"), { recursive: true });
  writeFileSync(join(main, "data", "roadside.sqlite"), "");
  mkdirSync(wt, { recursive: true });
  writeFileSync(join(wt, ".git"), `gitdir: ${join(main, ".git", "worktrees", "wt")}\n`);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("finds the main checkout's store from a linked worktree, and lets the worktree's own file and the explicit path win", () => {
    expect(mainWorktreeDir(wt)).toBe(main);
    expect(resolveStorePath(wt, undefined)).toBe(join(main, "data", "roadside.sqlite"));
    expect(resolveStore(wt, undefined)).toEqual({ path: join(main, "data", "roadside.sqlite"), source: "in the main checkout" });
    // A relative gitdir line resolves against the worktree.
    const rel = join(root, "rel");
    mkdirSync(rel, { recursive: true });
    writeFileSync(join(rel, ".git"), "gitdir: ../main/.git/worktrees/rel\n");
    expect(mainWorktreeDir(rel)).toBe(main);
    // The explicit path wins when it is there, and is skipped when it is not.
    expect(resolveStorePath(wt, join(main, "data", "roadside.sqlite"))).toBe(join(main, "data", "roadside.sqlite"));
    expect(resolveStore(wt, join(main, "data", "roadside.sqlite"))?.source).toBe("ROADSIDE_STORE_PATH");
    expect(resolveStorePath(wt, join(root, "nope.sqlite"))).toBe(join(main, "data", "roadside.sqlite"));
    // The worktree's own file wins over the main checkout's.
    mkdirSync(join(wt, "data"), { recursive: true });
    writeFileSync(join(wt, "data", "roadside.sqlite"), "");
    expect(resolveStorePath(wt, undefined)).toBe(join(wt, "data", "roadside.sqlite"));
    expect(resolveStore(wt, undefined)?.source).toBe("beside the atlas");
  });

  it("says where it found the store in words, once, and never the path", () => {
    // Council round 1 on #87: the log line named the absolute path, the
    // machine's directory layout, in every environment. It names the
    // place instead; the fixture store above stands in for a volume.
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const before = process.env.ROADSIDE_STORE_PATH;
    process.env.ROADSIDE_STORE_PATH = path;
    try {
      // Google's example polyline, three points in California: nothing in
      // the fixture's tiles, so the answer is empty and the log is the point.
      expect(roadsideForRoute("_p~iF~ps|U_ulLnnqC")).toEqual([]);
      roadsideForRoute("_p~iF~ps|U_ulLnnqC");
      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith("[roadside] store: ROADSIDE_STORE_PATH");
      const line = String(info.mock.calls[0][0]);
      expect(line).not.toContain(path);
      expect(line).not.toContain(dir);
      expect(line).not.toMatch(/[\\/]/);
    } finally {
      if (before === undefined) delete process.env.ROADSIDE_STORE_PATH;
      else process.env.ROADSIDE_STORE_PATH = before;
      info.mockRestore();
    }
  });

  it("never reads .git in production, a worktree's file or not", () => {
    // Council round 3 on #87, item 4: a deploy is never a linked worktree,
    // so in production the lookup answers null before the filesystem is
    // touched, and the main checkout's store is not a candidate. The same
    // worktree that resolves above resolves to nothing here; the
    // worktree's own file and the explicit path still do.
    mkdirSync(join(wt, "data"), { recursive: true });
    writeFileSync(join(wt, "data", "roadside.sqlite"), "");
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(mainWorktreeDir(wt)).toBeNull();
      expect(resolveStore(wt, undefined)?.source).toBe("beside the atlas");
      rmSync(join(wt, "data"), { recursive: true, force: true });
      expect(resolveStore(wt, undefined)).toBeNull();
      expect(resolveStore(wt, join(main, "data", "roadside.sqlite"))?.source).toBe("ROADSIDE_STORE_PATH");
    } finally {
      vi.unstubAllEnvs();
    }
    // Back in the test environment the lookup stands, so the stub was what
    // changed the answer.
    expect(process.env.NODE_ENV).not.toBe("production");
    expect(mainWorktreeDir(wt)).toBe(main);
  });

  it("names no store from a plain checkout, or with no .git at all, and never throws", () => {
    // The main checkout itself: `.git` is a directory, so no fallback, and
    // its own data/ is where it looks.
    expect(mainWorktreeDir(main)).toBeNull();
    expect(resolveStorePath(main, undefined)).toBe(join(main, "data", "roadside.sqlite"));
    // A deploy: no `.git`, no store, null; with the standalone output's
    // copy, that one, said as such.
    const bare = join(root, "bare");
    mkdirSync(bare, { recursive: true });
    expect(mainWorktreeDir(bare)).toBeNull();
    expect(resolveStorePath(bare, undefined)).toBeNull();
    expect(resolveStore(bare, undefined)).toBeNull();
    mkdirSync(join(bare, ".next", "standalone", "data"), { recursive: true });
    writeFileSync(join(bare, ".next", "standalone", "data", "roadside.sqlite"), "");
    expect(resolveStore(bare, undefined)).toEqual({ path: join(bare, ".next", "standalone", "data", "roadside.sqlite"), source: "in the standalone output" });
    // A `.git` file that is not a worktree's, and one that names no gitdir.
    const odd = join(root, "odd");
    mkdirSync(odd, { recursive: true });
    writeFileSync(join(odd, ".git"), "gitdir: /somewhere/else/.git\n");
    expect(mainWorktreeDir(odd)).toBeNull();
    writeFileSync(join(odd, ".git"), "not a pointer\n");
    expect(mainWorktreeDir(odd)).toBeNull();
    expect(resolveStorePath(odd, undefined)).toBeNull();
  });
});
