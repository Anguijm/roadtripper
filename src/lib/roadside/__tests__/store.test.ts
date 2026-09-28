import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { roadsideStore, survivorsAlongRoute, closeRoadsideStores } from "../store";

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
