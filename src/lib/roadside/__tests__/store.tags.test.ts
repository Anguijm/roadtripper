import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { roadsideStore, survivorsAlongRoute, closeRoadsideStores, tagScoresByStop, withTagScores } from "../store";
import { rankFor } from "../tags";
import type { RoadsideMarker } from "../along";

/** The same road as store.test.ts: due south from 35,-101 for about 111 km. */
const route = Array.from({ length: 101 }, (_, i) => ({ lat: 35 - i / 100, lng: -101 }));

const dir = mkdtempSync(join(tmpdir(), "roadside-tags-"));
const path = join(dir, "roadside.sqlite");
const db = new Database(path);
db.exec(`
  CREATE TABLE roadside_stop (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, kind TEXT NOT NULL, detail TEXT, wikidata TEXT, wikipedia TEXT, short TEXT, extract TEXT, url TEXT, described_at TEXT, p REAL, scored_at TEXT);
  CREATE INDEX i ON roadside_stop (lat, lng);
  CREATE TABLE roadside_tag (stop_id TEXT NOT NULL, tag TEXT NOT NULL, p REAL NOT NULL, scored_at TEXT NOT NULL, PRIMARY KEY (stop_id, tag)) WITHOUT ROWID;
`);
const ins = db.prepare("INSERT INTO roadside_stop (id, name, lat, lng, kind, p) VALUES (?, ?, ?, ?, ?, ?)");
// Two stops on the road, one stadium and one diner, plus one never tagged.
ins.run("osm:node:1", "The stadium", 34.5, -101 + 0.05, "attraction", 0.6);
ins.run("osm:node:4", "The diner", 34.775, -101, "attraction", 0.5);
ins.run("osm:node:7", "Never tagged", 34.9, -101, "attraction", 0.7);
// A row the schema must refuse: a name is `z.string().min(1)`.
ins.run("osm:node:8", "", 34.8, -101, "attraction", 0.8);
// And one whose "name" is not a name (U15): 54 in Midland, Texas, are "*".
ins.run("osm:node:9", "*", 34.7, -101, "attraction", 0.6);
const tag = db.prepare("INSERT INTO roadside_tag (stop_id, tag, p, scored_at) VALUES (?, ?, ?, 't')");
tag.run("osm:node:1", "sports_place", 0.99);
tag.run("osm:node:1", "famous_food", 0.02);
tag.run("osm:node:4", "famous_food", 0.94);
tag.run("osm:node:4", "sports_place", 0.01);
// A tag the vocabulary does not know, as a renamed tag in the bench would arrive.
tag.run("osm:node:4", "haunted_house", 0.88);
// Values a probability cannot take. SQLite stores these happily.
tag.run("osm:node:1", "museum", Infinity);
tag.run("osm:node:1", "garden", -0.5);
tag.run("osm:node:1", "big_view", 4);
db.close();
afterAll(() => { closeRoadsideStores(); rmSync(dir, { recursive: true, force: true }); });

const byId = (out: RoadsideMarker[]) => new Map(out.map((m) => [m.id, m]));

