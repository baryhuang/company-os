# Mobile View — Implementation Plan

## Scope
Make the app usable on iPhone 14 (390px) and small Android (360px). Pure CSS additions + minimal JSX tweaks. Zero desktop regressions.

---

## Step 1: Global mobile foundation (theme.css)

Add a single `@media (max-width: 767px)` block at the end of theme.css covering:

**TopBar** — stack title above actions, wrap buttons:
- `flex-wrap: wrap`, reduced padding to 16px
- Title row takes full width, actions wrap below
- Buttons get 36px min-height for touch

**Timeline bar** — bigger knobs, tighter padding:
- Knobs go from 20px to 28px with invisible 48px hit area via `::after`
- Labels always visible (no hover on touch)
- Padding reduced to 16px

**Global padding** — all scroll containers from 24px to 16px

**Mobile toggle** — 44px touch target (currently 38px)

**View tabs** — horizontal scroll with momentum

**Tooltips** — constrained to `calc(100vw - 32px)`

**AI modal** — bottom sheet style (100% width, rounded top)

---

## Step 2: Overview cards (theme.css)

- Cards go from `width: 280px; height: 280px` to `width: 100%; height: auto`
- Body overflow becomes visible (no clamp needed in single column)
- Expand button grows to 36px
- Grid gap tightens to 12px

---

## Step 3: Competitor table → cards (theme.css + CompetitorView.tsx)

- Map grid becomes single column
- Table rows become stacked cards with `data-label` pseudo-elements
- Hide thead, each `<td>` shows its column name via `::before`
- **TSX**: add `data-label` attribute to ~6 `<td>` elements

---

## Step 4: OKR/KPI columns (theme.css + OKRTableView.tsx)

- Hide definition column (`.okr-def-col`) and why column (`.okr-why-col`)
- Week cells shrink from 48px to 36px min-width
- **TSX**: add matching classes to `<th>` elements (~3 lines)

---

## Step 5: Partners table → cards (theme.css + PartnersView.tsx)

- Same card pattern as Competitor
- Modal becomes bottom sheet
- **TSX**: add `data-label` to ~8 `<td>` elements

---

## Step 6: VEM document (vem-document.css)

- Stack label cell above value cell on phones
- Table rows become flex-column

---

## Files touched

| File | Change | Lines |
|------|--------|-------|
| `theme.css` | New media query block | ~100 |
| `CompetitorView.tsx` | `data-label` on `<td>` | ~6 |
| `OKRTableView.tsx` | Classes on `<th>` | ~3 |
| `PartnersView.tsx` | `data-label` on `<td>` | ~8 |
| `vem-document.css` | New media query | ~15 |

## Not in scope (later)
- SVG views (Markmap, D3 Tree, Gantt) — need pinch-zoom
- Executive Report — portrait redesign
- Bottom tab bar
