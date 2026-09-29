"use client";

import { useRouter, useSearchParams } from "next/navigation";
import MoodChips from "./MoodChips";
import type { PersonaId } from "@/lib/personas/types";

/**
 * The today results' wiring for the mood chips, and nothing else: the
 * look and the words are MoodChips' (Gauntlet U5). A tap switches the
 * mood in the URL without re-locating. The results are server-rendered
 * from the atlas, so a re-render is a SQLite read, not a paid call, and
 * the URL stays shareable.
 */
export default function TodayMoodChips({ activeId }: { activeId: PersonaId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <MoodChips
      activeId={activeId}
      onChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("persona", next);
        router.replace(`/today?${params.toString()}`);
      }}
    />
  );
}
