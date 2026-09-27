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
 * The user always wins. A fix can take up to ten seconds; if the user types
 * or picks a city in that window, the fix is dropped when it lands rather
 * than overwriting what they chose. The form reports those edits through
 * `noteManualChange`. A fix that lands after the form is gone is dropped too.
 *
 * Browser globals are read only inside the effect and the handler, never
 * during render, so this is safe to server-render.
 */
export function useLocatedOrigin(onLocated: (selection: OriginSelection) => void) {
  const [status, setStatus] = useState<LocateStatus>({ kind: "idle", message: "" });
  const busy = useRef(false);
  const mounted = useRef(false);
  const manualEdits = useRef(0);
  // The callback lives in a ref, synced after each render, so `run` and the
  // mount effect depend on nothing that changes. A caller passing an inline
  // function would otherwise re-arm the mount effect on every render and
  // query permission again each time. (Written in an effect, not during
  // render, which is what the react-hooks/refs rule requires.)
  const onLocatedRef = useRef(onLocated);
  useEffect(() => {
    onLocatedRef.current = onLocated;
  }, [onLocated]);

  const noteManualChange = useCallback(() => {
    manualEdits.current += 1;
  }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const editsWhenStarted = manualEdits.current;
    // Neither getCurrentPosition nor a server action can be cancelled, so
    // "abort" here means: when the answer lands, check whether anyone still
    // wants it. Gone from the page, or the user typed meanwhile: it is stale,
    // and neither a city nor an error message may land on top of them.
    const stale = () => !mounted.current || manualEdits.current !== editsWhenStarted;
    setStatus({ kind: "locating", message: "Finding you." });
    try {
      const { selection, label } = await locateAndSnap({
        geolocation: navigator.geolocation,
        snap: (p) => snapOriginAction(p),
      });
      if (stale()) {
        if (mounted.current) setStatus({ kind: "idle", message: "" });
        return;
      }
      onLocatedRef.current(selection);
      setStatus({ kind: "located", message: label });
    } catch (err) {
      if (stale()) {
        if (mounted.current) setStatus({ kind: "idle", message: "" });
        return;
      }
      setStatus({ kind: "error", message: locateFailureMessage(err) });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const permissions = typeof navigator === "undefined" ? undefined : navigator.permissions;
    void permissionState(permissions).then((state) => {
      if (mounted.current && state === "granted") void run();
    });
    return () => { mounted.current = false; };
  }, [run]);

  return { status, locate: run, noteManualChange };
}
