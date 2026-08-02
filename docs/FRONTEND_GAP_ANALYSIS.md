# VoltReport V2 — Frontend Gap Analysis

Version: 1.0
Date: 2026-06-03
Status: Frontend Architecture Phase
Scope: Analisa kesenjangan antara codebase frontend existing (`FE/`, `portal/`) terhadap `TDD_FRONTEND.md` + `docs/openapi.yaml`.

> **Backend dianggap selesai (RELEASE READY).** Dokumen ini TIDAK mengubah schema, API contract, RBAC, atau architecture freeze. Hanya analisa frontend.

---

## 0. Ringkasan Eksekutif

Temuan utama hasil inspeksi codebase:

| Direktori | Isi sebenarnya | Relevansi terhadap V2 Admin App |
|-----------|----------------|----------------------------------|
| `FE/` | **Aplikasi V1 (Legacy Reporting App)** — domain Laporan Awal/Akhir, Rekap, Validasi, Monitoring, Export, RTUPP/Team/User. PWA + Capacitor. | **Infrastruktur reusable** (UI kit, API client, auth, layout, offline), **bukan** domain V2. |
| `portal/` | **Landing/Distribution Page ("VoltReport Hub")** — TanStack Start, halaman download + status + docs statis. | **Tidak relevan** sebagai admin app. Marketing site. |

**Kesimpulan:** Tidak ada satupun halaman domain V2 Asset Management (Locations, Feeders, Assets, Communication Media, Inspection, HAR, Documents, Reports, Import, AI Search) yang sudah ada. Yang tersedia adalah **fondasi teknis yang matang** di `FE/` yang dapat diangkat (lift) menjadi basis aplikasi V2.

**Status frontend V2:** `~0%` fitur domain · `~70%` fondasi teknis (UI kit, client, auth, layout, RBAC pattern, offline) sudah tersedia & reusable.

---

## 1. Existing Pages

### 1.1 `FE/` — Routes existing (V1 domain, BUKAN V2)

| Route | File | Domain | Status terhadap V2 |
|-------|------|--------|--------------------|
| `/login` | `routes/login.tsx` | Auth | ♻️ Reusable (pattern auth) |
| `/change-password` | `routes/change-password.tsx` | Auth | ♻️ Reusable |
| `/unauthorized` | `routes/unauthorized.tsx` | Auth (403 page) | ♻️ Reusable langsung |
| `/404` | `routes/404.tsx` | Error page | ♻️ Reusable langsung |
| `/dashboard` | `routes/_app.dashboard.tsx` | Dashboard V1 | ⚠️ Perlu ditulis ulang (widget beda) |
| `/profile` | `routes/_app.profile.tsx` | Profile | ♻️ Reusable (minor) |
| `/laporan/create` | `routes/_app.laporan.create.tsx` | Laporan V1 | ❌ Tidak relevan V2 |
| `/laporan-awal`, `/laporan-awal/$id` | `_app.laporan-awal.*` | Laporan V1 | ❌ Tidak relevan V2 |
| `/laporan-akhir`, `/laporan-akhir/$id` | `_app.laporan-akhir.*` | Laporan V1 | ❌ Tidak relevan V2 |
| `/rekap`, `/rekap-akhir` | `_app.rekap.tsx`, `_app.rekap-akhir.tsx` | Rekap V1 | ❌ Tidak relevan V2 |
| `/validasi` | `_app.validasi.tsx` | Validasi V1 | ❌ Tidak relevan V2 |
| `/monitoring` | `_app.monitoring.tsx` | Monitoring V1 | ❌ Tidak relevan V2 |
| `/history` | `_app.history.tsx` | Riwayat V1 | ❌ Tidak relevan V2 |
| `/export` | `_app.export.tsx` | Export V1 | ❌ Tidak relevan V2 |
| `/users` | `_app.users.tsx` | User mgmt | ♻️ Reusable sebagian (Administration) |
| `/team` | `_app.team.tsx` | Team mgmt | ♻️ Reusable sebagian (Administration) |
| `/rtupp` | `_app.rtupp.tsx` | RTUPP mgmt | ♻️ Reusable sebagian (Administration) |

### 1.2 `portal/` — Routes existing

| Route | File | Status terhadap V2 |
|-------|------|--------------------|
| `/` | `routes/index.tsx` | Landing page "Hub" — ❌ tidak relevan admin app |
| `__root` | `routes/__root.tsx` | Shell marketing — ❌ tidak relevan |

