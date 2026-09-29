"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  /** A control inside the field's box at its right end: the home's "Where I
   *  am" (Gauntlet U4). It sits beside the input, never over the text. */
  trailing?: ReactNode;
}

export default function CityAutocomplete({
  label,
  placeholder = "Enter a city",
  value,
  onChange,
  onTyping,
  trailing,
}: CityAutocompleteProps) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
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
      {/* Sentence case in the body face, 16 px, and the box the same: a
          typed city name is a name, not a code (quality bar, rule 2). The
          label points at the input by id rather than wrapping it, so a
          control inside the box is its own target and not a second way to
          focus the input. */}
      <label htmlFor={inputId} className="text-base text-[#b0b9c2]">
        {label}
      </label>
      {/* The box carries the border, so a trailing control sits inside it
          at the right end and the typed text stops where the control
          starts; the focus colour follows the input through the box. The
          44 px (quality bar, rule 7) is on the input itself, not on the
          box: the box is the input plus 1 px of border each side, 46 px,
          the same with or without a control in it. Round 1 had the 44 on
          the box, and the critic measured the To input at 42 inside a 44
          px box beside a From input held to 44 by its control, in a 46. */}
      <div className="flex items-stretch bg-[#0d1117] border border-[#30363d] focus-within:border-[#6e7681]">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => { onTyping?.(); setDisplayValue(e.target.value); }}
          className="flex-1 min-w-0 min-h-[44px] bg-transparent outline-none px-3 py-2 text-base text-[#f0f6fc] placeholder:text-[#6e7681]"
        />
        {trailing}
      </div>
    </div>
  );
}
