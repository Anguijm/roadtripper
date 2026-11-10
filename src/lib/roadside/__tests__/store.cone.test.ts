import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { roadsideStore, survivorsInCone, closeRoadsideStores } from "../store";

/**
 * The roadside store read toward a destination (/api/today/toward), on a
 * made-up store, so CI checks it without the real 160 MB file.
 * Heading due south from 35,-101 toward 34,-101 (about 111 km).
 */
const FROM = { lat: 35, lng: -101 };
const TO = { lat: 34, lng: -101 };
const dir = mkdtempSync(join(tmpdir(), "roadside-cone-"));
const path = join(dir, "roadside.sqlite");
const db = new Database(path);
db.exec(`CREATE TABLE roadside_stop (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, kind TEXT NOT NULL, detail TEXT, wikidata TEXT, wikipedia TEXT, short TEXT, extract TEXT, url TEXT, described_at TEXT, p REAL, scored_at TEXT); CREATE INDEX i ON roadside_stop (lat, lng);`);
const ins = db.prepare("INSERT INTO roadside_stop (id, name, lat, lng, kind, short, p) VALUES (?, ?, ?, ?, ?, ?, ?)");
ins.run("osm:node:1", "On the line", 34.5, -101, "attraction", "a roadside oddity", 0.6);
ins.run("osm:node:2", "Off to the side but in the cone", 34.5, -100.7, "museum", null, 0.7);
ins.run("osm:node:3", "Behind the start", 35.2, -101, "viewpoint", null, 0.9);
ins.run("osm:node:4", "Far to the side", 34.5, -99.5, "viewpoint", null, 0.9);
ins.run("osm:node:5", "Below the line", 34.6, -101, "attraction", null, 0.3);
ins.run("osm:node:6", "Bad kind", 34.4, -101, "spaceport", null, 0.9);
ins.run("osm:node:7", "In the box, outside the ellipse", 34.9, -100.5, "viewpoint", null, 0.9);
ins.run("osm:node:8", "In the box, just behind the start", 35.05, -101, "viewpoint", null, 0.9);
// In the cone, about 42 km away: inside a 40 km reach's square box, outside its circle.
ins.run("osm:node:9", "In the corner of the box", 34.7, -100.72, "artwork", null, 0.8);
db.close();

afterAll(() => {
  closeRoadsideStores();
  rmSync(dir, { recursive: true, force: true });
});

describe("survivorsInCone", () => {
  it("keeps scored stops in the cone and within reach, with the straight km from here and the line to read", () => {
    const out = survivorsInCone(roadsideStore(path)!, FROM, TO, 200);
    expect(out.map((s) => s.id).sort()).toEqual(["osm:node:1", "osm:node:2", "osm:node:9"]);
    const line = out.find((s) => s.id === "osm:node:1")!;
    expect(line.alongKm).toBeCloseTo(55.6, 0);
    expect(line.about).toBe("a roadside oddity");
  });

  it("drops what is behind, off to the side, below the line, malformed, or past today's reach", () => {
    const store = roadsideStore(path)!;
    const ids = survivorsInCone(store, FROM, TO, 200).map((s) => s.id);
    for (const gone of ["osm:node:3", "osm:node:4", "osm:node:5", "osm:node:6", "osm:node:7", "osm:node:8"]) expect(ids).not.toContain(gone);
    // Reach is a circle, the box a square: the corner stop is left out by the reach, not the box.
    expect(survivorsInCone(store, FROM, TO, 40).map((s) => s.id)).toEqual([]);
    expect(survivorsInCone(store, FROM, TO, 45).map((s) => s.id)).toEqual(["osm:node:9"]);
  });
});
