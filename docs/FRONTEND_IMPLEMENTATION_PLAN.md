# VoltReport V2 — Frontend Implementation Plan

Version: 1.0
Date: 2026-06-03
Source of Truth: `TDD_FRONTEND.md`, `docs/openapi.yaml`
Companion: `docs/FRONTEND_GAP_ANALYSIS.md`

> Backend RELEASE READY — tidak ada perubahan schema/API/RBAC/architecture. Rencana ini hanya untuk frontend. **Bukan instruksi untuk mulai coding** — lihat completion criteria di TASK utama.

---

## 0. Prinsip & Urutan

Mengikuti `TDD_FRONTEND.md §26 (Frontend Development Order)` dan pola arsitektur `Page → Feature Component → API Client → Backend`.

**Fondasi reusable dari `FE/`** (lihat Gap Analysis §3): UI kit shadcn, `lib/api/client.ts`, `stores/auth.ts`, Sidebar RBAC, RHF+Zod, PWA+Capacitor.

**Skala kompleksitas:** 🟢 Low · 🟡 Medium · 🔴 High

**Prasyarat lintas-fase (Phase 0 — Foundation Setup):**
- Tambah dependency `@tanstack/react-table` + `openapi-typescript`.
- Generate types dari `docs/openapi.yaml` → `src/lib/api/types.gen.ts`.
- Bangun `DataTable`, `PageHeader`, `EntityFormModal`, `ConfirmDeleteDialog`, `RoleGate`, `StatusBadge` (komponen lintas modul).
- Port `lib/api/client.ts`, `stores/auth.ts`, error/toast standard.

---

## Phase 1 — Authentication · Layout · Navigation · Dashboard

**Tujuan:** Shell aplikasi dapat login, ter-route dengan RBAC, dan menampilkan dashboard.

### Pages
- Login (`/login`)
- Forbidden (`/unauthorized` — 403)
- Not Found (`/404`)
- App Layout wrapper (`/_app`)
- Dashboard (`/dashboard`)
- Profile (`/profile`)

### Components
- `AppLayout` (sidebar + topbar + outlet) — port dari FE `_app.tsx`
- `Sidebar` V2 (menu 4-role: SUPERADMIN/ADMIN/ADMIN_RTUPP/USER) — adaptasi FE `Sidebar.tsx`
- `Topbar`, `NotificationDropdown` — port
- `RoleGate`, route guards — adaptasi `lib/route-guards.ts`
- Dashboard widgets: `StatCard` ×5, `RecentActivities`, `RecentImports`, `RecentReports`, `QuickSearch`
- `LoginForm` (RHF + Zod)

### API Dependencies
- `POST /api/auth/login`, `POST /api/auth/refresh` (♻️ existing `auth.ts`)
- Dashboard widget counts — *agregasi dari resource V2* (`/locations`, `/assets`, `/inspections`, `/har-reports`, `/documents` via `meta.total`; `/imports/jobs`, `/reports/generated` untuk recent). Tidak ada endpoint dashboard tunggal di contract → komposisi client-side.
- AI Quick Search → `GET /ai/assets/search`

### Estimated Complexity
🟡 Medium — fondasi besar reusable, tapi dashboard widget perlu agregasi multi-endpoint + RBAC matrix baru.

---

## Phase 2 — Locations · Feeders · Assets · Communication Media

**Tujuan:** Master Data CRUD lengkap + Asset Detail kaya.

### Pages
- Location: List, Detail, Create, Edit
- Feeder: List, Detail, Create, Edit
- Asset: List, Detail, Create, Edit
- Communication Media: List, Detail/Create/Edit (standalone + nested di Asset)

### Components
- `DataTable` + `DataTableToolbar` (search/filter/pagination/column toggle) — dipakai semua list
- `LocationForm`, `FeederForm` (filter by Location), `AssetForm`
- `CommunicationMediaForm`
- `AssetHierarchyTree` (parent/child)
- `AssetDetailSections` (komposisi): `SimCardList`/`SimCardForm`, `CommunicationMediaList`, `InspectionHistory`, `HarHistory`, `DocumentsTab` (Timeline reuse)
- `ConfirmDeleteDialog` (soft-delete)

### API Dependencies
- Locations: `GET/POST /locations`, `GET/PUT/DELETE /locations/{id}`
- Feeders: `GET/POST /feeders`, `GET/PUT/DELETE /feeders/{id}`
- Assets: `GET/POST /assets`, `GET/PUT/DELETE /assets/{id}`, `GET /assets/{assetId}/sim-cards`
- SIM Cards: `GET/PUT/DELETE /sim-cards/{id}`
- Comm Media: `GET/POST /communication-media`, `GET/PUT/DELETE /communication-media/{id}`

### Estimated Complexity
🔴 High — Asset Detail adalah halaman terkompleks (hirarki + 5 seksi nested + relasi SIM/Media). Locations/Feeders/Comm Media sendiri 🟡 Medium.

---

## Phase 3 — Inspection · HAR · Documents

**Tujuan:** Modul operasional lapangan dengan upload.

### Pages
- Inspection: List, Detail, Create
- HAR: List, Detail, Create
- Documents: List, Upload, Detail

