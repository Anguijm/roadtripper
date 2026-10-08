<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/u16-tag-word-lines`

## Ship rule (written before the build, recorded once the data was read)

U15's critic flagged a card whose only line was "tourism". Ships when a
place's line is never a bare map tag word — a plain noun becomes the noun
in the card's own sentence ("On the map as a statue; nothing written about
it yet."), tag-speak gives way to the place's kind — through the store
read the app uses and `aboutFor` alike; when the critic approves a
before/after of a real card; and the mutation proofs ran before the push.

**Cost:** $0. Read-side only; the store's text is not edited.

**Weakest part:** `TAG_WORD_NOUNS` is a hand-made list, and every word on
it is a judgement about what "a ___" a person in a car would say. It
covers the bulk — 2,388 sculptures, 1,923 statues, 745 observation towers
— and sends the rest to the kind. A word missing from it costs a place its
specific noun, not its line; a word that should not be on it would put
tag-speak back on a card.

## The data

8,838 of the 27,976 places on the map have no encyclopedia line and a
mapper's text that is one word: "sculpture" 2,388, "statue" 1,923,
"observation" 745 (a lookout tower's tag), "history" 643, "arch" 440,
"mural" 303, … "local" 96, "commercial" 43, "military" 41. The card showed
that word as the whole line about the place.

## On the hard stop

The bar's hard stop 2 is "any change to the store's scores or the line",
and a comment on the card's fallback read "The store's line itself is a
hard stop and is not touched". In the bar, "the line" is the map threshold
— survivors.ts calls `MAP_THRESHOLD` "the line for the map" throughout — so
the stop covers scores and what gets on the map. This edits nothing in the
store; it changes how a one-word tag already there is shown, read-side and
reversible. Proceeding on that reading, said in the PR so the operator can
veto it, and the comment now says the same.

## Mutation proofs, before the push

1. One-word tags shown bare again: 3 fail. 2. **The store's read bypassing
`readableDetail`: 0 failed the first time** — only `aboutFor` was tested,
and the store's read is the path the app actually uses. A store test now
reads a "statue" and a "tourism" row through `survivorsAlongRoute`; the
mutation fails.

## Live, before and after

Lubbock → Midland, the Buddy Holly Statue's card: before, its whole line
was "statue"; after, "On the map as a statue; nothing written about it
yet."

Gates: 730 green across 68 files; `tsc --noEmit` clean; `eslint` 0 errors.

## Critic

Approved: before, the line was a lowercase category word, not a sentence
(rule 1); after, a plain sentence wrapping cleanly at full size, the rest
of the card unchanged. Outside this unit it noted the grey line under each
name still opens with a lowercase kind ("artwork · 1 mile along") — a
sentence-case question for a later look.
