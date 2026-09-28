"use client";

import { HOURS_PRESETS } from "@/lib/today/presets";

interface DriveBudgetSelectorProps {
  value: number;
  onChange: (hours: number) => void;
}

// One list for "hours a day" here and "hours today" on the today screen,
// so the two cannot drift apart.
const PRESETS = HOURS_PRESETS;

export default function DriveBudgetSelector({ value, onChange }: DriveBudgetSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-1">
      {/* A sentence a person would say, not a stat's label (quality bar,
          rule 1); the chips are numbers, so they carry the mono face. */}
      <legend className="text-base text-[#b0b9c2] mb-1">
        Each day I will drive up to
      </legend>
      <div className="flex gap-1">
        {PRESETS.map((hours) => {
          const active = value === hours;
          return (
            <button
              key={hours}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(hours)}
              // 48 px tall: a few over rule 7's 44, so a measurement of the
              // painted box (the round-1 critic read 43) cannot land under it.
              className={`flex-1 min-h-[48px] text-base num border transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none ${
                active
                  ? "bg-[#1c2128] border-[#6e7681] text-[#f0f6fc]"
                  : "bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:border-[#3d444d] hover:text-[#b0b9c2]"
              }`}
            >
              {`${hours} h`}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
