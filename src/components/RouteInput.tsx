"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import CityAutocomplete, { type CitySelection } from "./CityAutocomplete";
import DriveBudgetSelector from "./DriveBudgetSelector";
import { totalDays, totalBudgetMinutes } from "@/lib/plan/types";

interface RouteInputProps {
  initialFrom?: CitySelection;
  initialTo?: CitySelection;
  initialBudget?: number;
  initialStartDate?: string;
  initialEndDate?: string;
}

export default function RouteInput({
  initialFrom,
  initialTo,
  initialBudget = 4,
  initialStartDate = "",
  initialEndDate = "",
}: RouteInputProps) {
  const router = useRouter();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
  const [from, setFrom] = useState<CitySelection | null>(initialFrom ?? null);
  const [to, setTo] = useState<CitySelection | null>(initialTo ?? null);
  const [budget, setBudget] = useState(initialBudget);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [submitting, setSubmitting] = useState(false);

  const dateOrderValid = !startDate || !endDate || startDate <= endDate;
  const canSubmit = from && to && startDate && endDate && dateOrderValid && !submitting;

  const tripDays =
    startDate && endDate && dateOrderValid
      ? totalDays({ startDate, endDate })
      : null;
  const budgetHrs =
    tripDays !== null ? totalBudgetMinutes({ startDate, endDate: endDate, dailyBudgetHours: budget }) / 60 : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || !startDate || !endDate) return;
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
      startDate,
      endDate,
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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="min-h-[44px] py-3 px-3 text-sm font-mono bg-[#1c2128] border border-[#8b949e] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">
              End date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="min-h-[44px] py-3 px-3 text-sm font-mono bg-[#1c2128] border border-[#8b949e] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
            />
          </div>
        </div>
        {!dateOrderValid && (
          <p className="text-xs font-mono text-[#f85149]" role="alert">
            End date must be on or after start date.
          </p>
        )}
        <p
          className="text-xs font-mono text-[#b0b9c2]"
          aria-live="polite"
          aria-atomic="true"
        >
          {tripDays !== null && budgetHrs !== null
            ? `${tripDays} ${tripDays === 1 ? "day" : "days"} · ${budget} hrs/day · ${budgetHrs} total drive hours`
            : " "}
        </p>
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
