"use client";

import { useState } from "react";
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
}

/**
 * The question. Where are you, how long have you got, who are you today.
 * Location fills on its own once permission is granted; before that it is
 * one tap, or a typed city. Go sends the answer to the server-rendered
 * results, which read only the atlas.
 */
export default function TodayStart({ initialHours, initialPersonaId }: TodayStartProps) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const [origin, setOrigin] = useState<CitySelection | null>(null);
  const [hours, setHours] = useState<HoursPreset>(initialHours);
  const [persona, setPersona] = useState<PersonaId>(initialPersonaId);
  const located = useLocatedOrigin(setOrigin);

  function go() {
    if (!origin) return;
    const params = new URLSearchParams({
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
        <div className="flex flex-col gap-2">
          <p className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">Where are you</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void located.locate()}
              disabled={located.status.kind === "locating"}
              className="min-h-[44px] px-3 text-xs font-mono uppercase tracking-widest border border-[#30363d] hover:border-[#6e7681] text-[#b0b9c2] hover:text-[#f0f6fc] disabled:opacity-40 disabled:cursor-wait transition-colors focus:outline-none focus:border-[#f0f6fc]"
            >
              Use where I am
            </button>
            <p
              className={`text-xs font-mono ${located.status.kind === "error" ? "text-[#ff7b72]" : "text-[#8b949e]"}`}
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
          <legend className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2] mb-1">
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
                  className={`flex-1 min-h-[44px] text-sm font-mono border transition-colors ${
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
          <p className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">Today I am a</p>
          <PersonaSelector activePersonaId={persona} onChange={setPersona} />
        </div>

        <button
          type="submit"
          disabled={!origin}
          className="mt-1 min-h-[44px] py-3 text-sm font-mono uppercase tracking-widest border bg-[#1c2128] border-[#6e7681] text-[#f0f6fc] hover:bg-[#262c36] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {origin ? `Show me what is within ${hours} hours` : "Pick where you are first"}
        </button>
      </form>
    </APIProvider>
  );
}
