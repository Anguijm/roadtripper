"use client";

import { useState, useEffect, useRef, useId } from "react";
import { useRouter } from "next/navigation";
import { APIProvider } from "@vis.gl/react-google-maps";
import CityAutocomplete, { type CitySelection } from "./CityAutocomplete";
import DriveBudgetSelector from "./DriveBudgetSelector";
import PersonaSelector from "./PersonaSelector";
import { useLocatedOrigin } from "./useLocatedOrigin";
import { totalDays, totalBudgetMinutes } from "@/lib/plan/types";
import type { PersonaId } from "@/lib/personas/types";

interface RouteInputProps {
  initialFrom?: CitySelection;
  initialTo?: CitySelection;
  initialBudget?: number;
  initialStartDate?: string;
  initialEndDate?: string;
  /** "arrival" opens the picker in arrive-by mode with the end date as the deadline. */
  initialDateMode?: "range" | "arrival";
  /**
   * The fold ("More": dates and the mood) open on the first paint. The page
   * sets it when the URL carries dateMode, startDate or endDate, however
   * they parse; left out, it opens when a date or arrival mode was handed
   * in, so a form given a date never hides it.
   */
  initialMoreOpen?: boolean;
}

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

/** A date on the button, the one thing on it in the mono face (quality bar, rule 2: numbers only). */
function DateNum({ iso }: { iso: string }) {
  return <span className="num">{formatDateLabel(iso)}</span>;
}

/**
 * What the date button says. Words in the body face; a chosen date in the
 * mono face and nothing else (the round-1 critic, rule 2: "Pick the dates"
 * was set in the mono face although it is words, not a number).
 */
function dateButtonLabel(dateMode: "range" | "arrival", startDate: string, endDate: string): React.ReactNode {
  if (dateMode === "arrival") {
    return endDate ? <>Arrive by <DateNum iso={endDate} /></> : "Pick the arrival date";
  }
  if (startDate && endDate) return <><DateNum iso={startDate} /> to <DateNum iso={endDate} /></>;
  if (startDate) return <>Starts <DateNum iso={startDate} />; pick the end date</>;
  if (endDate) return <>Ends <DateNum iso={endDate} />; pick the start date</>;
  return "Pick the dates";
}

/** The words on the disclosure, closed and open: its state in words a person reads, never an icon alone. */
export const MORE_CLOSED_LABEL = "More: dates and what I'm in the mood for";
export const MORE_OPEN_LABEL = "Less";

/**
 * Why the button cannot be pressed yet, as a line beside it (quality bar,
 * rule 3): the button keeps its verb, the reason is its own sentence.
 * Empty when it can be pressed. Pure, so a test can read every line.
 *
 * Dates are optional (Gauntlet U4): from and to are enough, and a trip with
 * no dates is planned with no deadline. Half a range is refused here
 * because the plan page refuses it; arrive-by without its date the same.
 */
export function planReason(opts: {
  from: boolean;
  to: boolean;
  dateMode: "range" | "arrival";
  startDate: string;
  endDate: string;
  dateOrderValid: boolean;
}): string {
  if (!opts.from) return "Choose where you start first";
  if (!opts.to) return "Choose where you're going first";
  if (opts.dateMode === "arrival") return opts.endDate ? "" : "Pick the arrival date first";
  if (opts.startDate && !opts.endDate) return "Pick the end date too";
  if (!opts.startDate && opts.endDate) return "Pick the start date too";
  if (!opts.dateOrderValid) return "The end date is before the start date";
  return "";
}

