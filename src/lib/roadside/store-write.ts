/**
 * Writing stops into the store without losing what was paid for.
 *
 * The first builder replaced the table on every rebuild, which would have
 * thrown away every description fetched and every score bought. A rebuild
 * (a new extract, a new tag) now upserts: a stop that is already there
 * keeps its encyclopedia lines and its score unless the part of the record
 * the model saw changed (name, kind, what the map says), in which case the
 * score is cleared to be bought again; the lines are cleared only when the
 * link they came from changed. Stops no longer in the extract are removed.
 */

import type Database from "better-sqlite3";
import type { RoadsideStop } from "./record";

export const STORE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS roadside_stop (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT,
    wikidata TEXT,
    wikipedia TEXT,
    short TEXT,
    extract TEXT,
    url TEXT,
    described_at TEXT,
    p REAL,
    scored_at TEXT
  );
  CREATE INDEX IF NOT EXISTS roadside_stop_lat_lng ON roadside_stop (lat, lng);
  CREATE INDEX IF NOT EXISTS roadside_stop_kind ON roadside_stop (kind);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

// The "unchanged" test is an exact compare of name, kind and the map's
// line, because those three are the model's state: any change to them is
// a different question and the old answer must not stand. The cost of
// being exact is that a mapper fixing a typo in a name clears a score that
// was fine, and rebuying it is about $0.0002 (a fiftieth of a cent). The
// alternative, a fuzzy compare, would keep answers to questions that
// were never asked. The lines from the encyclopedias key only on the links
// they came from. All of this is pinned in __tests__/store-write.test.ts.
const UPSERT = `
  INSERT INTO roadside_stop (id, name, lat, lng, kind, detail, wikidata, wikipedia)
  VALUES (@id, @name, @lat, @lng, @kind, @detail, @wikidata, @wikipedia)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, lat = excluded.lat, lng = excluded.lng, kind = excluded.kind,
    detail = excluded.detail, wikidata = excluded.wikidata, wikipedia = excluded.wikipedia,
    p = CASE WHEN roadside_stop.name = excluded.name AND roadside_stop.kind = excluded.kind
              AND coalesce(roadside_stop.detail, '') = coalesce(excluded.detail, '')
         THEN roadside_stop.p ELSE NULL END,
    scored_at = CASE WHEN roadside_stop.name = excluded.name AND roadside_stop.kind = excluded.kind
              AND coalesce(roadside_stop.detail, '') = coalesce(excluded.detail, '')
         THEN roadside_stop.scored_at ELSE NULL END,
    short = CASE WHEN coalesce(roadside_stop.wikidata, '') = coalesce(excluded.wikidata, '')
              AND coalesce(roadside_stop.wikipedia, '') = coalesce(excluded.wikipedia, '')
         THEN roadside_stop.short ELSE NULL END,
    extract = CASE WHEN coalesce(roadside_stop.wikidata, '') = coalesce(excluded.wikidata, '')
              AND coalesce(roadside_stop.wikipedia, '') = coalesce(excluded.wikipedia, '')
         THEN roadside_stop.extract ELSE NULL END,
    url = CASE WHEN coalesce(roadside_stop.wikidata, '') = coalesce(excluded.wikidata, '')
              AND coalesce(roadside_stop.wikipedia, '') = coalesce(excluded.wikipedia, '')
         THEN roadside_stop.url ELSE NULL END,
    described_at = CASE WHEN coalesce(roadside_stop.wikidata, '') = coalesce(excluded.wikidata, '')
              AND coalesce(roadside_stop.wikipedia, '') = coalesce(excluded.wikipedia, '')
         THEN roadside_stop.described_at ELSE NULL END`;

export interface StoreWriter {
  /** Upsert a batch in one transaction and remember the ids as seen. */
  write(stops: readonly RoadsideStop[]): void;
  /** How many distinct ids this run has written. */
  seen(): number;
  /**
   * Remove every stop not written during this run and return how many.
   * Refuses, throwing, when fewer than `minSeen` ids were written: an
   * empty or truncated extract must not wipe the store, and the caller
   * says what "too few" is (the builder uses half the rows already there).
   */
  removeUnseen(minSeen: number): number;
}

/**
 * A writer for one rebuild. Ids are collected in a temporary table rather
 * than in memory: a rebuild of the country is a third of a million ids.
 */
export function storeWriter(db: Database.Database): StoreWriter {
  db.exec(STORE_SCHEMA);
  db.exec("CREATE TEMP TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY); DELETE FROM seen");
  const upsert = db.prepare(UPSERT);
  const see = db.prepare("INSERT OR IGNORE INTO seen (id) VALUES (?)");
  const writeMany = db.transaction((stops: readonly RoadsideStop[]) => {
    for (const s of stops) {
      upsert.run({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, kind: s.kind, detail: s.detail, wikidata: s.wikidata, wikipedia: s.wikipedia });
      see.run(s.id);
    }
  });
  const seen = () => (db.prepare("SELECT COUNT(*) AS n FROM seen").get() as { n: number }).n;
  return {
    write: (stops) => writeMany(stops),
    seen,
    removeUnseen: (minSeen) => {
      const n = seen();
      if (n < minSeen) throw new Error(`refusing to remove unseen stops: only ${n.toLocaleString()} written this run, under the floor of ${minSeen.toLocaleString()}; is the extract empty or truncated?`);
      return db.prepare("DELETE FROM roadside_stop WHERE id NOT IN (SELECT id FROM seen)").run().changes;
    },
  };
}
