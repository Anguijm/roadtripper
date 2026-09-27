"use client";

import { HOURS_PRESETS } from "@/lib/today/presets";

interface DriveBudgetSelectorProps {
  value: number;
  onChange: (hours: number) => void;
}

// One list for "hours per day" here and "hours today" on the today screen,
// so the two cannot drift apart.
const PRESETS = HOURS_PRESETS;

export default function DriveBudgetSelector({ value, onChange }: DriveBudgetSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-mono uppercase tracking-widest text-[#7d8590]">
        Drive Budget Per Day
      </label>
      <div className="flex gap-1">
        {PRESETS.map((hours) => {
          const active = value === hours;
          return (
            <button
              key={hours}
              type="button"
              onClick={() => onChange(hours)}
              className={`flex-1 py-2 text-sm font-mono border transition-colors ${
                active
                  ? "bg-[#1c2128] border-[#6e7681] text-[#f0f6fc]"
                  : "bg-[#0d1117] border-[#30363d] text-[#7d8590] hover:border-[#3d444d] hover:text-[#b0b9c2]"
              }`}
            >
              {hours}h
            </button>
          );
        })}
      </div>
    </div>
  );
}
