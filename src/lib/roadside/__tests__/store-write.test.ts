import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { storeWriter } from "../store-write";
import type { RoadsideStop } from "../record";

const stop = (id: string, extra: Partial<RoadsideStop> = {}): RoadsideStop => ({
  id, name: `Stop ${id}`, lat: 35, lng: -101, kind: "attraction", source: "osm", reason: null, detail: null, wikidata: null, wikipedia: null, ...extra,
});
const row = (db: Database.Database, id: string) => db.prepare("SELECT * FROM roadside_stop WHERE id = ?").get(id) as Record<string, unknown> | undefined;

describe("rebuilding the store keeps what was paid for", () => {
  it("keeps the score and the lines when the record the model saw is unchanged, and removes stops that vanished", () => {
    const db = new Database(":memory:");
    let w = storeWriter(db);
    w.write([stop("a", { wikidata: "Q1" }), stop("b"), stop("gone")]);
    db.prepare("UPDATE roadside_stop SET p = 0.8, scored_at = 't', short = 'thing', extract = 'About a.', url = 'https://x', described_at = 't' WHERE id = 'a'").run();
    w = storeWriter(db);
    w.write([stop("a", { wikidata: "Q1" }), stop("b", { lat: 36 })]);
    expect(w.removeUnseen()).toBe(1);
    expect(row(db, "gone")).toBeUndefined();
    const a = row(db, "a")!;
    expect(a.p).toBe(0.8);
    expect(a.extract).toBe("About a.");
    expect(row(db, "b")!.lat).toBe(36);
  });

  it("clears the score when the name, kind or the map's line changed, and the lines when the link changed", () => {
    const db = new Database(":memory:");
    let w = storeWriter(db);
    w.write([stop("a", { wikidata: "Q1" }), stop("b", { wikidata: "Q2" }), stop("c", { wikidata: "Q3" })]);
    db.prepare("UPDATE roadside_stop SET p = 0.8, scored_at = 't', short = 's', extract = 'e', url = 'u', described_at = 't'").run();
    w = storeWriter(db);
    w.write([
      stop("a", { wikidata: "Q1", detail: "mural" }), // the model would see a new line: rescore, keep the encyclopedia
      stop("b", { wikidata: "Q9" }),                  // a new link: refetch the lines, and the state changes with them, but the score keys on name, kind, detail
      stop("c", { wikidata: "Q3", kind: "museum" }),  // a new kind: rescore
    ]);
    expect(row(db, "a")!.p).toBeNull();
    expect(row(db, "a")!.extract).toBe("e");
    expect(row(db, "b")!.extract).toBeNull();
    expect(row(db, "b")!.described_at).toBeNull();
    expect(row(db, "b")!.p).toBe(0.8);
    expect(row(db, "c")!.p).toBeNull();
    expect(row(db, "c")!.scored_at).toBeNull();
  });
});
