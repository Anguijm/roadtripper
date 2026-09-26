import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadTrips, saveTrip, deleteTrip, MAX_SAVED_TRIPS,
  subscribeToTrips, getTripsSnapshot, getTripsServerSnapshot,
} from "../storage";
import type { SaveTripInput } from "../types";

/**
 * Replaces the coverage lost with `app/trips/actions.ts`, which tested a
 * Clerk-authenticated Firestore path that no longer exists.
 *
 * vitest runs in the `node` environment here, so there is no real localStorage.
 * A minimal in-memory stand-in is installed on globalThis, which also lets the
 * failure modes that matter (unavailable, quota) be exercised directly rather
 * than assumed.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  /** Bytes a single value may occupy. Infinity means no quota.
   *  Modelled as a size limit rather than "throw on every set", because a real
   *  QuotaExceededError still lets the tiny availability probe through, and the
   *  code must distinguish a full disk from storage being switched off. */
  byteLimit = Infinity;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (v.length > this.byteLimit) throw new DOMException("quota", "QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

let mem: MemoryStorage;

const install = (storage: unknown) => {
  (globalThis as { window?: unknown }).window = { localStorage: storage, addEventListener() {}, removeEventListener() {} };
};

const INPUT: SaveTripInput = {
  fromName: "New York", toName: "Los Angeles",
  fromLat: 40.7128, fromLng: -74.006, toLat: 34.0549, toLng: -118.2426,
  budgetHours: 4, personaId: "culture",
  stops: [{ cityId: "philadelphia", cityName: "Philadelphia", lat: 39.9526, lng: -75.1652 }],
};

beforeEach(() => {
  mem = new MemoryStorage();
  install(mem);
});

describe("trip storage", () => {
  it("round-trips a saved trip", () => {
    const res = saveTrip(INPUT, "trip-1");
    expect(res.ok).toBe(true);
    const trips = loadTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].fromName).toBe("New York");
    expect(trips[0].stops[0].cityName).toBe("Philadelphia");
  });

  it("upserts by id so a double tap does not duplicate", () => {
    saveTrip(INPUT, "same-id");
    saveTrip({ ...INPUT, toName: "San Diego" }, "same-id");
    const trips = loadTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].toName).toBe("San Diego");
  });

  it("keeps createdAt on update and moves updatedAt", () => {
    saveTrip(INPUT, "t", new Date("2026-01-01T00:00:00Z"));
    const created = loadTrips()[0].createdAt;
    saveTrip(INPUT, "t", new Date("2026-02-01T00:00:00Z"));
    const after = loadTrips()[0];
    expect(after.createdAt).toBe(created);
    expect(after.updatedAt).not.toBe(created);
  });

  it("rejects input that fails the schema", () => {
    const res = saveTrip({ ...INPUT, budgetHours: 999 }, "bad");
    expect(res).toEqual({ ok: false, error: "invalid_input" });
    expect(loadTrips()).toHaveLength(0);
  });

  it("rejects a malformed id", () => {
    expect(saveTrip(INPUT, "../../etc/passwd")).toEqual({ ok: false, error: "invalid_input" });
  });

  it("enforces the saved-trip ceiling for new ids but still allows updates", () => {
    for (let i = 0; i < MAX_SAVED_TRIPS; i++) saveTrip(INPUT, `t${i}`);
    expect(saveTrip(INPUT, "one-too-many")).toEqual({ ok: false, error: "limit_exceeded" });
    // An update to an existing trip is not a new row, so it must still work.
    expect(saveTrip({ ...INPUT, toName: "Reno" }, "t0").ok).toBe(true);
  });

  it("reports a full quota separately from storage being off", () => {
    // Small enough that the availability probe passes, small enough that a whole
    // trip does not fit. That is the shape of a real QuotaExceededError.
    mem.byteLimit = 10;
    expect(saveTrip(INPUT, "t")).toEqual({ ok: false, error: "quota" });
    expect(loadTrips()).toEqual([]);
  });

  it("reports unavailable when storage is blocked, without throwing", () => {
    install({ get length(): number { throw new Error("blocked"); },
      getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); }, clear() {}, key: () => null });
    expect(saveTrip(INPUT, "t")).toEqual({ ok: false, error: "unavailable" });
    expect(loadTrips()).toEqual([]);
    expect(deleteTrip("t")).toBe(false);
  });

  it("drops a corrupt entry rather than losing the whole list", () => {
    saveTrip(INPUT, "good");
    const raw = JSON.parse(mem.getItem("roadtripper.trips.v1")!);
    raw.push({ id: "bad", nonsense: true });
    mem.setItem("roadtripper.trips.v1", JSON.stringify(raw));
    const trips = loadTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].id).toBe("good");
  });

  it("preserves an entry it cannot parse across a save and a delete", () => {
    // A newer app version, or tampering, can leave an entry this schema does
    // not recognise. Hiding it from the list is fine; destroying it on the next
    // unrelated write is not. This is the case council blocked on.
    saveTrip(INPUT, "good");
    const raw = JSON.parse(mem.getItem("roadtripper.trips.v1")!);
    raw.push({ id: "from-the-future", schemaVersion: 2, payload: "keep me" });
    mem.setItem("roadtripper.trips.v1", JSON.stringify(raw));

    expect(saveTrip(INPUT, "another").ok).toBe(true);
    expect(deleteTrip("good")).toBe(true);

    const after = JSON.parse(mem.getItem("roadtripper.trips.v1")!) as Array<Record<string, unknown>>;
    expect(after.some((e) => e.id === "from-the-future" && e.payload === "keep me")).toBe(true);
    expect(loadTrips().map((t) => t.id)).toEqual(["another"]);
  });

  it("supersedes an unparseable entry that shares the id being written or deleted", () => {
    // Council on #47: preserving opaque entries unconditionally left two rows
    // under one id after a save, and a delete left the opaque one behind.
    mem.setItem("roadtripper.trips.v1", JSON.stringify([{ id: "shared", schemaVersion: 2, junk: true }]));
    expect(saveTrip(INPUT, "shared").ok).toBe(true);
    let all = JSON.parse(mem.getItem("roadtripper.trips.v1")!) as Array<{ id?: string; junk?: boolean }>;
    expect(all.filter((e) => e.id === "shared")).toHaveLength(1);
    expect(all.some((e) => e.junk === true)).toBe(false);
    expect(deleteTrip("shared")).toBe(true);
    all = JSON.parse(mem.getItem("roadtripper.trips.v1")!);
    expect(all.filter((e) => e.id === "shared")).toHaveLength(0);
  });

  it("does not count unparseable entries toward the saved-trip cap", () => {
    for (let i = 0; i < MAX_SAVED_TRIPS - 1; i++) saveTrip(INPUT, `t${i}`);
    const raw = JSON.parse(mem.getItem("roadtripper.trips.v1")!);
    raw.push({ nonsense: true }, { nonsense: true });
    mem.setItem("roadtripper.trips.v1", JSON.stringify(raw));
    // 49 real trips plus 2 opaque ones: one more real save must still fit.
    expect(saveTrip(INPUT, "fits").ok).toBe(true);
  });

  it("survives junk in the key entirely", () => {
    mem.setItem("roadtripper.trips.v1", "{not json");
    expect(loadTrips()).toEqual([]);
    mem.setItem("roadtripper.trips.v1", JSON.stringify({ notAnArray: true }));
    expect(loadTrips()).toEqual([]);
  });

  it("deletes only the requested trip", () => {
    saveTrip(INPUT, "keep");
    saveTrip(INPUT, "drop");
    expect(deleteTrip("drop")).toBe(true);
    expect(loadTrips().map((t) => t.id)).toEqual(["keep"]);
  });

  it("returns a stable snapshot until something changes it", () => {
    saveTrip(INPUT, "a");
    const first = getTripsSnapshot();
    // Referential stability is what stops useSyncExternalStore looping forever.
    expect(getTripsSnapshot()).toBe(first);
    saveTrip(INPUT, "b");
    expect(getTripsSnapshot()).not.toBe(first);
    expect(getTripsSnapshot()).toHaveLength(2);
  });

  it("notifies subscribers on write and stops after unsubscribe", () => {
    const seen = vi.fn();
    const unsubscribe = subscribeToTrips(seen);
    saveTrip(INPUT, "a");
    expect(seen).toHaveBeenCalledTimes(1);
    deleteTrip("a");
    expect(seen).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveTrip(INPUT, "b");
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("gives the server an empty, stable snapshot", () => {
    expect(getTripsServerSnapshot()).toEqual([]);
    expect(getTripsServerSnapshot()).toBe(getTripsServerSnapshot());
  });
});