describe("the stops the plan page reads carry their tags", () => {
  it("attaches the scores the store holds", () => {
    const out = byId(survivorsAlongRoute(roadsideStore(path)!, route));
    expect(out.get("osm:node:1")!.scores).toEqual({ sports_place: 0.99, famous_food: 0.02 });
    expect(out.get("osm:node:4")!.scores).toMatchObject({ famous_food: 0.94, sports_place: 0.01 });
  });

  it("leaves a stop the tagging never reached without a scores field at all", () => {
    // Not an empty object: "never tagged" and "tagged as nothing" stay
    // distinguishable in a capture, though rankFor ranks them the same.
    const out = byId(survivorsAlongRoute(roadsideStore(path)!, route));
    expect(out.get("osm:node:7")!.scores).toBeUndefined();
    expect("scores" in out.get("osm:node:7")!).toBe(false);
  });

  it("drops a tag the vocabulary does not know instead of carrying it", () => {
    // The table is written by a bench in another repository. A renamed tag
    // must read as absent, not arrive as a key nothing will look up.
    const out = byId(survivorsAlongRoute(roadsideStore(path)!, route));
    expect(out.get("osm:node:4")!.scores).not.toHaveProperty("haunted_house");
  });

  it("drops a value that is not a probability instead of carrying it to a marker", () => {
    // The rows come from a bench in another repository (jev-lab J11).
    // scoreOf would refuse these at ranking time, but a marker is also read
    // by captures and logs that never go through it, so they are dropped
    // where the data enters rather than everywhere it is used.
    const out = byId(survivorsAlongRoute(roadsideStore(path)!, route));
    const scores = out.get("osm:node:1")!.scores!;
    expect(scores).not.toHaveProperty("museum");
    expect(scores).not.toHaveProperty("garden");
    expect(scores).not.toHaveProperty("big_view");
    expect(Object.values(scores).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
  });

  it("gives each marker its own scores object rather than the lookup's", () => {
    // withTagScores is exported and the map holds one object per stop, so
    // two markers with the same id would otherwise share it.
    const store = roadsideStore(path)!;
    const twice = [
      { id: "osm:node:1", alongKm: 1 },
      { id: "osm:node:1", alongKm: 2 },
    ] as unknown as RoadsideMarker[];
    const out = withTagScores(store, twice);
    expect(out[0].scores).toEqual(out[1].scores);
    expect(out[0].scores).not.toBe(out[1].scores);
  });

  it("gives the ranking enough to tell the stadium from the diner", () => {
    // The point of the whole unit: before it, both of these ranked on the
    // general score alone and the stadium (0.6) beat the diner (0.5) for
    // someone who asked for food.
    const out = byId(survivorsAlongRoute(roadsideStore(path)!, route));
    const stadium = out.get("osm:node:1")!;
    const diner = out.get("osm:node:4")!;
    expect(rankFor(diner.scores, diner.p, ["food"])).toBeGreaterThan(rankFor(stadium.scores, stadium.p, ["food"]));
    expect(rankFor(stadium.scores, stadium.p, ["sports"])).toBeGreaterThan(rankFor(diner.scores, diner.p, ["sports"]));
  });

  it("never lets a stop without a name reach a marker, so the comparator cannot meet one", () => {
    // `RoadsideSurvivorSchema` has `name: z.string().min(1)` and
    // `survivorsAlongRoute` skips a row the schema refuses rather than
    // passing it on. That is why `orderRoadside`'s `a.name.localeCompare`
    // needs no null guard: schema drift makes the store return *fewer*
    // stops, never malformed ones. If this test ever fails, that argument
    // has stopped being true and the comparator needs the guard.
    const out = survivorsAlongRoute(roadsideStore(path)!, route);
    expect(out.map((m) => m.id)).not.toContain("osm:node:8");
    for (const m of out) {
      expect(m.name.length, m.id).toBeGreaterThan(0);
      expect(Number.isFinite(m.alongKm), m.id).toBe(true);
    }
  });

  it("never lets a place named `*` onto the sheet (U15)", () => {
    const out = survivorsAlongRoute(roadsideStore(path)!, route);
    expect(out.map((m) => m.id)).not.toContain("osm:node:9");
    for (const m of out) expect(m.name).not.toBe("*");
  });

  it("asks for nothing when there are no stops to ask about", () => {
    expect(tagScoresByStop(roadsideStore(path)!, []).size).toBe(0);
  });

  it("never puts more host parameters in one statement than the oldest SQLite accepts", () => {
    // The ceiling is 999 on builds older than SQLite 3.32 and 32,766 on
    // anything current, and better-sqlite3 ships whichever the machine
    // built. This asserts the chunking directly, by watching the SQL that
    // is prepared, because on a machine with the high ceiling a single
    // oversized query succeeds and a behavioural test proves nothing.
    const store = roadsideStore(path)!;
    const widths: number[] = [];
    const spy = new Proxy(store, {
      get(target, prop, receiver) {
        if (prop !== "prepare") return Reflect.get(target, prop, receiver);
        return (sql: string) => {
          if (sql.includes("roadside_tag")) widths.push((sql.match(/\?/g) ?? []).length);
          return target.prepare(sql);
        };
      },
    }) as typeof store;

    const many = [...Array.from({ length: 2500 }, (_, i) => `absent:${i}`), "osm:node:1"];
    const found = tagScoresByStop(spy, many);

    expect(widths.length).toBeGreaterThan(1);
    for (const w of widths) expect(w).toBeLessThanOrEqual(999);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(many.length);
    // and it still finds the one real stop, split across chunks
    expect(found.get("osm:node:1")).toEqual({ sports_place: 0.99, famous_food: 0.02 });
  });

  it("leaves markers untouched when the store has no tag table", () => {
    // A store built before the tagging pass. The query would raise "no
    // such table" on every render, and roadsideForRoute catches, so every
    // roadside marker would quietly stop appearing rather than fail loudly.
    const oldDir = mkdtempSync(join(tmpdir(), "roadside-untagged-"));
    const oldPath = join(oldDir, "roadside.sqlite");
    const old = new Database(oldPath);
    old.exec("CREATE TABLE roadside_stop (id TEXT PRIMARY KEY, p REAL);");
    const markers = [{ id: "osm:node:1", alongKm: 1 }] as unknown as RoadsideMarker[];
    expect(() => withTagScores(old, markers)).not.toThrow();
    expect(withTagScores(old, markers)[0].scores).toBeUndefined();
    old.close();
    rmSync(oldDir, { recursive: true, force: true });
  });
});
