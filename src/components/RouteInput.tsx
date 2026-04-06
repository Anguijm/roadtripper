"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import CityAutocomplete, { type CitySelection } from "./CityAutocomplete";
import DriveBudgetSelector from "./DriveBudgetSelector";

interface RouteInputProps {
  initialFrom?: CitySelection;
  initialTo?: CitySelection;
  initialBudget?: number;
}

export default function RouteInput({
  initialFrom,
  initialTo,
  initialBudget = 4,
}: RouteInputProps) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const [from, setFrom] = useState<CitySelection | null>(initialFrom ?? null);
  const [to, setTo] = useState<CitySelection | null>(initialTo ?? null);
  const [budget, setBudget] = useState(initialBudget);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = from && to && !submitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    setSubmitting(true);

    const params = new URLSearchParams({
      from: from.placeId,
      fromName: from.name,
      fromLat: from.lat.toString(),
      fromLng: from.lng.toString(),
      to: to.placeId,
      toName: to.name,
      toLat: to.lat.toString(),
      toLng: to.lng.toString(),
      budget: budget.toString(),
    });
    router.push(`/plan?${params.toString()}`);
  }

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <CityAutocomplete
          label="From"
          placeholder="Start city"
          value={from ?? undefined}
          onChange={setFrom}
        />
        <CityAutocomplete
          label="To"
          placeholder="End city"
          value={to ?? undefined}
          onChange={setTo}
        />
        <DriveBudgetSelector value={budget} onChange={setBudget} />
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 py-3 text-sm font-mono uppercase tracking-widest border bg-[#1c2128] border-[#6e7681] text-[#f0f6fc] hover:bg-[#262c36] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Calculating route..." : "Plan route"}
        </button>
      </form>
    </APIProvider>
  );
}
