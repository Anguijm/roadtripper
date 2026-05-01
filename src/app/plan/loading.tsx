import Link from "next/link";

export default function PlanLoading() {
  return (
    <div className="flex flex-col h-screen bg-[#0d1117]">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <Link
          href="/"
          className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2]"
        >
          ← Roadtripper
        </Link>
        <div className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2] motion-safe:animate-pulse">
          Planning route…
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center" role="status" aria-live="polite">
        <p className="text-xs font-mono uppercase tracking-widest text-[#b0b9c2] motion-safe:animate-pulse">
          Calculating route…
        </p>
      </main>
    </div>
  );
}