### Components
- `FindingsEditor` (CRUD findings dalam inspeksi)
- `PhotoUploader` (multi-foto + preview + progress) — reuse `ImagePreviewModal`
- `InspectionStatusTracker`, `StatusBadge`
- `HarDetailEditor` (detail rows + asset status + analysis + notes)
- `DocumentUploader`, `DocumentPreview` (PDF + image), `DownloadButton`
- `HistoryTimeline` (reuse `Timeline.tsx`)

### API Dependencies
- Inspections: `GET/POST /inspections`, `GET/PUT/DELETE /inspections/{id}`, `GET/POST /inspections/{id}/findings`, `POST /findings/{id}/photos`
- HAR: `GET/POST /har-reports`, `GET/PUT/DELETE /har-reports/{id}`, `GET/POST /har-reports/{id}/details`, `GET/PUT/DELETE /har-reports/{id}/details/{detailId}`
- Documents: `GET/POST /documents`, `GET/DELETE /documents/{id}`

### Estimated Complexity
🔴 High — upload multipart (foto/dokumen), nested findings/details, status tracking, preview PDF.

---

## Phase 4 — Reports · Import · AI Search

**Tujuan:** Output (PDF), bulk ingest (Excel), pencarian cerdas.

### Pages
- Reports: Generated Reports (generate + history + download)
- Import: Import Jobs, Import Detail, Import Errors
- AI: AI Asset Search

### Components
- `ReportGeneratePanel` (pilih Inspection/HAR → generate), `ReportHistoryTable`, `ReportDownloadButton`
- `ImportWizard` (upload Excel), `ImportProgress`, `ImportSummary`, `ImportErrorTable`
- `AiSearchBar`, `AiSearchResultCard` (Location, Assets, SIM, Comm Media, Last Inspection, Last HAR, Document Count)

### API Dependencies
- Reports: `POST /reports/generate/inspection`, `POST /reports/generate/har`, `GET /reports/generated`, `GET /reports/generated/{id}/download`
- Imports: `POST /imports/assets`, `GET /imports/jobs`, `GET /imports/jobs/{id}`, `GET /imports/jobs/{id}/errors`
- AI: `GET /ai/assets/search`

### Estimated Complexity
🟡 Medium — pola tabel + upload sudah matang dari Fase 2–3; AI Search ringan; download blob perlu handling.

---

## Phase 5 — Administration (Users · Teams · RTUPP)

**Tujuan:** Manajemen pengguna & organisasi (RBAC V2).

### Pages
- Users (List/Create/Edit, role assignment)
- Teams (List/Create/Edit)
- RTUPP (List/Create/Edit)

### Components
- `UserForm` (role: SUPERADMIN/ADMIN/ADMIN_RTUPP/USER), `RoleSelect`
- `TeamForm`, `RtuppForm`
- `DataTable` (reuse)
- `RoleGate` untuk visibilitas menu/aksi

### API Dependencies
- ♻️ Sebagian dari existing `users.ts`, `teams.ts`, `rtupp.ts` (verifikasi terhadap contract V2; **tidak mengubah contract**).

### Estimated Complexity
🟡 Medium — pola CRUD reusable; kompleksitas pada matrix RBAC & scoping ADMIN_RTUPP.

---

## Phase 6 — Mobile (Inspection · HAR · Documents)

**Tujuan:** Akses lapangan via mobile (PWA+Capacitor existing, atau RN Expo per TDD — keputusan arah).

### Pages
- Login, Dashboard (Quick Actions), Profile
- Inspection: List, Create (Findings + Photo)
- HAR: List, Create (Asset Status)
- Documents: Upload (Camera → Preview → Upload)

### Components
- `MobileShell` / bottom-nav
- `QuickActions` (Create Inspection/HAR, Upload, Search)
- `CameraCapture` (reuse `lib/native/camera.ts`), `OfflineIndicator`, offline queue (reuse `lib/offline/*`)
- Reuse `FindingsEditor`, `HarDetailEditor`, `PhotoUploader` (responsive)

### API Dependencies
- Subset Inspection / HAR / Documents (sama dengan Fase 3) + auth.

### Estimated Complexity
🔴 High — offline-first, kamera native, sinkronisasi; ditambah ketidakpastian arah RN Expo vs PWA+Capacitor.

---

## Ringkasan Kompleksitas per Fase

| Phase | Fokus | Kompleksitas |
|-------|-------|--------------|
| 0 | Foundation Setup (deps, types, shared components) | 🟡 Medium |
| 1 | Auth · Layout · Nav · Dashboard | 🟡 Medium |
| 2 | Locations · Feeders · Assets · Comm Media | 🔴 High |
| 3 | Inspection · HAR · Documents | 🔴 High |
| 4 | Reports · Import · AI Search | 🟡 Medium |
| 5 | Administration | 🟡 Medium |
| 6 | Mobile | 🔴 High |

## Definition of Done (per TDD §25)
- Terhubung ke backend release · semua endpoint terintegrasi · TypeScript tanpa error · build berhasil · RBAC UI berjalan · upload berjalan · PDF download berjalan · import berjalan · AI Search berjalan.