**Legend:** ♻️ Reusable · ⚠️ Rewrite sebagian · ❌ Tidak relevan untuk V2

---

## 2. Missing Pages

Berdasarkan `TDD_FRONTEND.md` (Sitemap §6, modul §7–§17), berikut halaman V2 yang **BELUM ADA**:

### Dashboard
- [ ] Dashboard V2 (widget: Total Locations, Total Assets, Total Inspections, Total HAR, Total Documents, Recent Activities, Recent Imports, Recent Reports, Quick Search)

### Master Data — Locations
- [ ] Location List
- [ ] Location Detail
- [ ] Create Location
- [ ] Edit Location

### Master Data — Feeders
- [ ] Feeder List
- [ ] Feeder Detail
- [ ] Create Feeder
- [ ] Edit Feeder

### Master Data — Assets
- [ ] Asset List
- [ ] Asset Detail (hierarchy + SIM Cards + Comm Media + Inspection History + HAR History + Documents)
- [ ] Create Asset
- [ ] Edit Asset

### Master Data — Communication Media
- [ ] Communication Media List
- [ ] Communication Media Detail / Create / Edit (atau nested di Asset Detail)

### Operations — Inspection
- [ ] Inspection List
- [ ] Inspection Detail
- [ ] Create Inspection (Findings + Photo Upload)

### Operations — HAR
- [ ] HAR List
- [ ] HAR Detail
- [ ] Create HAR (Asset Status + Analysis + Notes)

### Operations — Documents
- [ ] Document List
- [ ] Upload Document
- [ ] Document Detail (PDF/Image preview, download, delete)

### Reports
- [ ] Generated Reports (Generate Inspection PDF, Generate HAR PDF, Download, History)

### Import
- [ ] Import Jobs (list)
- [ ] Import Detail (progress, summary)
- [ ] Import Errors

### AI
- [ ] AI Asset Search

### Administration
- [ ] Users (V2 RBAC: SUPERADMIN / ADMIN / ADMIN_RTUPP / USER)
- [ ] Teams
- [ ] RTUPP

### Profile
- [ ] Profile V2 (♻️ dapat di-port dari V1)

---

## 3. Existing Components

### 3.1 UI Kit (shadcn) — `FE/src/components/ui/` (LENGKAP, ♻️ reusable penuh)

`accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip`

> Catatan: `ui/table.tsx` adalah primitive shadcn (markup `<table>`), **bukan** TanStack Table data-grid. Lihat §4 / §6.

### 3.2 Komponen aplikasi — `FE/src/components/` (♻️ sebagian reusable)

| Komponen | Fungsi | Reuse V2 |
|----------|--------|----------|
| `Sidebar.tsx` | Navigasi RBAC (menu per role, collapsible, mobile sheet) | ♻️ Adaptasi (ganti menu V2) |
| `Topbar.tsx` | Header app | ♻️ Reusable |
| `EmptyState.tsx` | Empty state | ♻️ Reusable langsung |
| `Skeleton.tsx` | Loading skeleton | ♻️ Reusable langsung |
| `ErrorBoundary.tsx` | Error boundary | ♻️ Reusable langsung |
| `Timeline.tsx` | Timeline (cocok utk Inspection/HAR History) | ♻️ Reusable |
| `ImagePreviewModal.tsx` | Preview gambar | ♻️ Reusable (Documents) |
| `FormParts.tsx` | Field form helpers | ♻️ Reusable |
| `NotificationDropdown.tsx` | Notifikasi | ♻️ Reusable |
| `OfflineIndicator.tsx` | Status offline | ♻️ Reusable (Mobile) |
| `PWAUpdatePrompt.tsx` / `ForceUpdateGate.tsx` | PWA update gate | ♻️ Reusable (Mobile) |
| `common.tsx` | Util komponen | ♻️ Reusable |

### 3.3 Infrastruktur lib — `FE/src/lib/`, `hooks/`, `stores/` (♻️ reusable)

- `lib/api/client.ts` — Axios instance + interceptor (Bearer, refresh-token de-dupe, 401→refresh, 426 force-update, 403/5xx handling, Sentry). **Core asset.**
- `stores/auth.ts` — Zustand auth store (token, user, role, sidebar state).
- `stores/notification.ts` — Zustand notifikasi.
- `lib/route-guards.ts` — Route guard RBAC.
- `lib/secureStorage.ts`, `lib/store.ts`, `lib/swal.ts`, `lib/utils.ts` — util.
- `lib/native/*` (camera, geolocation, push) + `lib/offline/*` (queue, sync, attachmentStore) — ♻️ Mobile/PWA.
- `hooks/` — `use-mobile`, `useIdleLogout`, `useOnlineStatus`, `useOfflineQueueCount`.
- `lib/sentry.ts`, `lib/appVersion.ts` — observability + versioning.

