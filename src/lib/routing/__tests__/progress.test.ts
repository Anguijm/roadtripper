import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { bearingDeg, makesProgress, progressToward } from "../progress";
import { haversineKm, type LatLng } from "../polyline";

// A flat little world near the equator where degrees are about 111 km, so
// the geometry cases read as distances.
const O: LatLng = { lat: 0, lng: 0 };
const D: LatLng = { lat: 0, lng: 1 };            // 111 km due east

describe("makesProgress, the geometry", () => {
  it("keeps a city on the line ahead and the destination itself", () => {
    expect(makesProgress({ lat: 0, lng: 0.5 }, O, D)).toBe(true);
    expect(makesProgress(D, O, D)).toBe(true);
  });

  it("drops a city behind, directly or at an angle", () => {
    expect(makesProgress({ lat: 0, lng: -0.5 }, O, D)).toBe(false);
    expect(makesProgress({ lat: 0.3, lng: -0.3 }, O, D)).toBe(false);
  });

  it("drops a city at right angles: it is farther from the destination than the origin is", () => {
    expect(makesProgress({ lat: 0.5, lng: 0 }, O, D)).toBe(false);
    expect(makesProgress({ lat: -0.5, lng: 0 }, O, D)).toBe(false);
  });

  it("drops a city past the destination, even though it is close to it", () => {
    const past = { lat: 0, lng: 1.2 };
    expect(haversineKm(past, D)).toBeLessThan(haversineKm(O, D));
    expect(makesProgress(past, O, D)).toBe(false);
  });

  it("keeps a forward city off to the side only while it is still closer to the destination", () => {
    expect(makesProgress({ lat: 0.3, lng: 0.7 }, O, D)).toBe(true);   // forward and a bit sideways: closer
    expect(makesProgress({ lat: 0.9, lng: 0.2 }, O, D)).toBe(false);  // barely forward, far sideways: farther
  });

  it("offers nothing when origin and destination coincide", () => {
    expect(makesProgress({ lat: 0, lng: 0.1 }, O, O)).toBe(false);
    expect(makesProgress(O, O, O)).toBe(false);
  });

  it("reports along-track distance with the sign of the direction", () => {
    expect(progressToward({ lat: 0, lng: 0.5 }, O, D).alongKm).toBeCloseTo(55.6, 0);
    expect(progressToward({ lat: 0, lng: -0.5 }, O, D).alongKm).toBeCloseTo(-55.6, 0);
    expect(Math.abs(progressToward({ lat: 0.5, lng: 0 }, O, D).alongKm)).toBeLessThan(0.5);
  });
});

describe("makesProgress, on the real atlas", () => {
  const db = new Database("data/atlas.sqlite", { readonly: true, fileMustExist: true });
  const cities = db.prepare(
    `select id, name, lat, lng from cities where lat between 24 and 50 and lng between -125 and -66`
  ).all() as Array<{ id: string; name: string; lat: number; lng: number }>;
  db.close();
  const byId = (id: string) => {
    const c = cities.find((x) => x.id === id);
    if (!c) throw new Error(`atlas has no city ${id}`);
    return c;
  };

  /** The rule this replaces, computed here so the difference is shown, not asserted. */
  function oldFanKept(city: LatLng, origin: LatLng, destination: LatLng): boolean {
    const snapped = (Math.round(bearingDeg(origin, destination) / 45) % 8) * 45;
    let diff = Math.abs(bearingDeg(origin, city) - snapped);
    if (diff > 180) diff = 360 - diff;
    return diff <= 90;
  }

  it("Amarillo to Austin: still offers Lubbock, no longer offers Wichita, which the old fan did", () => {
    const amarillo = byId("amarillo"), austin = byId("austin");
    const lubbock = byId("lubbock-tx"), wichita = byId("wichita");
    expect(makesProgress(lubbock, amarillo, austin)).toBe(true);
    expect(oldFanKept(wichita, amarillo, austin)).toBe(true);      // the old rule called Wichita "ahead"
    expect(makesProgress(wichita, amarillo, austin)).toBe(false);  // it is farther from Austin than Amarillo is
    expect(haversineKm(wichita, austin)).toBeGreaterThan(haversineKm(amarillo, austin));
  });

  it("Amarillo to Austin: everything the new rule drops from the old fan is farther from Austin than Amarillo", () => {
    const amarillo = byId("amarillo"), austin = byId("austin");
    const dropped = cities.filter((c) => oldFanKept(c, amarillo, austin) && !makesProgress(c, amarillo, austin));
    expect(dropped.length).toBeGreaterThan(0);
    for (const c of dropped) {
      const p = progressToward(c, amarillo, austin);
      expect(p.remainingKm >= p.totalKm || p.alongKm > p.totalKm).toBe(true);
    }
  });

  it("nothing behind is ever offered: a few hundred random pairs, seeded", () => {
    // Deterministic LCG so a failure is reproducible.
    let seed = 1337;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let kept = 0;
    for (let i = 0; i < 300; i++) {
      const origin = cities[Math.floor(rand() * cities.length)];
      const destination = cities[Math.floor(rand() * cities.length)];
      if (origin.id === destination.id) continue;
      const total = haversineKm(origin, destination);
      for (const c of cities) {
        const ahead = makesProgress(c, origin, destination);
        if (!ahead) continue;
        kept++;
        // closer to the destination than we are now
        expect(haversineKm(c, destination)).toBeLessThan(total);
        // and in front of us: within 90 degrees of the true line to the destination
        let diff = Math.abs(bearingDeg(origin, c) - bearingDeg(origin, destination));
        if (diff > 180) diff = 360 - diff;
        expect(diff).toBeLessThan(90);
        // and not past the destination
        expect(progressToward(c, origin, destination).alongKm).toBeLessThanOrEqual(total);
      }
    }
    expect(kept).toBeGreaterThan(1000);
  });
});
