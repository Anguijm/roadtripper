# Quality bar for the interface (prepared 2026-09-29, before the first build)

The Gauntlet Loop package for the polish and usability upgrade of Road Tripper's
screens, in the same shape as jev-lab's `gauntlet/quality-bar.md`. Critics judge
against this file and against the standing rules in `.harness/`. Where they
disagree, the operator's rules win and the critic records the conflict.

The loop is the builder/critic pattern: the agent that implements never grades its own
work; a critic that saw a previous draft never grades the retry; the bar is concrete
criteria and reference exemplars, not praise; hard stops outrank persistence.

## The bar, verbatim

The operator, 2026-09-28: "1. Pull it out. 2. Open the website. 3. Put a few
characteristics of my trip in. 4. Without hitting Claude, I get feedback back."

The operator, 2026-09-29: "the ui needs a serious polish and usability upgrade."

The operator, 2026-09-29, on why the interface is what it is: the council reviews code,
not screens, and "I think it's why we ended up with this interface." So for the screens
the gate is a critic looking at the phone screenshot against this bar, and the operator
looking at the same screenshot. The council still runs on the code; its verdict is not
the gate for a screen.

## What the operator ruled, in this build (2026-09-29, "Yes")

1. **Plain words.** Every label is a sentence a person in a car would say. Sentence
   case, not capitals. The glossary below lists the words that must not appear on a
   screen and what replaces them. New engineer words are a failure the critic names.
2. **Readable type.** Text is a normal typeface at 16 px or more on a phone; the
   monospace face is for numbers and codes only. No name is truncated with an
   ellipsis: a name wraps to two lines or the layout changes.
3. **One obvious action per screen.** The thing to do next is the largest control
   and is enabled when it can be pressed; disabled controls say why in a sentence
   beside them, not in their own label.
4. **Roadside stops are first-class.** A diamond on the map answers a tap with a card:
   the name, the line about it, how far along the road, open in Maps. The list of
   them is open, not collapsed, and shows the strongest first.
5. **The trip is told as days.** A daily budget means the screen says where each day
   ends and what fits in it, and the map can show one day at a time.
6. **The map shows the trip, not the machinery.** No search arc, no internal
   counts; the compass and controls never sit on top of the sheet. A diamond is
   drawn at its place's position and is never moved; overlapping diamonds are
   allowed, and the zoom rule and a pinch are the answer to a pile. (Added after
   U1's rounds three to six, where a note about two stacked diamonds became a
   spreading engine that put Amarillo's places in New Mexico.)
7. **A phone first.** 390 px wide, one hand, thumb reach for the primary action,
   44 px targets, no horizontal scroll. Checked with a screenshot, every time.
8. **Six rounds, then the operator.** A component gets up to six builder/critic rounds
   before its state is put to him with the screenshots.

### The glossary (words that may not appear on a screen, and their replacements)

| Never | Instead |
|---|---|
| candidates, N candidates | "towns that fit today" or the town names |
| max 270 min, detour minutes | "up to four and a half hours off the road" or nothing |
| primary (badge) | "the pick" or a star with no word |
| see what's here | "what's in Lubbock" |
| add city to trip | "stop here" |
| recompute, refresh, pending | (nothing; the screen updates) |
| budget left (as a stat) | "4 h of driving left today" |
| persona | "I'm in the mood for" |
| waypoint, neighborhood (as labels) | the place's own name; "part of town" if needed |
| roadside stops along the way · N | "N places worth pulling over for" |

## Execution rules (the house's, unchanged)

Orchestrator decomposes; builder agents implement; critic agents inspect blind without
reading builder commentary; on a failure only the largest issue goes back to the
builder; stop at critic approval or ten rounds, and put the state to the operator after
six. Residuals a component cannot close are routed to a later component by name, never
dropped. Each component is one spec file under `gauntlet/specs/`, and a builder gets
exactly one spec. The runner is the Workflow tool; the `workflow-authoring` skill is
loaded before the script is written.

For a screen, the critic's evidence is the phone screenshot (390 px, device emulation,
`scratchpad/shot.mjs` or the same over CDP) of the built state, taken by the runner,
never by the builder, plus the glossary and this bar. The critic writes: the largest
failure against a numbered rule, or "approved", and nothing about the code.

Every component still passes Gate 1 (`.harness/hooks/pre-push`) and goes to the council
as a pull request; council items about the code are applied or answered as before; a
council item about the words or the layout is answered by pointing at this bar.

## Hard stops (the operator is the brake)

- Any change to what the app pays for: the routes call, the atlas, the store, the
  drive graph. This build changes what the screens say and show, not what they fetch.
- Any change to the store's scores or the line.
- Any deploy of a screen the critic has not approved against a screenshot.
- A component that cannot meet its rule after six rounds: report and stop, do not lower
  the rule to pass.
