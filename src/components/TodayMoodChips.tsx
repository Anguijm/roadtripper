"use client";

import { useRouter, useSearchParams } from "next/navigation";
import MoodChips from "./MoodChips";
import { toggleMood, MOODS_PARAM, type MoodId } from "@/lib/roadside/tags";

/**
 * The today results' wiring for the mood chips, and nothing else: the
 * look and the words are MoodChips' (Gauntlet U5, U6). A tap changes the
 * chosen moods in the URL without re-locating. The results are
 * server-rendered from the atlas, so a re-render is a SQLite read, not a
 * paid call, and the URL stays shareable.
 *
 * `toggleMood` is applied here rather than in the component because the
 * rule (at most two, a third drops the oldest) is the screen's, and this
 * screen's state is the URL.
 */
export default function TodayMoodChips({ chosen }: { chosen: readonly MoodId[] }) {
  const router = useRouter();
  // Never null here, on three counts (council round 2 on #90 asked for a
  // guard): next/navigation types useSearchParams() as ReadonlyURLSearchParams
  // in this Next; src/app/today/page.tsx is `force-dynamic`, so the page is
  // never statically prerendered, which is the one case the pages router
  // returned null for; and the only read of it below runs inside the tap
  // handler, after mount. A guard would hide a type change rather than
  // handle a state.
  const searchParams = useSearchParams();
  return (
    <MoodChips
      chosen={chosen}
      onToggle={(mood) => {
        const next = toggleMood(chosen, mood);
        const params = new URLSearchParams(searchParams.toString());
        // An empty choice drops the parameter rather than writing an empty
        // one, so the link for "nothing chosen" is the plain screen's.
        if (next.length === 0) params.delete(MOODS_PARAM);
        else params.set(MOODS_PARAM, next.join(","));
        router.replace(`/today?${params.toString()}`);
      }}
    />
  );
}
