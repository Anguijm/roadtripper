import { describe, it, expect } from "vitest";
import {
  locate,
  locateAndSnap,
  locateFailureMessage,
  originLabel,
  permissionState,
  LocateError,
  LOCATE_TIMEOUT_MS,
  LOCATE_MAX_AGE_MS,
  type GeolocationLike,
  type SnapResult,
} from "../locate";

const AMARILLO = { lat: 35.222, lng: -101.8313 };

/** A fake phone that answers with a fixed position, or a fixed error code. */
function fakeGeo(answer: { pos: { lat: number; lng: number; accuracy?: number } } | { errorCode: number }): GeolocationLike & { options?: unknown } {
  const geo: GeolocationLike & { options?: unknown } = {
    getCurrentPosition(success, error, options) {
      geo.options = options;
      if ("pos" in answer) {
        success({ coords: { latitude: answer.pos.lat, longitude: answer.pos.lng, accuracy: answer.pos.accuracy ?? 50 } });
      } else {
        error?.({ code: answer.errorCode });
      }
    },
  };
  return geo;
}

describe("locate", () => {
  it("resolves the position and asks for a cheap, bounded fix", async () => {
    const geo = fakeGeo({ pos: { ...AMARILLO, accuracy: 30 } });
    const p = await locate(geo);
    expect(p).toEqual({ lat: AMARILLO.lat, lng: AMARILLO.lng, accuracyM: 30 });
    expect(geo.options).toEqual({ enableHighAccuracy: false, timeout: LOCATE_TIMEOUT_MS, maximumAge: LOCATE_MAX_AGE_MS });
  });

  it("maps the three browser error codes to typed failures", async () => {
    for (const [code, expected] of [[1, "denied"], [2, "unavailable"], [3, "timeout"], [99, "unavailable"]] as const) {
      const err = await locate(fakeGeo({ errorCode: code })).catch((e) => e);
      expect(err).toBeInstanceOf(LocateError);
      expect(err.code).toBe(expected);
    }
  });

  it("fails as unsupported when there is no geolocation object at all", async () => {
    const err = await locate(undefined).catch((e) => e);
    expect(err).toBeInstanceOf(LocateError);
    expect(err.code).toBe("unsupported");
  });
});

describe("permissionState", () => {
  it("passes granted, denied and prompt through", async () => {
    for (const state of ["granted", "denied", "prompt"]) {
      expect(await permissionState({ query: async () => ({ state }) })).toBe(state);
    }
  });

  it("is unknown without the Permissions API, on a strange state, or when the query throws", async () => {
    expect(await permissionState(undefined)).toBe("unknown");
    expect(await permissionState({ query: async () => ({ state: "weird" }) })).toBe("unknown");
    expect(await permissionState({ query: async () => { throw new Error("no"); } })).toBe("unknown");
  });
});

describe("originLabel", () => {
  it("names the city inside 3 km, says Near beyond it, and Your location with no city", () => {
    expect(originLabel({ city: { name: "Amarillo" }, distanceKm: 1.2 })).toBe("Amarillo");
    expect(originLabel({ city: { name: "Amarillo" }, distanceKm: 3.0 })).toBe("Amarillo");
    expect(originLabel({ city: { name: "Amarillo" }, distanceKm: 3.1 })).toBe("Near Amarillo");
    expect(originLabel(null)).toBe("Your location");
  });
});

describe("locateAndSnap", () => {
  const snapTo = (result: SnapResult) => async () => result;

  it("uses the exact coordinates as the origin and the snapped city as the label", async () => {
    const { selection, label } = await locateAndSnap({
      geolocation: fakeGeo({ pos: { lat: 35.25, lng: -101.85 } }),
      snap: snapTo({ ok: true, snap: { city: { id: "amarillo", name: "Amarillo", ...AMARILLO }, distanceKm: 3.6 } }),
    });
    expect(label).toBe("Near Amarillo");
    expect(selection).toEqual({ placeId: "geo:35.25000,-101.85000", name: "Near Amarillo", lat: 35.25, lng: -101.85 });
  });

  it("still yields an origin called Your location when the snap finds nothing, fails, or throws", async () => {
    const geo = fakeGeo({ pos: { lat: 44.0, lng: -110.0 } });
    for (const snap of [
      snapTo({ ok: true, snap: null }),
      snapTo({ ok: false, code: "rate_limited" }),
      async () => { throw new Error("network"); },
    ]) {
      const { selection, label } = await locateAndSnap({ geolocation: geo, snap });
      expect(label).toBe("Your location");
      expect(selection.lat).toBe(44.0);
      expect(selection.lng).toBe(-110.0);
    }
  });

  it("does not call the snap when there is no position", async () => {
    let called = false;
    const err = await locateAndSnap({
      geolocation: fakeGeo({ errorCode: 1 }),
      snap: async () => { called = true; return { ok: true, snap: null }; },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(LocateError);
    expect(called).toBe(false);
  });
});

describe("locateFailureMessage", () => {
  it("gives one plain line per failure and always says what to do instead", () => {
    for (const code of ["denied", "timeout", "unsupported", "unavailable"] as const) {
      const msg = locateFailureMessage(new LocateError(code));
      expect(msg).toMatch(/Type your start city\.$/);
      expect(msg.split(". ").length).toBeLessThanOrEqual(2);
    }
    expect(locateFailureMessage(new Error("anything else"))).toMatch(/Could not get your location/);
  });
});
