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
}

export default function CityAutocomplete({
  label,
  placeholder = "Enter a city",
  value,
  onChange,
}: CityAutocompleteProps) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] =
    useState<google.maps.places.Autocomplete | null>(null);
  const [displayValue, setDisplayValue] = useState(value?.name ?? "");

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const ac = new places.Autocomplete(inputRef.current, {
      types: ["(cities)"],
      componentRestrictions: { country: "us" },
      fields: ["place_id", "name", "formatted_address", "geometry.location"],
    });
    setAutocomplete(ac);
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
        onChange={(e) => setDisplayValue(e.target.value)}
        className="bg-[#0d1117] border border-[#30363d] focus:border-[#6e7681] outline-none px-3 py-2 text-sm text-[#f0f6fc] placeholder:text-[#4a5159] font-mono"
      />
    </div>
  );
}