export default function RouteInput({
  initialFrom,
  initialTo,
  initialBudget = 4,
  initialStartDate = "",
  initialEndDate = "",
  initialDateMode = "range",
  initialMoreOpen,
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
  const [dateMode, setDateMode] = useState<"range" | "arrival">(initialDateMode);
  // The mood is asked under the fold and is optional: null until a chip is
  // tapped, and then the one thing the query gains.
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [moreOpen, setMoreOpen] = useState(
    initialMoreOpen ?? (initialDateMode === "arrival" || initialStartDate !== "" || initialEndDate !== "")
  );
  const foldId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Where you are, as the start. Fills on its own once permission has been
  // granted; before that it is one tap. Typing a city replaces it.
  const located = useLocatedOrigin(setFrom);

  const dateOrderValid = !startDate || !endDate || startDate <= endDate;
  const reason = planReason({ from: !!from, to: !!to, dateMode, startDate, endDate, dateOrderValid });
  const canSubmit = reason === "" && !submitting;

  const tripDays =
    dateMode === "range" && startDate && endDate && dateOrderValid
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
    if (!from || !to || !canSubmit) return;
    setSubmitting(true);

    // The plan page's query, unchanged in form (U4's constraint): dateMode
    // and endDate for a deadline, startDate and endDate for a range, neither
    // for a trip with no dates, and persona only when a mood was chosen.
    // Every name here is one the plan page has read since it was written.
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
    if (dateMode === "arrival") {
      params.set("dateMode", "arrival");
      params.set("endDate", endDate);
    } else if (startDate && endDate) {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    if (persona) params.set("persona", persona);
    router.push(`/plan?${params.toString()}`);
  }

  const dateLabel = dateButtonLabel(dateMode, startDate, endDate);

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Three things above the fold, then the button (Gauntlet U4):
            From, To, the hours. The fold with the dates and the mood comes
            after the button, so opening it moves nothing above it. */}
        <div className="flex flex-col gap-1">
          <CityAutocomplete
            label="From"
            placeholder="Start city"
            value={from ?? undefined}
            onChange={(city) => { located.noteManualChange(); setFrom(city); }}
            onTyping={located.noteManualChange}
            trailing={
              // Where you are, as a control inside the From box at its
              // right end: the box's full 44 px height (rule 7), a glyph
              // with the words, its state said in the line under the field.
              <button
                type="button"
                onClick={() => void located.locate()}
                disabled={located.status.kind === "locating"}
                aria-label="Use where I am"
                className="shrink-0 min-h-[44px] px-3 flex items-center gap-1.5 text-base text-[#8b949e] hover:text-[#f0f6fc] border-l border-[#30363d] disabled:opacity-40 disabled:cursor-wait transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#f0f6fc]"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
                </svg>
                Where I am
              </button>
            }
          />
          <p
            className={`text-base ${located.status.kind === "error" ? "text-[#ff7b72]" : "text-[#8b949e]"}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {located.status.message}
          </p>
        </div>
        <CityAutocomplete
          label="To"
          placeholder="End city"
          value={to ?? undefined}
          onChange={setTo}
        />
        <DriveBudgetSelector value={budget} onChange={setBudget} />
        {/* The one obvious action (quality bar, rule 3): the button keeps
            its verb, and when it cannot be pressed the reason is the line
            under it, not the button's own label. */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 min-h-[44px] py-3 text-base border bg-[#1c2128] border-[#6e7681] text-[#f0f6fc] hover:bg-[#262c36] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          {submitting ? "Planning..." : "Plan the trip"}
        </button>
        <p className="text-base text-[#8b949e] -mt-2 min-h-6" aria-live="polite" aria-atomic="true">
          {submitting ? "" : reason}
        </p>

        {/* The fold: dates and the mood, under one disclosure that says its
            state in words (never an icon alone), 44 px tall. Closed, the
            dates control and the chips are not in the markup at all. */}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? foldId : undefined}
          className="self-start min-h-[44px] flex items-center gap-2 text-left text-base text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          <span aria-hidden="true">{moreOpen ? "▾" : "▸"}</span>
          {moreOpen ? MORE_OPEN_LABEL : MORE_CLOSED_LABEL}
        </button>
        {moreOpen && (
          <div id={foldId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-base text-[#b0b9c2]">
                Trip dates
              </p>
              <button
                type="button"
                onClick={() => setDateDialogOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={dateDialogOpen}
                // Words in the body face; only a chosen date inside is mono.
                className="min-h-[44px] px-3 py-2 text-base bg-[#1c2128] border border-[#8b949e] text-[#f0f6fc] text-left focus:outline-none focus:border-[#f0f6fc] hover:border-[#f0f6fc] transition-colors"
              >
                {dateLabel}
              </button>
            </div>
            <p
              className="text-base text-[#b0b9c2]"
              aria-live="polite"
              aria-atomic="true"
            >
              {tripDays !== null && budgetHrs !== null
                ? `${tripDays} ${tripDays === 1 ? "day" : "days"} at ${budget} h a day: ${budgetHrs} h of driving in all`
                : " "}
            </p>
            <div className="flex flex-col gap-2">
              {/* The glossary's words for "persona" (quality bar, rule 1). */}
              <p className="text-base text-[#b0b9c2]">{"I'm in the mood for"}</p>
              <PersonaSelector activePersonaId={persona} onChange={setPersona} />
            </div>
          </div>
        )}

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
              aria-label="Trip dates"
              tabIndex={-1}
              className="relative bg-[#161b22] border border-[#30363d] w-full sm:max-w-sm p-6 flex flex-col gap-4 focus:outline-none"
            >
              <p className="text-base text-[#b0b9c2]">
                Trip dates
              </p>

              {/* Mode toggle — keyboard-accessible radio group */}
              <fieldset className="flex gap-2">
                <legend className="sr-only">How the dates are given</legend>
                {(["range", "arrival"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex-1 min-h-[44px] flex items-center justify-center text-base cursor-pointer border transition-colors ${
                      dateMode === mode
                        ? "border-[#f0f6fc] text-[#f0f6fc] bg-[#21262d]"
                        : "border-[#30363d] text-[#8b949e] hover:border-[#6e7681]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="dateMode"
                      value={mode}
                      checked={dateMode === mode}
                      onChange={() => setDateMode(mode)}
                      className="sr-only"
                    />
                    {mode === "range" ? "Start and end" : "Arrive by"}
                  </label>
                ))}
              </fieldset>
              {/* Announce mode change to screen readers */}
              <p className="sr-only" aria-live="polite" aria-atomic="true">
                {dateMode === "arrival"
                  ? "Arrive by: give only the day you need to be there. The start date is worked out from the drive."
                  : "Start and end: give a start date and an end date."}
              </p>

              {dateMode === "range" ? (
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    <label
                      htmlFor="trip-start-date"
                      className="text-base text-[#8b949e]"
                    >
                      Start
                    </label>
                    <input
                      id="trip-start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="min-h-[44px] py-2 px-3 text-base num bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label
                      htmlFor="trip-end-date"
                      className="text-base text-[#8b949e]"
                    >
                      End
                    </label>
                    <input
                      id="trip-end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="min-h-[44px] py-2 px-3 text-base num bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="trip-arrive-date"
                    className="text-base text-[#8b949e]"
                  >
                    Arrive by
                  </label>
                  <input
                    id="trip-arrive-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-h-[44px] py-2 px-3 text-base num bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] focus:outline-none focus:border-[#f0f6fc] [color-scheme:dark]"
                  />
                  <p className="text-base text-[#8b949e] mt-1">
                    We work out the start date from the drive.
                  </p>
                </div>
              )}

              {dateMode === "range" && !dateOrderValid && (
                <p className="text-base text-[#f85149]" role="alert">
                  The end date must be on or after the start date.
                </p>
              )}
              <button
                type="button"
                onClick={() => setDateDialogOpen(false)}
                className="min-h-[44px] text-base border border-[#30363d] hover:border-[#6e7681] text-[#f0f6fc] transition-colors focus:outline-none focus:border-[#f0f6fc]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </form>
    </APIProvider>
  );
}
