import Link from "next/link";

/**
 * The plan screen while the route is worked out: the same masthead as the
 * page it becomes, and one line saying what is happening. Sentence case,
 * the body face, 16 px (quality bar, rules 1 and 2). Gauntlet U2, round 3:
 * this and error.tsx were the two states of the screen no round had read,
 * letter-spaced capitals at 12 px in the mono face, with an ellipsis.
 */
export default function PlanLoading() {
  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      <header className="flex items-center justify-between gap-4 px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="min-h-[44px] flex items-center text-base text-[#b0b9c2] hover:text-[#f0f6fc] transition-colors focus-visible:ring-1 focus-visible:ring-[#f0f6fc] focus-visible:outline-none"
        >
          ← Roadtripper
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-4" role="status" aria-live="polite">
        <p className="text-base text-[#b0b9c2] motion-safe:animate-pulse">
          Planning the route
        </p>
      </main>
    </div>
  );
}
