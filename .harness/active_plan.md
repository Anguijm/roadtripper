<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: docs/api-today-record

(Docs only: records #164 and #165.)

## Ship rule (written before the work)

`.github/workflows/ci.yml` ran `npm run typecheck --if-present`; the script
is `type-check`, so `--if-present` made the step a silent no-op and CI never
type-checked (found by ops' survey 2026-11-10, confirmed). The step now runs
`npm run type-check` with no `--if-present`, so a future rename fails loudly.

The rule: this PR's CI run shows the Typecheck step running `tsc --noEmit`
in its log. The old workflow's log for the same step shows npm doing nothing.

**Cost:** About ten seconds of CI per push.

**Weakest part:** Gate 1 already type-checks locally, so this mainly catches
pushes that skip the hook (SKIP_GATE1=1) and changes made in the GitHub UI.
