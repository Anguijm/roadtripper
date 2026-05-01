"use client";

import Link from "next/link";

export default function PlanError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-4 bg-[#0d1117]" role="alert">
      <div className="border border-[#f85149] bg-[#161b22] p-6 max-w-md">
        <p className="text-xs font-mono uppercase tracking-widest text-[#f85149] mb-2">
          Something went wrong
        </p>
        <p className="text-sm text-[#b0b9c2]">
          {error.digest ? `Error ref: ${error.digest}` : "Couldn't load the plan page. Try going back and planning again."}
        </p>
      </div>
      <Link
        href="/"
        className="text-sm font-mono uppercase tracking-widest border border-[#30363d] hover:border-[#6e7681] px-4 py-2 text-[#f0f6fc] transition-colors min-h-[44px] flex items-center focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
      >
        ← Back
      </Link>
    </div>
  );
}
