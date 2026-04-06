# Roadtripper Design System

Roadtripper inherits Urban Explorer's visual language — dark, industrial, information-dense — and extends it for map-centric route planning. Every screen should feel like a command center for adventure.

## Color Palette

### Base (GitHub-dark inspired — lifted from pure black for breathing room)
- **Page background:** `#0d1117`
- **Surface:** `#161b22`
- **Elevated surface:** `#1c2128`
- **Hover surface:** `#262c36`

### Text
- **Primary:** `#f0f6fc`
- **Secondary:** `#b0b9c2`
- **Tertiary:** `#7d8590`
- **Muted:** `#4a5159`

### Borders
- **Default:** `#21262d`
- **Subtle:** `#30363d`
- **Visible:** `#3d444d`
- **Focus:** `#6e7681`

### Semantic
- **Success:** `#3fb950` (route confirmed, stop added)
- **Warning:** `#d29922` (drive time exceeded, detour required)
- **Error:** `#f85149` (route impossible, API failure)
- **Info:** `#58a6ff` (estimated arrival, distance)

### Accent — Route Personas
Each persona gets a signature accent color used for route lines, badges, and highlights:
- **Explorer (default):** `#58a6ff` (blue)
- **Outdoorsman:** `#3fb950` (green)
- **Foodie:** `#d29922` (amber)
- **Gearhead:** `#f85149` (red)
- **Culture buff:** `#bc8cff` (purple)
- **Boardgamer/Nerd:** `#0ff` (cyan)

## Typography

### Font Stack
- **UI:** `system-ui, -apple-system, sans-serif` (interactive elements, navigation)
- **Data:** `'SF Mono', 'Cascadia Code', 'Fira Code', monospace` (distances, times, coordinates)

### Scale (Tailwind classes)
- **Route title:** `text-2xl font-bold tracking-tight`
- **Day header:** `text-lg font-semibold uppercase tracking-wider`
- **Stop name:** `text-base font-medium`
- **Detail text:** `text-sm text-secondary`
- **Label:** `text-xs uppercase tracking-widest text-muted`
- **Distance/time badge:** `text-xs font-mono`

## Layout

### Map-First
- Map occupies primary viewport (60-70% on desktop, full screen on mobile with bottom sheet)
- Route sidebar/bottom sheet shows the itinerary as a scrollable list
- Stops are cards, not table rows

### Responsive Breakpoints
- **Mobile (<768px):** Full-bleed map, bottom sheet for itinerary, swipe between days
- **Tablet (768-1024px):** Side panel (40%) + map (60%)
- **Desktop (>1024px):** Side panel (35%) + map (65%)

### Spacing
- **Card padding:** `p-3` (12px)
- **Section gap:** `space-y-3` (12px)
- **Map overlay padding:** `p-4` (16px)

## Components

### Route Card (stop in itinerary)
```
[Persona Icon] Stop Name                    [2h 15m]
              Neighborhood — City
              [Vibe badge] [Category badge]
              "Waypoint description snippet..."
```
- Dark surface (`bg-[#111]`), 1px border, no border-radius, no shadow
- Left accent border in persona color (2px)
- Hover: border brightens to `#333`

### Day Divider
```
━━━ DAY 3 ━━━━━━━━━━━━━━━━━━━━━━━━ 4h 20m total drive
```
- Uppercase, tracked, monospace time
- Horizontal rule using border, not `<hr>`

### Drive Segment (between stops)
```
  │ 1h 45m via I-95 N ─────────────────
  │
```
- Vertical connector line (persona accent color, 1px)
- Distance + route name in muted text

### Persona Selector
- Horizontal pill row, ghost buttons
- Active persona: filled with accent color, white text
- Inactive: transparent bg, `#333` border

### Time Budget Indicator
- Horizontal bar showing used vs. remaining daily drive time
- Fill color: green (under budget) → amber (near limit) → red (over)
- Monospace readout: `3h 15m / 4h 00m`

### Map Markers
- Custom markers in persona accent color
- Selected stop: larger, filled
- Unselected recommendation: smaller, outlined
- Route line: persona accent color, 3px, slight opacity

## Interaction Patterns

### Stop Selection
- Tap a recommendation marker on map → card highlights in sidebar
- Tap "Add to route" → route dynamically recalculates
- Drag to reorder stops within a day → route updates
- Swipe left on a stop card → remove

### Route Building Flow
1. Enter start/end cities → map shows direct route
2. System suggests stops along route within drive budget
3. User taps to add/remove → route updates in real time
4. Switch persona → recommendations refresh (route structure preserved)

## Meta Tags (required on all pages)
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="theme-color" content="#0a0a0a">
```

## Anti-Patterns (never do these)
- No border-radius above 4px (sharp industrial aesthetic)
- No box-shadows (use borders only)
- No gradient backgrounds
- No colored background fills on inactive controls
- No skeleton loaders — use monospace placeholder text: `Loading route...`
- No modals for stop details — use expandable cards or slide-over panels
