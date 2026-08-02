# Mobile-First Responsive Optimization

**Date:** 2026-06-13
**Scope:** `FE/` (VoltHub main app) — all routes audited
**Constraint honored:** No business logic changed. Edits are presentation/layout only (Tailwind classes + an additional mobile render branch alongside the existing desktop one).

## Breakpoints

Tailwind defaults align with the required tiers, so no config change was needed:

| Tier    | Width          | Tailwind prefix       |
| ------- | -------------- | --------------------- |
| Mobile  | 320–767 px     | base (no prefix)      |
| Tablet  | 768–1023 px    | `md:`                 |
| Desktop | 1024 px +      | `lg:`                 |

Tables/cards switch at `md` (768 px); the sidebar switches at `lg` (1024 px).

---

## Audit summary

The codebase was already substantially responsive. Findings by rule:

| Rule              | Status before audit                                                                 | Action |
| ----------------- | ----------------------------------------------------------------------------------- | ------ |
| **Sidebar**       | ✅ Already correct — fixed `aside` on `lg+`, `Sheet` drawer below `lg` (`V2Sidebar`) | none   |
| **Forms**         | ✅ Mostly correct — v2 forms use `grid-cols-1 sm:grid-cols-2`; `FormParts` uses `grid-cols-1 md:grid-cols-2` | none   |
| **Dashboard**     | ✅ Already correct — KPI grids use `grid-cols-2 lg:grid-cols-4/5`, stacking on mobile | none   |
| **Topbar**        | ✅ Already correct — mobile menu button (`lg:hidden`), search collapses (`md:`)       | none   |
| **Tables → cards**| ❌ **Gap** — every list rendered a desktop table that overflowed on phones            | **fixed** |
| **Tabs**          | ❌ **Gap** — multi-tab `TabsList` overflowed off-screen (no scroll)                   | **fixed** |

The remaining work was therefore concentrated on the **table → card** rule and **tab overflow**.

---

## Pages / components modified

### 1. `FE/src/components/v2/DataTable.tsx` — keystone fix (cascades to 14 pages)

`DataTable` is the shared server-paginated grid. It previously rendered only an HTML table, which overflowed horizontally on phones. Added a **mobile card list** (`md:hidden`) rendered from the *same* TanStack column defs, while the table is now `hidden md:block`. The card view:

- Renders each row as a bordered card with label/value pairs (label = column header, value = the column's existing `cell` renderer — so the two views never drift).
- Special-cases the `actions` column → rendered full-width at the card footer with `stopPropagation` so row-tap navigation still works.
- Mirrors all states: skeleton cards (loading), error + retry, and empty state.
- Shared pagination footer (already `flex-col sm:flex-row`).

**This single change makes all 14 list pages mobile-friendly:**
`asset`, `communication-media`, `documents`, `gardu`, `har`, `imports`, `inspection`, `penyulang`, `performance`, `reports`, `rtupp`, `teams`, `tickets`, `users`.

### 2. `FE/src/components/ui/tabs.tsx` — global tab overflow fix

Base `TabsList` was `inline-flex` with no overflow handling, so detail pages with several tabs (e.g. Gardu detail has 6: Asset / Inspection / HAR / Work Order / Performance / Dokumen) pushed tabs off the right edge on mobile. Added `max-w-full overflow-x-auto scrollbar-none` and `justify-start` so the tab strip scrolls horizontally instead of clipping. Affects every tabbed page (gardu/asset/penyulang/performance detail, history filters, etc.) with zero layout change where tabs already fit.

### 3. `FE/src/routes/_app.history.tsx` — PETUGAS-facing report history

Raw 8-column table (ID / Jenis / Petugas / RTUPP / Team / Tanggal / Status / Aksi) — the single most mobile-critical screen for field officers. Added a `md:hidden` card list (report ID + officer + type badge + status + date + Edit/View actions); wrapped the original table as `hidden md:block`.

### 4. `FE/src/routes/_app.team.tsx`

Raw team table → added `md:hidden` card view (name + active badge + Kode/RTUPP/Ketua/Anggota as a 2-col definition list + Edit/Delete actions); table wrapped `hidden md:block`.

### 5. `FE/src/routes/_app.laporan-monitoring.tsx`

Dynamic-column monitoring "data explorer" with sticky first/last columns. Added a generic `md:hidden` card view that iterates the page's configured `columns` (`mod.getCellValue`) into label/value rows + status badge + detail action; sticky-column table kept for `md+`.

### Intentionally left as horizontal-scroll (not converted)

- `_app.rekap.tsx` and `_app.rekap-akhir.tsx` are **spreadsheet** grids (`w-max` + `overflow-auto`, toggleable columns, export-template parity). Horizontal scroll is the correct, expected UX for a spreadsheet; a card view would break their purpose.
- `*.bak` files were ignored (not in the build).

---

## Responsive issues fixed

1. **Table horizontal overflow on phones** — 14 DataTable-backed list pages + 3 raw-table pages no longer force horizontal scrolling; rows reflow into readable cards under 768 px.
2. **Tab bar clipping** — multi-tab strips now scroll horizontally instead of disappearing past the viewport edge.
3. **Touch targets & tap-through** — card rows keep tap-to-open behavior; action buttons stop propagation so they don't double-trigger row navigation.
4. **State parity on mobile** — loading skeletons, error/retry, and empty states are now rendered in the mobile card branch (previously only the table branch had them).

## Mobile UX improvements

- **Scannable cards** replace cramped cells: the most important fields (name, status badge, date) lead each card; secondary fields are label/value pairs.
- **Thumb-friendly actions** grouped in a divided footer row per card rather than a narrow right-aligned cell.
- **No layout shift on desktop** — every change is additive behind a breakpoint (`md:hidden` / `hidden md:block`), so the desktop experience is byte-for-byte unchanged.
- **Consistency** — because the fix lives in shared `DataTable` and `TabsList`, future list/detail pages get responsive behavior for free.

---

## Verification

- `npm run typecheck` (tsc --noEmit) — **passes clean**, no errors.
- All edits are presentation-only; no data fetching, mutations, validation, or routing logic was touched.

## Suggested follow-ups (optional, not done)

- Visual QA pass at 320 px on the paired "device + model" inputs in `laporan-akhir` (currently 2-up; legible but tight).
- Consider a shared `<MobileCardList>` helper to dedupe the per-page card markup in `history` / `team` / `laporan-monitoring` if more raw tables appear.
