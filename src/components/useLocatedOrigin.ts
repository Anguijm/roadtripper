"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  locateAndSnap,
  locateFailureMessage,
  permissionState,
  type OriginSelection,
} from "@/lib/geo/locate";
import { snapOriginAction } from "@/app/actions/snapOrigin";

export interface LocateStatus {
  kind: "idle" | "locating" | "located" | "error";
  /** Spoken as-is by screen readers; keep it one plain line. */
  message: string;
}

/**
 * Fills the From field from the phone.
 *
 * Two paths. When the browser already has permission, it locates on mount so
 * the page opens knowing your city. Otherwise it waits for the button, because
 * a location prompt nobody asked for is the fastest way to get it denied for
 * good, and Safari will not show one without a gesture anyway.
 *
 * Browser globals are read only inside the effect and the handler, never
 * during render, so this is safe to server-render.
 */
export function useLocatedOrigin(onLocated: (selection: OriginSelection) => void) {
  const [status, setStatus] = useState<LocateStatus>({ kind: "idle", message: "" });
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: "locating", message: "Finding you." });
    try {
      const { selection, label } = await locateAndSnap({
        geolocation: navigator.geolocation,
        snap: (p) => snapOriginAction(p),
      });
      onLocated(selection);
      setStatus({ kind: "located", message: label });
    } catch (err) {
      setStatus({ kind: "error", message: locateFailureMessage(err) });
    } finally {
      busy.current = false;
    }
  }, [onLocated]);

  useEffect(() => {
    let cancelled = false;
    const permissions = typeof navigator === "undefined" ? undefined : navigator.permissions;
    void permissionState(permissions).then((state) => {
      if (!cancelled && state === "granted") void run();
    });
    return () => { cancelled = true; };
  }, [run]);

  return { status, locate: run };
}
