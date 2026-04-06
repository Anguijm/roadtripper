import AuthButtons from "@/components/AuthButtons";
import RouteInput from "@/components/RouteInput";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d]">
        <h1 className="text-sm font-mono uppercase tracking-[0.3em] text-[#b0b9c2]">
          Roadtripper
        </h1>
        <AuthButtons />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-mono tracking-tight text-[#f0f6fc] mb-2">
              Plan your road trip
            </h2>
            <p className="text-sm text-[#7d8590]">
              Set your start, destination, and daily drive budget. We&apos;ll suggest
              themed stops along the way.
            </p>
          </div>
          <RouteInput />
          <p className="mt-6 text-xs text-center text-[#4a5159] font-mono">
            Powered by Urban Explorer — 102 cities, thousands of waypoints
          </p>
        </div>
      </main>
    </div>
  );
}
