/**
 * Writes `data/tag-questions.json` from the vocabulary in
 * `src/lib/roadside/tags.ts`, which is the only place the eighteen
 * questions are written down. The tagging bench in jev-lab
 * (`bench/roadside_tag_score.py`) reads the file this produces; its own
 * error message names this script.
 *
 *   bun run tags:export
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MOODS, ROADSIDE_TAGS, tagQuestionsJson } from "../src/lib/roadside/tags";

const OUT = fileURLToPath(new URL("../data/tag-questions.json", import.meta.url));

writeFileSync(OUT, tagQuestionsJson());
console.log(`wrote ${OUT} (${ROADSIDE_TAGS.length} tags, ${MOODS.length} moods)`);