---

## 4. Missing Components

Komponen yang dibutuhkan oleh modul V2 tetapi **belum ada**:

### Data Layer / Tabel
- [ ] **`DataTable` (TanStack Table)** — generic data-grid: sorting, pagination server-side, column toggle, row selection. *(TanStack Table belum terinstal — lihat §6 catatan dependency.)*
- [ ] `DataTableToolbar` — search + filter + column visibility.
- [ ] `Pagination` server-driven (bind ke `meta.page/limit/total`).

### Domain Components
- [ ] `AssetHierarchyTree` — view parent/child asset.
- [ ] `AssetDetailSections` — SIM Cards, Comm Media, Inspection History, HAR History, Documents (komposisi di Asset Detail).
- [ ] `SimCardList` / `SimCardForm`.
- [ ] `CommunicationMediaList` / `CommunicationMediaForm`.
- [ ] `FindingsEditor` — tambah/edit findings inspeksi.
- [ ] `PhotoUploader` — multi-foto + preview + progress (bind ke `/findings/{id}/photos`).
- [ ] `HarDetailEditor` — HAR detail rows (`/har-reports/{id}/details`).
- [ ] `DocumentUploader` + `DocumentPreview` (PDF + image).
- [ ] `ReportGeneratePanel` + `ReportDownloadButton`.
- [ ] `ImportWizard` (upload excel) + `ImportProgress` + `ImportErrorTable`.
- [ ] `AiSearchBar` + `AiSearchResultCard`.
- [ ] `StatusBadge` generik V2 (Inspection/HAR status).
- [ ] `EntityFormModal` standar (Create/Edit dialog konsisten).
- [ ] `ConfirmDeleteDialog` (soft-delete).
- [ ] `RoleGate` komponen (show/hide by role — V2 4-role matrix).

### Layout
- [ ] `AppLayout` V2 (`_app` route wrapper untuk admin) — dapat di-port dari FE `_app.tsx`.
- [ ] `PageHeader` (title + breadcrumb + actions) standar.

---

## 5. Existing API Integration

### 5.1 `FE/src/lib/api/` — client V1 (domain lama)

| File | Endpoint domain | Relevansi V2 |
|------|-----------------|--------------|
| `auth.ts` | `/auth/login`, `/auth/refresh` | ♻️ **Reusable** (auth flow sama) |
| `client.ts` | Axios core + interceptor | ♻️ **Reusable penuh** |
| `users.ts` | User mgmt | ♻️ Reusable sebagian (Administration) |
| `teams.ts` | Team mgmt | ♻️ Reusable sebagian |
| `rtupp.ts` | RTUPP mgmt | ♻️ Reusable sebagian |
| `upload.ts` | Upload file | ♻️ Pattern reusable (Documents/Photos) |
| `dashboard.ts` | Dashboard V1 | ⚠️ Rewrite (widget V2 beda) |
| `personil.ts` | Personil V1 | ❌ Tidak relevan |
| `laporanAwal.ts`, `laporanAkhir.ts` | Laporan V1 | ❌ Tidak relevan |
| `rekap.ts`, `rekapAkhir.ts` | Rekap V1 | ❌ Tidak relevan |
| `history.ts` | Riwayat V1 | ❌ Tidak relevan |
| `export.ts` | Export V1 | ❌ Tidak relevan |

### 5.2 `portal/`

- `lib/api/example.functions.ts` — contoh stub TanStack Start. ❌ Tidak relevan.

**Kesimpulan integrasi existing:** Hanya **auth + client core** (dan sebagian users/teams/rtupp/upload) yang relevan. Tidak ada integrasi terhadap resource domain V2.

---

## 6. Missing API Integration

Berdasarkan `docs/openapi.yaml` (source of truth), berikut endpoint V2 yang **belum punya API client / hooks**:

### Locations
- [ ] `GET /locations`, `POST /locations`
- [ ] `GET /locations/{id}`, `PUT /locations/{id}`, `DELETE /locations/{id}`

### Feeders
- [ ] `GET /feeders`, `POST /feeders`
- [ ] `GET /feeders/{id}`, `PUT /feeders/{id}`, `DELETE /feeders/{id}`

