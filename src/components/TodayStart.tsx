"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import CityAutocomplete, { type CitySelection } from "./CityAutocomplete";
import PersonaSelector from "./PersonaSelector";
import { useLocatedOrigin } from "./useLocatedOrigin";
import { HOURS_PRESETS, type HoursPreset } from "@/lib/today/presets";
import type { PersonaId } from "@/lib/personas/types";

interface TodayStartProps {
  initialHours: HoursPreset;
  initialPersonaId: PersonaId;
  /** Extra URL parameters to keep through Go: the deadline and its destination. */
  carry?: Record<string, string>;
  /** "Arrive in Austin by Oct 14, 6 days left", when the link carried one. */
  deadlineText?: string | null;
}

/**
 * The question. Where are you, how long have you got, what are you in the
 * mood for. Location fills on its own once permission is granted; before
 * that it is one tap, or a typed city. Go sends the answer to the
 * server-rendered results, which read only the atlas.
 */
export default function TodayStart({ initialHours, initialPersonaId, carry, deadlineText }: TodayStartProps) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const [origin, setOrigin] = useState<CitySelection | null>(null);
  const [hours, setHours] = useState<HoursPreset>(initialHours);
  const [persona, setPersona] = useState<PersonaId>(initialPersonaId);
  const [submitting, setSubmitting] = useState(false);
  const located = useLocatedOrigin(setOrigin);

  // router.push never rejects, so a navigation that stalls (offline, a slow
  // server) would leave the button on "Looking..." forever. Ten seconds is
  // longer than a normal transition; after it the button comes back and a
  // second tap is harmless, since it pushes the same URL.
  useEffect(() => {
    if (!submitting) return;
    const t = setTimeout(() => setSubmitting(false), 10_000);
    return () => clearTimeout(t);
  }, [submitting]);

  function go() {
    if (!origin || submitting) return;
    setSubmitting(true);
    const params = new URLSearchParams({
      ...(carry ?? {}),
      lat: origin.lat.toString(),
      lng: origin.lng.toString(),
      hours: hours.toString(),
      persona,
      name: origin.name,
    });
    router.push(`/today?${params.toString()}`);
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <form
        onSubmit={(e) => { e.preventDefault(); go(); }}
        className="flex flex-col gap-5"
      >
        {deadlineText && (
          <p className="text-base text-[#f0f6fc]" role="status">{deadlineText}</p>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-base text-[#b0b9c2]">Where are you</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void located.locate()}
              disabled={located.status.kind === "locating"}
              className="min-h-[44px] px-3 text-base border border-[#30363d] hover:border-[#6e7681] text-[#b0b9c2] hover:text-[#f0f6fc] disabled:opacity-40 disabled:cursor-wait transition-colors focus:outline-none focus:border-[#f0f6fc]"
            >
              Use where I am
            </button>
            <p
              className={`text-base ${located.status.kind === "error" ? "text-[#ff7b72]" : "text-[#8b949e]"}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {located.status.message}
            </p>
          </div>
          <CityAutocomplete
            label="Or type a city"
            placeholder="City"
            value={origin ?? undefined}
            onChange={(city) => { located.noteManualChange(); setOrigin(city); }}
            onTyping={located.noteManualChange}
          />
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-base text-[#b0b9c2] mb-1">
            I have
          </legend>
          <div className="flex gap-1">
            {HOURS_PRESETS.map((h) => {
              const active = hours === h;
              return (
                <button
                  key={h}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setHours(h)}
                  className={`flex-1 min-h-[44px] text-base num border transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none ${
                    active
                      ? "bg-[#1c2128] border-[#6e7681] text-[#f0f6fc]"
                      : "bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:border-[#3d444d] hover:text-[#b0b9c2]"
                  }`}
                >
                  {`${h} h`}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          {/* The glossary's words for "persona" (quality bar, rule 1). */}
          <p className="text-base text-[#b0b9c2]">I&apos;m in the mood for</p>
          <PersonaSelector activePersonaId={persona} onChange={setPersona} />
        </div>

        {/* The one obvious action (quality bar, rule 3): the button keeps
            its verb, and when it cannot be pressed the reason is the line
            under it, not the button's own label. */}
        <button
          type="submit"
          disabled={!origin || submitting}
          className="mt-1 min-h-[44px] py-3 text-base border bg-[#1c2128] border-[#6e7681] text-[#f0f6fc] hover:bg-[#262c36] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          {submitting ? "Looking..." : "Show me what's in range"}
        </button>
        <p className="text-base text-[#8b949e] -mt-3 min-h-6" aria-live="polite" aria-atomic="true">
          {origin || submitting ? "" : "Choose where you are first"}
        </p>
      </form>
    </APIProvider>
  );
}
