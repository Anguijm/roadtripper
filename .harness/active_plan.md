<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `fix/pick-first`

## Ship rule (written before the work)

U46. The U45 critic: in Rawlins and Snyder, "★ The pick" sat second, under
a plainer place. That breaks quality bar rule 4 (the strongest first). The
cause: the lead row was the first place *with a description*. Since U45 some
places have none, so the lead skipped past the top-ranked one.

The rule: a town's first row is its top-ranked place, whether or not it has
a description. When the town has a pick, the pick is first. Checked in SSR
(the first `data-badge` in a town is "pick" when a pick exists, even when
that place has no description) and live on Salt Lake City → Denver's Rawlins,
where the old build fails it.

**Cost:** None. This is rendering only.

**Weakest part:** a lead with no description shows just its name and kind line
before the rest. Whether it still reads as the answer to "why this town" is
judged by the critic on the screenshot.
