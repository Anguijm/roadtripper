"use client";

import Link from "next/link";

/**
 * The plan screen when it could not be drawn at all. A sentence in the
 * body face at 16 px, the code (when Next gives one) in the mono face
 * since it is a code, and one action back to the start (quality bar,
 * rules 1, 2 and 3; Gauntlet U2, round 3: it was "SOMETHING WENT WRONG"
 * in letter-spaced capitals at 12 px and "Error ref: <digest>").
 */
export default function PlanError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 gap-4 bg-[#0d1117]" role="alert">
      <div className="border border-[#f85149] bg-[#161b22] p-5 max-w-md flex flex-col gap-2">
        <p className="text-lg text-[#f85149]">Couldn&apos;t load the plan page</p>
        <p className="text-base text-[#b0b9c2]">Go back and plan the trip again.</p>
        {error.digest && (
          <p className="text-base text-[#8b949e]">
            Error code <span className="num">{error.digest}</span>
          </p>
        )}
      </div>
      <Link
        href="/"
        className="min-h-[44px] flex items-center px-4 text-base border border-[#30363d] hover:border-[#6e7681] text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
      >
        Back to the start
      </Link>
    </div>
  );
}
