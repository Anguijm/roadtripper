<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/label-import`

## Goal

Step 20's second half: the labels come back off the sheet into a file the
step 21 bench can read. The sheet is a Claude Docs table with a dropdown
per row; there is no export from it but a read through the Docs tools, so
the path is: read the doc, transcribe id and label to a tab-separated
file, and let a script check that file against the committed sample and
write `data/labels/<corridor>.labels.json`. The script is the checked
step; the transcription is the unchecked one, and the checks exist to
catch it.

## Ship rule, written before the work

1. Three labels and no more: worth it, no, unsure. The sheet's dropdown
   words are accepted as typed on a phone: any case, spaces or
   underscores between the words. A blank cell is "not labelled yet", not
   an error, since a half-labelled sheet is still a bench. (Amended after
   round 1: a sheet with no label at all is refused, not written as an
   empty file.) Anything else is an error that names the line.
2. Every id on the sheet must be in the sample, and an id labelled twice
   with different words is a conflict; both stop the import with the ids
   named. The same id labelled twice the same way is not a conflict. The
   sample's rows with no label are reported by count, not refused.
3. The output file carries the corridor, when the sample was drawn, when
   the labels were imported, and one row per labelled stop with id, name,
   kind and label, in sample order. Its schema is exported so step 21
   validates the file on read rather than trusting it.
4. Both the tab-separated transcription and the output are committed under
   `data/labels/`, so the transcription can be checked against the doc
   and the import rerun.
5. No network. Pure parser and merge in `src/lib/roadside/labels.ts`,
   tested; the script only reads and writes files.

**Cost:** $0. No request is made anywhere.

**Weakest part:** The transcription from the doc's table to the
tab-separated file is by hand, through the Docs read tool, and is the one
step between John's thumb and the file that no test covers. The id check
catches a row copied from the wrong sheet and the counts printed catch a
row dropped, but a label copied onto the neighbouring row is caught only
by reading the two side by side. The sheet does not exist yet: this is
the tooling written ahead of the corridor finishing, like the sampler was.

## Gate 1 proofs

- Rule 2: with the conflict check removed from `mergeLabels`, "reports ids not in the sample and ids labelled two ways" fails. Restored, `cmp` clean.
- Rule 1: with the word normalisation removed from `labelFromWord`, five tests fail, starting with "accepts the dropdown's three words in any case or spacing". Restored, `cmp` clean.
- Script smoked both ways on a three-row sample: a sheet with one blank cell writes two of three and says so; a sheet with an unknown word, an unknown id and a conflict names all three problems, exits 1, writes nothing. The smoke files were removed.
- 421 tests, 8 new; lint and types clean.

## Council round 1 on #66 (CONDITIONAL, maintainability 7, product 7), and what changed

- a comment above `LabelSchema` names the step 21 bench as its reader and what a fourth value would break
- a comment says why the file is tab-separated and not comma-separated: names carry commas
- Answered, not changed: `zod/v4` is the repo's import, in six files including `record.ts`, and zod 4.3 ships that subpath; `"zod"` alone is the one outlier
- Taken from the deferred list: the sample file is validated on read through `SampleFileSchema` (fields named, ids unique) instead of trusted through a cast; an unlabelled sheet is refused rather than written empty (rule 1 amended)
- The corridor finished under the second tag list (32 tiles, 1,074 stops within 10 km), so the sample itself is in this PR: `data/labels/amarillo-austin.sample.json`, 100 rows, eleven kinds, none over twelve rows

## Round 2 on #66 (CLEAR, all tens but product 8)

- Rebased onto main after #65 merged, since both PRs rewrite this file and a conflicting PR runs no council. The code diff against main is the one round 2 cleared; the push after the rebase carries `[skip council]` in the title so a round on an identical diff does not spend a request.
