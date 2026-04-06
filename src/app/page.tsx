import AuthButtons from "@/components/AuthButtons";
import RouteMap from "@/components/RouteMap";

export default function Home() {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <h1 className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2]">
          Roadtripper
        </h1>
        <AuthButtons />
      </header>

      <main className="flex-1 relative">
        <RouteMap />
        <div className="absolute bottom-6 left-4 right-4 pointer-events-none">
          <div className="bg-[#161b22]/95 border border-[#30363d] p-4 max-w-md pointer-events-auto rounded-sm">
            <p className="text-xs font-mono uppercase tracking-widest text-[#7d8590] mb-1">
              Test Route
            </p>
            <p className="text-sm text-[#f0f6fc]">
              New York City → Washington, D.C.
            </p>
            <p className="text-xs text-[#7d8590] mt-2">
              Session 2 verification — route polyline rendering
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
