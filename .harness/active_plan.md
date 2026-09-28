<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/u1-roadside-first-class`

## Goal

Gauntlet component U1, round 2: the critic's one failure (rule 6, a black
"N" circle over the sheet) fixed first, then the rest the spec's acceptance
still needs on the same two captures.

## What the "N" circle is

Not Google's compass. Round 1 turned the rotate and camera controls off and
put the map pane in its own stacking context, and the round-1 captures
(`scratchpad/u1/r1-list.png`, `r1-card.png`) show no Google control at the
bottom of the map. The circle is Next's own dev-tools button, which the dev
server fixes at the bottom-left of the viewport above everything, on the
server the runner shoots. It never exists in production.

## Ship rule (written before the code)

1. The dev-tools button is off (`devIndicators: false` in `next.config.ts`),
   so nothing the app does not draw sits over the sheet in a capture. Every
   Google control is off through `disableDefaultUI`, which the map library
   forwards on every update (it does not forward `cameraControl`, so round
   1's `cameraControl={false}` reached only the constructor), and the zoom
   control alone is turned back on at the top right. The map pane stays its
   own stacking context.
2. The sheet header (mood chips, distance, driving left) scrolls with the
   content instead of staying pinned under the drag handle. Arithmetic on a
   390 by 844 phone: with the header pinned, the list area at the full snap
   is about 490 px, which holds the heading and eight two-line rows; with the
   header scrolling away it is about 670 px, which holds the heading, ten
   rows of 44 px or more and the "Show all" control. At the half snap ten
   rows never fit; that capture needs the sheet fully open (one tap on the
   handle from the half snap). Nothing changes at rest with the sheet
   unscrolled.
3. The header says its numbers as sentences, no stat labels: "497 mi ·
   8 h 3 min on the road" and "4 h of driving left today" (or "… left over
   3 days", or "1 h 20 min more driving than fits today"), the glossary's
   own replacement for "budget left (as a stat)". Sentence case, a normal
   face at 16 px.
4. The mood chips wrap to a second row instead of scrolling or clipping
   ("GEARH"), in sentence case at 16 px with 44 px targets. The group's
   name is "I'm in the mood for", the glossary's word for persona.
5. The town list's three glossary words go to the glossary's replacements:
   "★ The pick", "What's in Lubbock", "Stop here". The frontier line loses
   its counts: "First stop from Amarillo · 2 towns that fit today".
6. The card's line when the store has no write-up says so ("No write-up for
   this one.") instead of repeating the kind that the next line shows.
7. Everything from round 1 stands: the card's five parts, the second tap or
   close control clearing it, each row opening it, the list open with the
   ten strongest first and "Show all N", the arc gone, the zoom rule, names
   wrapping, nothing new fetched or scored.
8. The /health uptime check (`scratchpad/health_check.json`, Google Cloud,
   every minute) matches the string "Budget left". A hidden canary on
   /health, outside the plan screen, carries that string until the check is
   re-pointed at "of driving left"; the canary is removed with that change.

**Cost:** $0. No new fetch, no new call, no change to the store or the
scores. The chips, the header and three labels change words and layout only.

**Weakest part:** The at-rest capture with ten rows depends on the runner
opening the sheet fully; at the half snap the phone has room for six rows
and no layout at 16 px with 44 px targets changes that. Second: the glossary
canary on /health is a string kept alive for a monitor, and it stays until
the operator re-points the check; that is routed below, not hidden. Third:
the town list's other words and its ellipsis on a long town name are U2's
and still show on the at-rest capture.

## Routed by name

- Re-point the /health uptime check's content matcher from "Budget left"
  to "of driving left" and delete the canary in `src/app/health/page.tsx`:
  the operator (a Google Cloud change, not a code change).
- Every other visible string on the plan screen, the town name ellipsis,
  the pending line's words, and the chips' short words: U2.
- "Add as a stop" from the card: U6, per the spec's constraints.

## Gate 1 proofs

Baseline at the start of the round (round 1's commit): 47 files, 468 tests,
all green; type-check clean; lint 0 errors, 11 warnings.
After: 47 files, 471 tests, all green; `bun run type-check` clean;
`bun run lint` 0 errors, 11 warnings, the same rules on the same lines as
HEAD's copies of every changed file (checked by linting each HEAD copy on
stdin and diffing the warning lists; PersonaSelector and RecommendationList
have none before or after).

**Mutation, the glossary's sentence.** In `src/components/PlanWorkspace.tsx`
the header's second line for an untouched trip was changed from
`${…} of driving left ${daySpan}` to `Budget left ${…}`. Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "carries no word from the glossary"
× carries no word from the glossary's never column on the sheet at rest
AssertionError: expected ' ● Culture ◆ Foodie ◇ Nerd ■ Gearhead…' not to match
  /budget left|candidate|max \d+ min|pe…/i
Tests  1 failed | 12 skipped (13)
```

Restored from the backup copy; `cmp` reported the files identical; the same
test then passed (1 passed, 12 skipped).

**Mutation, the dev server's button.** In `next.config.ts`
`devIndicators: false` was changed to `devIndicators: { position:
"bottom-left" }` (Next's default). Then:

```
bunx vitest run src/components/__tests__/PlanWorkspace.roadside.ssr.test.tsx \
  -t "keeps the dev server"
× keeps the dev server's own button off the screen the runner shoots
AssertionError: expected { position: 'bottom-left' } to be false
Tests  1 failed | 12 skipped (13)
```

Restored from the backup copy; `cmp` reported the files identical; the same
test then passed (1 passed, 12 skipped).

Round 1's two proofs (strongest first; the arc prop gone) stand: their tests
are unchanged and green.
