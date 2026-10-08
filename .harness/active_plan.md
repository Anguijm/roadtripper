<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u42-badge-on-the-kind-line`

## Ship rule (written before the work)

Five critics (U24 onward): "Also good" sits in a bordered box at the
right of a place's row, so it reads as a button, and it takes a column
that squeezes the description into a narrow strip ("seven lines").

Ships when:

- **The kind line.** The badge moves onto the place's kind line, after
  the kind: "Culture · Also good" in the kind's grey, and "Culture · ★ The
  pick" with "★ The pick" in the accent at medium weight. There is no
  border or box, so it never looks pressable.
- **Full width.** The description takes the row's full width.
- **U24's rule unchanged.** One pick per town, none on the lead or a
  detour.

Also required:

- the SSR and badge tests updated where they pin the badge's markup
- a mutation proof
- a screenshot at the same scroll as before
- the critic's approval

**Cost:** $0.

**Weakest part:** "★ The pick" loses its filled pill, which was its
loudest form. The accent colour and weight carry it now.

## Built

In `RecommendationList.tsx`, the badge is now a span on the kind line after " · ": grey for "good", and the accent colour at medium weight for "pick". There is no border, padding or column. A new SSR pin checks both forms on the kind line and that no badge carries a border. The mutation that boxes it again is caught.

## Gates

eslint, vitest (808) and next build are clean.

## Critic: APPROVE (round 1)

The badge no longer reads as a button, and descriptions run full width. Noted: the kind line sits under the description, which is existing layout. The lead place shows no kind line (out of scope).
