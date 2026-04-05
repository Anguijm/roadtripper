import AuthButtons from "@/components/AuthButtons";
import RouteMap from "@/components/RouteMap";

export default function Home() {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <h1 className="text-sm font-mono uppercase tracking-[0.3em] text-[#a0a0a0]">
          Roadtripper
        </h1>
        <AuthButtons />
      </header>

      <main className="flex-1 relative">
        <RouteMap />
        <div className="absolute bottom-6 left-4 right-4 pointer-events-none">
          <div className="bg-[#0a0a0a]/90 border border-[#1a1a1a] p-4 max-w-md pointer-events-auto">
            <p className="text-xs font-mono uppercase tracking-widest text-[#666] mb-1">
              Test Route
            </p>
            <p className="text-sm text-[#a0a0a0]">
              New York City → Washington, D.C.
            </p>
            <p className="text-xs text-[#444] mt-2">
              Session 2 verification — route polyline rendering
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
