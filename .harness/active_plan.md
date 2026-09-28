<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `data/labels-rows-1-41`

## Goal

The first labels, as data. John read rows 1 to 41 of the sheet (Amarillo
to Lubbock) and said in chat that all of them are worth having on a list.
That sentence is transcribed to the tab-separated file, imported through
`label:import`, and both files are committed so the bench's numbers can
be reproduced.

## Ship rule, written before the work

1. The tab-separated file holds exactly the 41 ids of sheet rows 1 to 41,
   in sheet order, each "Worth it", with the header line.
2. `label:import` checks every id against the sample and writes the labels
   file: 41 labelled, 122 not yet, no unknown id, no conflict.
3. No code changes. Data only; the council is skipped, as for docs.

**Cost:** $0.

**Weakest part:** The labels are one sentence spoken over a stretch, not
41 taps, and the criterion he used, "worth having on a list", is softer
than the sheet's "would take the exit". The lab's results page says so in
its first paragraph. The bench calls the bar provisional at 38 yes rows
against a 40-row minimum, and that stands.
