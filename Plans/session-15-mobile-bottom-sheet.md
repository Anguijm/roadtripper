# Session 15 — Mobile bottom sheet

**Branch:** `feat/mobile-bottom-sheet`
**Date:** 2026-04-30

## Goal

The 360px `<aside>` doesn't fit phones. At 375px width it consumes almost the full
viewport, leaving a sliver of map. At 320px it triggers horizontal scroll, violating
WCAG 1.4.10 Reflow.

Replace it with a CSS-driven bottom sheet on mobile (< `md` = 768px). Desktop layout
is unchanged.

## Snap points

| Index | translateY | Visible height | Shows |
|-------|-----------|---------------|-------|
| 0     | 80%       | 20vh          | Handle + stats bar (peek) |
| 1     | 45%       | 55vh          | Itinerary + top recs (default) |
| 2     | 8%        | 92vh          | Full panel |

## Changes

### `src/app/globals.css`

Add `.plan-sheet` custom utility — mobile positioning only:

```css
@layer utilities {
  .plan-sheet {
    @media (max-width: 767px) {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      height: 92dvh;
      transform: translateY(var(--sheet-y, 45%));
      transition: transform var(--sheet-duration, 300ms) ease-out;
    }
    @media (max-width: 767px) and (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
}
```

On desktop (≥ 768px) the media query doesn't apply: `position`, `transform`, and
`transition` are all left at initial values. The `--sheet-y` CSS variable is ignored.

### `src/components/PlanWorkspace.tsx`

- `SNAP_Y = [80, 45, 8] as const` — translateY % for peek / half / full
- `sheetSnap: 0 | 1 | 2` state, default `1`
- `sheetRef: useRef<HTMLElement>(null)` — direct DOM access during drag
- `touchStartYRef: useRef<number | null>(null)` — tracks drag origin
- `handleSheetTouchStart` / `handleSheetTouchMove` / `handleSheetTouchEnd` — all
  `useCallback`. Disable CSS transition during drag (mutate `--sheet-duration` via
  `style.setProperty`), restore on touchEnd.
- `cycleSnap` callback — tap on handle to cycle 0 → 1 → 2 → 0
- Drag handle div inside `<aside>`, visible on mobile only (`md:hidden`), with
  `touch-action: none`, role/aria-label, and keyboard support

**`<aside>` element changes:**

```tsx
<aside
  ref={sheetRef}
  style={{ '--sheet-y': `${SNAP_Y[sheetSnap]}%` } as React.CSSProperties}
  className="plan-sheet md:static md:w-[360px] md:z-auto border-t md:border-t-0
             md:border-r border-[#30363d] bg-[#0d1117] flex flex-col min-h-0"
>
```

## Architecture notes

- **CSS custom property split:** `--sheet-y` driven by React state (set via `style`
  prop) for snapped positions. During live drag, `sheetRef.current.style.setProperty`
  updates it directly (no re-render per pixel). `--sheet-duration` controlled only via
  direct DOM mutation — React never touches it.
- **Desktop safety:** `.plan-sheet` is entirely scoped to `@media (max-width: 767px)`.
  No inline transform lands on desktop; `md:static` + `md:w-[360px]` restore the
  existing side-panel layout exactly.
- **WCAG 1.4.10:** At 320px viewport the map fills full width + peek sheet shows
  below. No horizontal scroll.
- **`prefers-reduced-motion`:** CSS handles it — the `transition: none` rule inside
  the media query fires automatically. No JS flag needed.
- Pure UI change. No server actions, no new state effects, no API calls.

## Out of scope (this PR)

- Map padding to expose bottom controls hidden behind the sheet (nice-to-have polish)
- Momentum-based flick snapping (threshold-based is sufficient)
- Persisting snap position across page navigations
