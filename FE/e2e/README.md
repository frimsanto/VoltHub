# VoltHub E2E suite (Playwright)

Production-grade end-to-end coverage of the business-critical VoltHub workflows.
**45 tests** across 10 feature areas, plus a one-time auth setup.

## Prerequisites

1. **Backend** running (default `http://localhost:3001`) with a **seeded DB**.
   `reset-roles` seeds `MASTER/MANAGER/ADMIN/PETUGAS` with password `Volthub123!`.
2. **Frontend** — Playwright auto-starts `npm run dev` unless `E2E_BASE_URL`
   points at an already-running app.

Credentials are env-overridable (`E2E_PETUGAS_EMAIL`, `E2E_ADMIN_EMAIL`,
`E2E_PASSWORD`, …) — see `helpers.ts`.

## Running

```bash
npx playwright test                 # everything (desktop + mobile)
npx playwright test --project=chromium
npx playwright test --project=mobile-chromium
npx playwright test gis.spec.ts     # one feature
npx playwright test --ui            # interactive
```

## How it's structured

| File | Area | Tests |
|------|------|-------|
| `auth.spec.ts` | Login (petugas/admin), invalid login, logout, session persistence | 5 |
| `dashboard.spec.ts` | Loads, KPI cards, recent activity, admin overview | 4 |
| `gis.spec.ts` | Open, search gardu/asset, layer toggle, status/wilayah filter, marker detail | 7 |
| `laporan-awal.spec.ts` | Create+submit, validation errors, draft affordance, view in history | 4 |
| `laporan-akhir.spec.ts` | Create+upload+submit, attach doc, validation errors, view | 4 |
| `riwayat.spec.ts` | Open, URL-synced filter, detail dialog | 3 |
| `profile.spec.ts` | Open, edit, upload photo, persist after refresh & after re-login | 5 |
| `validasi.spec.ts` | Open queue, approve, reject (fixture-seeded pending reports) | 3 |
| `export.spec.ts` | Rekap XLSX (Standard + K3 templates), empty-dataset export | 3 |
| `mobile.spec.ts` | Dashboard, GIS sheets, FAB actions, Riwayat, Profile (Pixel-7) | 5 |
| `lifecycle.spec.ts` | Real PENDING→APPROVED/REJECTED transitions, PENDING edit+resubmit, post-decision lock, Akhir approve | 7 |
| `timeline.spec.ts` | Approval timeline: Created marker, Ditolak+reason, Disetujui | 4 |
| `draft.spec.ts` | localStorage autosave: indicator, restore-on-return, finish+submit, cleared-after-submit | 4 |
| `personil.spec.ts` | Tim Pelaksana picker: open, add (chip+count), remove | 3 |
| `notifications.spec.ts` | Top-bar bell: present, panel opens, genuine empty state | 3 |

### Shared building blocks

- **`selectors.ts`** — single source of truth for every `data-testid`. Specs
  import `T.*` so a renamed hook breaks compilation, not silently a test.
- **`helpers.ts`** — `login`/`logout`, `createLaporanAwal`/`createLaporanAkhir`,
  `dismissSwal`, `ONE_PX_PNG`, `uniqueMarker`.
- **`fixtures.ts`** — pre-authenticated `petugasPage` / `adminPage` (reuse the
  saved sessions, so most specs skip the login round-trip) and a `pendingReport`
  fixture that seeds a uniquely-marked PENDING report for the validasi tests.
- **`auth.setup.ts`** — the `setup` project; logs in each role once and writes
  `e2e/.auth/*.json`. The desktop/mobile projects depend on it.

## Session reuse & efficiency

The `setup` project authenticates once; feature specs build contexts from the
saved `storageState` (the app persists tokens in `localStorage` under
`voltreport-auth`). `auth.spec.ts` deliberately uses a fresh, un-authed page.

## Adaptations to reality

Three requested cases don't map to existing features and were adapted instead of
faked:

- **Save Draft (Laporan Awal)** — the "Simpan Draft" button is a no-op and the
  "Autosaved…" text is static. We assert the affordance is present rather than a
  non-existent persistence flow.
- **Export Rekap PDF** — the Rekap grid exports XLSX only; PDF lives in the
  separate Report Generator. Covered as a second XLSX template (K3) export.
- **GIS marker detail** — Leaflet markers are canvas; the detail panel is opened
  deterministically via search (which auto-selects the top match) instead of a
  fragile canvas click.

Data-dependent GIS cases (Wilayah filter, marker-detail-via-search) self-skip
when the seed has no matching geocoded sites, rather than fail flakily.
