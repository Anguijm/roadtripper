<!-- WARNING: .harness/hooks/pre-push greps this file for the current branch
     name and for lines beginning 'Cost:' and 'Weakest part:'. Renaming or
     removing those labels turns the pre-push gate into a no-op. -->

# Active plan — roadtripper

Branch: `feat/use-where-you-are`

## Goal

Step 6: use where you are. The home page fills "From" from the phone's
location, snapped to the nearest atlas city, with the typed city as the
override. Done when the app opens knowing your city.

## Ship rule, written before the work

1. With location permission already granted, opening the home page fills
   "From" with the nearest atlas city within 10 seconds and no tap.
2. Without permission, one tap on "Use where I am" does the same. A denial
   shows one plain line and the form still works by typing.
3. The exact coordinates are the origin; the snapped city is the label. More
   than 3 km from the city centre reads "Near <city>". No atlas city within
   40 km reads "Your location" and the plan still works (the API path).
4. Typing a city replaces the located one. The button can re-locate.
5. No browser global is touched during render; the home page renders on the
   server exactly as before. Tested the way the RouteMap SSR crash is.
6. Coordinates leave the browser only to this app's own snap action, which
   validates them, is rate limited like the other actions, and reads SQLite.

**Cost:** $0. Geolocation is free, the snap is a local SQLite scan of 277
cities, and Places autocomplete is unchanged. No new Google calls.

**Weakest part:** The hook's on-mount path (permission already granted, so
it locates with no tap) has no unit test, because the repo has no DOM test
runner: no jsdom, no testing-library. Everything below it is tested with a
fake phone, the server render is tested, and the action is tested against
the real atlas, but the line that decides "granted, so go" is exercised only
by a real browser. Adding jsdom is a separate decision. Also, I cannot
exercise a real phone from here; Safari on iOS prompts only on HTTPS and
after a gesture, so rule 1 holds only after the first grant. The true
morning launch, five hours and no destination, is step 7; this step still
needs a destination to reach the plan page.

## Gate 1 proofs

- Rule 5: with one line added that reads `navigator.geolocation` during
  render, the RouteInput server-render test fails with `TypeError: Cannot
  read properties of undefined (reading 'getCurrentPosition')`. Restored.
- Rule 3: with the try/catch around the snap removed, "still yields an origin
  called Your location when the snap finds nothing, fails, or throws" fails.
  Restored.
- 327 tests, 15 new; lint and types clean.

## Council round 1 on #52 (BLOCK, bugs 4, maintainability 5), and what changed

- a fix that lands after the user typed or picked a city is dropped, not applied: the form reports edits through `noteManualChange`, the hook compares the count before and after
- a fix that lands after the form is gone is dropped (mounted ref)
- the snap's catch logs a warning with the reason; a declined snap logs its code; an empty snap is a real answer and stays quiet. Tested.
- comments on the timeout, the cache age, the 3 km threshold and the `geo:` id explain the reason, the failure mode and which test pins each
- status colours raised to #8b949e and #ff7b72, the same pair PlanWorkspace uses
- **Found while fixing the race, not raised by the council:** the From box never showed a located city. `CityAutocomplete` reads `value` only on first render. The From field is now keyed on the selection's placeId, so a new selection remounts it with the right text; the key does not change on keystrokes. Tested at the server-render level (a given origin's name appears in the box); the update path itself still needs a DOM runner.

## Council round 2 on #52 (CONDITIONAL, bugs 8), and what changed

- a late error goes through the same staleness check as a late fix: typed meanwhile, or left the page, and nothing lands on the user; one `stale()` shared by both paths
- Pushed back on an AbortController: `getCurrentPosition` has no cancel and a server action's promise cannot be cancelled, so the only possible "abort" is ignoring the answer, which the mounted ref already does. Said so in the code.

## Council round 3 on #52 (CONDITIONAL, bugs 9), and what changed

- the callback lives in a ref synced after each render, so `run` and the mount effect depend on nothing that changes; an inline callback from a caller can no longer re-arm the mount effect. Written in an effect, which the react-hooks/refs rule requires.

## Council round 4 on #52 (CONDITIONAL, bugs 8), and what changed

- the keyed remount of the From field is gone; it dropped keyboard focus after every selection. `CityAutocomplete` now follows a changed `value` prop with React's compare-the-last-prop-and-set-during-render pattern, which the lint accepts and which keeps the input node. Still only testable at the server-render level here.

## Council round 5 on #52 (CONDITIONAL, bugs 8), and what changed

- the autocomplete follows a changed name as well as a changed placeId
- the Google Autocomplete widget's listeners are detached on unmount (`clearInstanceListeners`), inside the effect cleanup, never at render
- Answered, not changed: the snap uses the short-window limiter only, 20 requests per 60 s per IP. One page open is one snap plus one plan render, two of twenty. It does not touch the daily quota, which exists for Routes API recomputes (25 per IP per day) because those cost money; the snap costs nothing. Shared-IP starvation would need ten people behind one address opening the page in the same minute.
