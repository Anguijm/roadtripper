"use client";

import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

export interface CitySelection {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

interface CityAutocompleteProps {
  label: string;
  placeholder?: string;
  value?: CitySelection;
  onChange: (city: CitySelection | null) => void;
  /** Fires on every keystroke, before any place is chosen. The route form
   *  uses it to drop a location fix that lands while the user is typing. */
  onTyping?: () => void;
}

export default function CityAutocomplete({
  label,
  placeholder = "Enter a city",
  value,
  onChange,
  onTyping,
}: CityAutocompleteProps) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] =
    useState<google.maps.places.Autocomplete | null>(null);
  const [displayValue, setDisplayValue] = useState(value?.name ?? "");
  // The box shows what the user types until a place is chosen, so the text
  // is local state. When the parent hands in a different selection (a
  // located origin, a saved trip), the text follows it. This is React's
  // "adjust state when a prop changes" pattern: compare against the last
  // prop seen and set during render, which React applies before painting.
  // Not an effect (a frame late, and the set-state-in-effect rule), and not
  // a key on the component (which would remount the input and drop focus).
  const [seen, setSeen] = useState({ placeId: value?.placeId, name: value?.name });
  if (value?.placeId !== seen.placeId || value?.name !== seen.name) {
    setSeen({ placeId: value?.placeId, name: value?.name });
    setDisplayValue(value?.name ?? "");
  }

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const ac = new places.Autocomplete(inputRef.current, {
      types: ["(cities)"],
      componentRestrictions: { country: "us" },
      fields: ["place_id", "name", "formatted_address", "geometry.location"],
    });
    setAutocomplete(ac);
    // The widget attaches listeners to the input and to the document for its
    // dropdown. Detach them when the component goes, or they outlive it.
    // `google` is read only here, inside an effect that runs after the
    // places library has loaded, never during render.
    return () => {
      google.maps.event.clearInstanceListeners(ac);
    };
  }, [places]);

  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location || !place.place_id) {
        onChange(null);
        return;
      }
      const selection: CitySelection = {
        placeId: place.place_id,
        name: place.name ?? place.formatted_address ?? "",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
      setDisplayValue(selection.name);
      onChange(selection);
    });

    return () => listener.remove();
  }, [autocomplete, onChange]);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
        {label}
      </label>
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => { onTyping?.(); setDisplayValue(e.target.value); }}
        className="bg-[#0d1117] border border-[#30363d] focus:border-[#6e7681] outline-none px-3 py-2 text-sm text-[#f0f6fc] placeholder:text-[#4a5159] font-mono"
      />
    </div>
  );
}
