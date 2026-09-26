import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { allCities, haversineKm } from "../queries";

/**
 * Properties the shipped atlas must hold, checked against the real file.
 *
 * These assert outcomes rather than mechanisms, so they keep working if the
 * export is rewritten. Each one exists because it was violated at some point:
 * duplicates were 13.9% of US waypoints, and a re-export silently destroyed the
 * drive graph because the atomic rename swapped in a database that never had it.
 */
const open = () => new Database("data/atlas.sqlite", { readonly: true });

describe("atlas invariants", () => {
  it("has no same-name duplicates within 2 km in one city", () => {
    const db = open();
    const rows = db.prepare<[], { city_id: string; name: string; lat: number; lng: number }>(
      "select city_id, name, lat, lng from waypoints"
    ).all();
    db.close();

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.city_id}|${r.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
      const g = groups.get(k);
      if (g) g.push(r); else groups.set(k, [r]);
    }
    const offenders: string[] = [];
    for (const [k, g] of groups) {
      if (g.length < 2) continue;
      for (let i = 0; i < g.length; i++)
        for (let j = i + 1; j < g.length; j++)
          if (haversineKm(g[i], g[j]) <= 2) offenders.push(`${k} (${haversineKm(g[i], g[j]).toFixed(2)}km)`);
    }
    expect(offenders.slice(0, 5), `${offenders.length} colocated duplicates remain`).toEqual([]);
  });

  it("keeps genuinely distant same-name places as separate rows", () => {
    // The dedupe must not be so eager that two real branches become one. 2 km
    // was chosen because only a handful of groups exceed it.
    const db = open();
    const far = db.prepare<[], { c: number }>(
      `select count(*) c from waypoints a join waypoints b
        on a.city_id = b.city_id and lower(a.name) = lower(b.name) and a.rowid < b.rowid`
    ).get()!.c;
    db.close();
    expect(far).toBeGreaterThan(0);
  });

  it("carries a drive-time table that opens read-write", () => {
    // Read-write specifically: a stranded -wal from a previous database makes
    // SQLite report "disk image is malformed" here while a readonly open and
    // integrity_check both look fine.
    const db = new Database("data/atlas.sqlite");
    expect(() => db.prepare("select count(*) from city_drive_times").get()).not.toThrow();
    const check = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    expect(check[0].integrity_check).toBe("ok");
    db.close();
  });

  it("gives every waypoint a city that exists", () => {
    const db = open();
    const orphans = db.prepare<[], { c: number }>(
      `select count(*) c from waypoints w left join cities c on c.id = w.city_id where c.id is null`
    ).get()!.c;
    db.close();
    expect(orphans).toBe(0);
  });

  it("points every drive-time row at cities that exist", () => {
    const db = open();
    const orphans = db.prepare<[], { c: number }>(
      `select count(*) c from city_drive_times d
        where d.from_city_id not in (select id from cities)
           or d.to_city_id not in (select id from cities)`
    ).get()!.c;
    db.close();
    expect(orphans).toBe(0);
  });

  it("still covers the road-trip towns after deduping", () => {
    const names = new Set(allCities().map((c) => c.name));
    for (const n of ["Amarillo", "Winslow", "Marfa", "Albuquerque", "Los Angeles"]) {
      expect(names, `${n} lost`).toContain(n);
    }
  });
});
