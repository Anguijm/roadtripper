"use client";

import { useState, useEffect, useRef } from "react";
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

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
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
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const dateOrderValid = !startDate || !endDate || startDate <= endDate;
  const canSubmit = from && to && startDate && endDate && dateOrderValid && !submitting;

  const tripDays =
    startDate && endDate && dateOrderValid
      ? totalDays({ startDate, endDate })
      : null;
  const budgetHrs =
    tripDays !== null ? totalBudgetMinutes({ startDate, endDate: endDate, dailyBudgetHours: budget }) / 60 : null;

  useEffect(() => {
    if (!dateDialogOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDateDialogOpen(false);
    }
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [dateDialogOpen]);

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

  const dateLabel =
    startDate && endDate
      ? `${formatDateLabel(startDate)} → ${formatDateLabel(endDate)}`
      : startDate
      ? `${formatDateLabel(startDate)} → ?`
      : "Select dates";

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

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">
            Trip dates
          </label>
          <button
            type="button"
            onClick={() => setDateDialogOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={dateDialogOpen}
            className="min-h-[44px] px-3 py-2 text-sm font-mono bg-[#1c2128] border border-[#8b949e] text-[#f0f6fc] text-left focus:outline-none focus:border-[#f0f6fc] hover:border-[#f0f6fc] transition-colors"
          >
            {dateLabel}
          </button>
        </div>

        {dateDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
            role="presentation"
          >
            <div
              className="absolute inset-0 bg-black/60"
              aria-hidden="true"
              onClick={() => setDateDialogOpen(false)}
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Select trip dates"
              tabIndex={-1}
              className="relative bg-[#161b22] border border-[#30363d] w-full sm:max-w-sm p-6 flex flex-col gap-4 focus:outline-none"
            >
              <p className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2]">
                Trip dates
              </p>
              <div className="flex gap-3">
                <div className="flex-1 flex flex-col gap-1">
                  <label
                    htmlFor="trip-start-date"
                    className="text-xs font-mono uppercase tracking-widest text-[#7d8590]"
                  >
                    Start
                  </label>
                  <input
                    id="trip-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="min-h-[44px] py-2 px-3 text-sm font-mono bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label
                    htmlFor="trip-end-date"
                    className="text-xs font-mono uppercase tracking-widest text-[#7d8590]"
                  >
                    End
                  </label>
                  <input
                    id="trip-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-h-[44px] py-2 px-3 text-sm font-mono bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
                  />
                </div>
              </div>
              {!dateOrderValid && (
                <p className="text-xs font-mono text-[#f85149]" role="alert">
                  End date must be on or after start date.
                </p>
              )}
              <button
                type="button"
                onClick={() => setDateDialogOpen(false)}
                className="min-h-[44px] text-sm font-mono uppercase tracking-widest border border-[#30363d] hover:border-[#6e7681] text-[#f0f6fc] transition-colors focus:outline-none focus:border-[#f0f6fc]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        <p
          className="text-xs font-mono text-[#b0b9c2]"
          aria-live="polite"
          aria-atomic="true"
        >
          {tripDays !== null && budgetHrs !== null
            ? `${tripDays} ${tripDays === 1 ? "day" : "days"} · ${budget} hrs/day · ${budgetHrs} total drive hours`
            : " "}
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