### Assets
- [ ] `GET /assets`, `POST /assets`
- [ ] `GET /assets/{id}`, `PUT /assets/{id}`, `DELETE /assets/{id}`
- [ ] `GET /assets/{assetId}/sim-cards` (+ create)

### Asset SIM Cards
- [ ] `GET/PUT/DELETE /sim-cards/{id}`

### Communication Media
- [ ] `GET /communication-media`, `POST /communication-media`
- [ ] `GET/PUT/DELETE /communication-media/{id}`

### Inspections
- [ ] `GET /inspections`, `POST /inspections`
- [ ] `GET/PUT/DELETE /inspections/{id}`
- [ ] `GET/POST /inspections/{id}/findings`
- [ ] `POST /findings/{id}/photos` (upload)

### HAR
- [ ] `GET /har-reports`, `POST /har-reports`
- [ ] `GET/PUT/DELETE /har-reports/{id}`
- [ ] `GET/POST /har-reports/{id}/details`
- [ ] `GET/PUT/DELETE /har-reports/{id}/details/{detailId}`

### Documents
- [ ] `GET /documents`, `POST /documents` (upload)
- [ ] `GET/DELETE /documents/{id}`

### Reports
- [ ] `POST /reports/generate/inspection`
- [ ] `POST /reports/generate/har`
- [ ] `GET /reports/generated`
- [ ] `GET /reports/generated/{id}/download`

### Imports
- [ ] `POST /imports/assets` (upload excel)
- [ ] `GET /imports/jobs`, `GET /imports/jobs/{id}`
- [ ] `GET /imports/jobs/{id}/errors`

### AI
- [ ] `GET /ai/assets/search`

### Rekomendasi pembangkitan tipe (sesuai TDD §3)
- [ ] Setup **`openapi-typescript`** (atau `orval`) untuk generate Request/Response types dari `docs/openapi.yaml` → hindari drift manual terhadap contract. *(Belum terinstal di `FE/package.json`.)*

---

## 7. Catatan Dependency

Stack TDD §1 vs `FE/package.json` (existing):

| Kebutuhan TDD | Terinstal? | Catatan |
|---------------|-----------|---------|
| React + TypeScript + Vite | ✅ | React 19 |
| TanStack Router | ✅ | v1.168 |
| TanStack Query | ✅ | v5.83 |
| TailwindCSS | ✅ | v4 |
| Shadcn UI | ✅ | UI kit lengkap |
| React Hook Form | ✅ | v7.71 |
| Zod | ✅ | v3.24 |
| **TanStack Table** | ❌ | **Belum** — wajib untuk DataTable (§4) |
| **openapi-typescript / orval** | ❌ | **Belum** — direkomendasikan TDD §3 |
| Axios | ✅ | client core sudah matang |
| Zustand | ✅ | auth/notif store |
| Capacitor (Mobile) | ✅ | siap Fase Mobile |

> Mobile TDD menyebut **React Native Expo** (§1), namun codebase existing memakai **PWA + Capacitor**. Ini perlu keputusan arah (lihat rekomendasi di akhir alur tugas). Tidak diputuskan di dokumen ini.

---

## 8. Keputusan Arsitektur yang Perlu Diklarifikasi (bukan implementasi)

1. **Basis aplikasi V2:** membuat app baru ATAU mengangkat fondasi `FE/` (UI kit + client + auth + layout) sebagai basis, lalu mengganti domain V1 → V2. *(Rekomendasi: lift `FE/` foundation.)*
2. **Nasib domain V1** di `FE/` (Laporan/Rekap/Validasi/Monitoring): dipertahankan berdampingan atau di-pensiunkan.
3. **Tambah dependency:** `@tanstack/react-table` + `openapi-typescript`.
4. **Mobile:** PWA+Capacitor (existing) vs RN Expo (TDD).

---

## 9. Skor Kesiapan

| Area | Kesiapan | Keterangan |
|------|----------|------------|
| Fondasi teknis (UI kit, client, auth, layout, RBAC) | 🟢 ~70% | Reusable dari `FE/` |
| Domain V2 (pages) | 🔴 0% | Belum ada |
| Domain V2 (API integration) | 🔴 ~5% | Hanya auth/client core |
| Data-grid (TanStack Table) | 🔴 0% | Dependency belum ada |
| Type generation dari OpenAPI | 🔴 0% | Belum disetup |
| Mobile | 🟡 Infra ada | Arah perlu diputuskan |

**Overall V2 Frontend Readiness: 🔴 Tahap awal — fondasi kuat, domain belum dibangun.**
