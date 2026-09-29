import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { closeRoadsideStores, roadsideStore } from "../store";
import { exampleNamesFrom, homeExampleNames, forgetExampleNames, FALLBACK_EXAMPLES, MAX_EXAMPLE_NAME_LENGTH } from "../examples";
import { exampleLine } from "@/lib/plan/words";

/**
 * The home's two example names, read from the store by the rule in
 * examples.ts (Gauntlet U4): the two strongest with a Wikipedia page, by p
 * then by name, names the line can hold, and the fallback when the store
 * is missing or too thin.
 */

const SCHEMA = `CREATE TABLE roadside_stop (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, kind TEXT NOT NULL, detail TEXT, wikidata TEXT, wikipedia TEXT, short TEXT, extract TEXT, url TEXT, described_at TEXT, p REAL, scored_at TEXT);`;
const dir = mkdtempSync(join(tmpdir(), "roadside-examples-"));

function store(name: string, rows: [string, string | null, number | null][]): string {
  const path = join(dir, name);
  const db = new Database(path);
  db.exec(SCHEMA);
  const ins = db.prepare("INSERT INTO roadside_stop (id, name, lat, lng, kind, url, p) VALUES (?, ?, 35, -101, 'attraction', ?, ?)");
  rows.forEach(([n, url, p], i) => ins.run(`osm:node:${i + 1}`, n, url, p));
  db.close();
  return path;
}

const wiki = (title: string) => `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`;
const full = store("full.sqlite", [
  ["Zebra Park", null, 0.99],                       // the strongest, but no page
  ["Meteor Crater", wiki("Meteor Crater"), 0.9],   // tied with the whale; the name settles it
  ["Blue Whale of Catoosa", wiki("Blue Whale"), 0.9],
  ["Big Texan Steak Ranch", wiki("Big Texan"), 0.95],
  ["Unscored with a page", wiki("Unscored"), null],
  ["A name that is far too long to sit under a title on a phone", wiki("Long"), 0.97],
  ["   ", wiki("Blank"), 0.98],
]);
const thin = store("thin.sqlite", [["Only One", wiki("Only One"), 0.9], ["No page", null, 0.9]]);

afterAll(() => { closeRoadsideStores(); forgetExampleNames(); rmSync(dir, { recursive: true, force: true }); });

describe("the home's example names, from the store", () => {
  it("takes the two strongest with a page, by p then by name, skipping names the line cannot hold", () => {
    expect(exampleNamesFrom(roadsideStore(full)!)).toEqual(["Big Texan Steak Ranch", "Blue Whale of Catoosa"]);
    expect("A name that is far too long to sit under a title on a phone".length).toBeGreaterThan(MAX_EXAMPLE_NAME_LENGTH);
    expect(exampleLine(homeExampleNames(full))).toBe("Places like the Big Texan Steak Ranch and the Blue Whale of Catoosa, along your road.");
  });

  it("gives the same two on every request", () => {
    expect(homeExampleNames(full)).toBe(homeExampleNames(full));
    expect(homeExampleNames(full)).toEqual(["Big Texan Steak Ranch", "Blue Whale of Catoosa"]);
  });

  it("falls back to the Cadillac Ranch and the Big Texan with no store, a missing file or fewer than two names", () => {
    expect(homeExampleNames(null)).toBe(FALLBACK_EXAMPLES);
    expect(homeExampleNames(join(dir, "nope.sqlite"))).toBe(FALLBACK_EXAMPLES);
    expect(exampleNamesFrom(roadsideStore(thin)!)).toBeNull();
    expect(homeExampleNames(thin)).toBe(FALLBACK_EXAMPLES);
    expect(FALLBACK_EXAMPLES).toEqual(["Cadillac Ranch", "the Big Texan"]);
    expect(exampleLine(homeExampleNames(null))).toBe("Places like the Cadillac Ranch and the Big Texan, along your road.");
  });
});
