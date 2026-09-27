"use client";

import { useRouter, useSearchParams } from "next/navigation";
import PersonaSelector from "./PersonaSelector";
import type { PersonaId } from "@/lib/personas/types";

/**
 * Switch persona on the results without re-locating. The results are
 * server-rendered from the atlas, so a re-render is a SQLite read, not a
 * paid call, and the URL stays shareable.
 */
export default function TodayPersonaBar({ activePersonaId }: { activePersonaId: PersonaId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <PersonaSelector
      activePersonaId={activePersonaId}
      onChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("persona", next);
        router.replace(`/today?${params.toString()}`);
      }}
    />
  );
}
