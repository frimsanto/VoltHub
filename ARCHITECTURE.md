# VoltReport — Architecture & Application Flow

Panduan ini merangkum alur keseluruhan aplikasi VoltReport (pelaporan lapangan PLN) agar Claude bisa cepat memahami struktur repo, arsitektur, dan cara kerja tiap bagian tanpa harus membaca ulang seluruh kode.

## Gambaran Umum

VoltReport adalah aplikasi pelaporan operasional untuk tim lapangan PLN (RTUPP), dengan 3 aplikasi terpisah dalam satu repo:

- **BE/** — Backend API tunggal (Express + Prisma + MySQL) yang melayani FE dan portal.
- **FE/** — Aplikasi utama (web + mobile via Capacitor) untuk PETUGAS/ADMIN/MANAGER/MASTER.
- **portal/** — Executive Portal terpisah (TanStack Start SSR), read-only, untuk manajemen level atas.

4 role kanonik: **MASTER, MANAGER, ADMIN, PETUGAS** (single source of truth di `BE/src/auth/roles.ts`, dengan normalisasi dari enum lama seperti SUPERADMIN→MASTER, ADMIN_RTUPP→ADMIN, USER→PETUGAS).

Alur inti kerja lapangan: **Laporan Awal → Work Order (WO) → Laporan GI/HAR/Inspeksi (sesuai domain: GI/GH/MP) → Approval/Workflow**. Laporan Akhir versi lama sudah dipensiunkan dari UI, diganti "Laporan WO" yang menyatukan hasil RC/LR/ES/CB + penyebab/tindakan/rekomendasi + foto.

---

## BE/ (Backend)

**Stack:** Express.js 4 + TypeScript, Prisma ORM 5 + MySQL, JWT + bcryptjs untuk auth, express-validator, express-rate-limit, helmet, cors, multer (upload), exceljs/pdfkit (generate laporan), swagger-ui-express (dokumentasi API), Sentry (error tracking), @anthropic-ai/sdk (modul AI), ffmpeg (kompresi video laporan GI). Test: Vitest.

### Entry point — `BE/src/index.ts`
Bootstrap Sentry, helmet, CORS custom (allowlist + origin Capacitor + regex LAN), body parsing, morgan logging, `auditContext` (AsyncLocalStorage untuk IP/User-Agent), static file avatar, auto-create folder upload, mount `routes`, jalankan worker `notificationQueue` dan `videoCompressorQueue`.

### Struktur `BE/src/`
- `auth/roles.ts` — definisi & normalisasi 4 role kanonik.
- `config/` — validasi env, konfigurasi sentry & swagger.
- `controllers/`, `services/`, `validators/`, `utils/` — layer legacy (V1) pendukung `routes/`.
- `middlewares/` — `auth.ts` (autentikasi JWT), `rbac.ts` (guard role), `auditContext.ts`, `errorHandler.ts`, `idempotency.ts` (Idempotency-Key), `rateLimit.ts`, `versionGate.ts` (blokir mobile client versi lama), `upload.ts`/`uploadMiddleware.ts`/`avatarUpload.ts`, `sentryUser.ts`, `logger.ts`, `validate.ts`.
- `routes/` — endpoint legacy V1 (mount langsung di `/api/...`): auth, dashboard, laporanAwal/Akhir, history, upload, export, users, rekap/rekapAkhir, teams, rtupp, personil, audit, push.
- `modules/` — domain modul V2 (masing-masing biasanya `*.routes.ts` + `*.controller.ts` + `*.service.ts`), mount di bawah `/api/v1/*`:
  - `ai` — AI brain (intent → Allowed Query Registry → scoped query-services, tidak pernah SQL langsung/bypass RBAC).
  - `asset-categories`, `asset-sim-cards`, `asset-types`, `assets` — master data & registry aset.
  - `audit-logs` — trail audit V2.
  - `bays` — bay/penyulang detail per GI.
  - `communication-media` — media komunikasi SCADA.
  - `dashboard`, `kpi`, `stats` — agregasi dashboard & KPI (stats bersifat publik untuk halaman login).
  - `documents`, `reports` — dokumen & generator laporan (PDF/Excel) + verifikasi tanda tangan digital.
  - `feeders` — penyulang, termasuk mapping GH↔RTUPP.
  - `gh-shared`, `mp-shared` — helper bersama untuk domain Gardu Hubung & MP.
  - `gi-dashboard` — dashboard khusus domain GI.
  - `gis` — peta monitoring (GeoJSON, bbox, clustering).
  - `har` — HAR (pemeliharaan korektif) generik.
  - `imports` — engine import Excel (gardu/asset/performance/GH feeders).
  - `inspections` — inspeksi generik (findings, photos).
  - `laporan-gi`, `laporan-har-gi` — Laporan Inspeksi & HAR untuk Gardu Induk.
  - `laporan-inspeksi-gh`, `laporan-har-gh` — Laporan Inspeksi & HAR untuk Gardu Hubung (152 kolom, reuse `GiReportStatus`).
  - `laporan-inspeksi-mp`, `laporan-har-mp` — Laporan Inspeksi & HAR untuk MP (Meter Point/lainnya).
  - `locations` — data lokasi/gardu.
  - `notifications` — inbox notifikasi real-time.
  - `organizations`, `up3s` — hierarki organisasi PLN (Organization → Up3 → RTUPP).
  - `performance` — data performa harian (RC/LR/ES/CB).
  - `scada-realtime` — telemetry real-time SCADA.
  - `tickets` — tiket operasional.
  - `work-orders` — Work Order (WO): assignment tim, bay, attachment, gating "Laporan WO wajib".
  - `workflow` — state machine approval generik (DRAFT→SUBMITTED→REVIEWED→APPROVED→CLOSED); engine sudah lengkap tapi masih terpisah dari entity utama (status masing-masing modul pakai enum sendiri).

### Routing (`BE/src/routes/index.ts`)
- Legacy endpoints langsung di root `/api/...` (`/auth`, `/dashboard`, `/laporan-awal`, `/laporan-akhir`, `/history`, `/upload`, `/export`, `/users`, `/rekap`, `/rekap-akhir`, `/teams`, `/rtupp`, `/personil`, `/audit`, `/push`).
- `versionGate` middleware jalan di semua route kecuali `/health` dan `/version`.
- Sub-router `v1` mount semua modul V2 di `/api/v1/*` (mis. `/v1/organizations`, `/v1/assets`, `/v1/work-orders`, `/v1/gi/inspeksi`, `/v1/gh/har`, `/v1/gis`, `/v1/scada-realtime`, `/v1/ai`).
- `/v1/verify` dan `/v1/stats` publik (tanpa auth) — verifikasi QR tanda tangan & statistik anonim halaman login.

### Prisma schema (`BE/prisma/schema.prisma`) — model per kelompok
- **Identity/Auth:** User, DeviceToken, RefreshToken, Role
- **Org/master data:** Organization, Up3, RTUPP, Personil, Team, Location, Feeder, Bay, AssetCategory, AssetTypeRef
- **Assets:** Asset, AssetSimCard, CommunicationMedia
- **Laporan legacy (V1):** LaporanAwal, LaporanAkhir, Attachment, ReportValidation, ActivityLog
- **Laporan GI/GH/MP (V2):** LaporanGi, LaporanHarGi, LaporanGiAttachment, LaporanInspeksiGh, LaporanHarGh, LaporanInspeksiGhAttachment, LaporanHarGhAttachment, LaporanInspeksiMp, LaporanHarMp, LaporanInspeksiMpAttachment, LaporanHarMpAttachment
- **Inspections/HAR generik:** Inspection, InspectionFinding, InspectionPhoto, HarReport, HarDetail
- **Documents/Reports:** Document, GeneratedReport, ReportSignature, ReportDownload
- **Import engine:** ImportJob, ImportError
- **Ops:** PerformanceDaily, Ticket, WorkOrder, WorkOrderAttachment
- **SCADA/GIS:** SiteGeometry, TelemetryPoint, TelemetryValue, ScadaGardu
- **Workflow/Notification:** WorkflowInstance, WorkflowTransition, Notification, NotificationDelivery, IdempotencyKey
- **Audit:** AuditLog
- **AI:** AiConversation, AiFeedback, AiUserPreference, AiAlias, AiIntent

### Cross-cutting concerns
- Rate limiting (`rateLimit.ts`, `apiLimiter`)
- Idempotency key (`idempotency.ts` + tabel `IdempotencyKey`) — mencegah duplikasi report saat retry offline
- Audit logging (`auditContext.ts` + `AuditLog`/`ActivityLog` + modul `audit-logs`)
- Notifikasi berbasis queue (`notification.queue.ts` + `Notification`/`NotificationDelivery`)
- Sentry error tracking
- Video compression worker (upload laporan GI)
- Version gating force-update mobile

---

## FE/ (Aplikasi Utama)

**Stack:** React + Vite + TanStack Router (file-based routing, penamaan flat-dot mis. `_app.dashboard.tsx`) + TanStack Query, Zustand untuk state, Radix UI/shadcn-style components, Capacitor (shell native Android/iOS: kamera, geolokasi, push, network, preferences).

### Routing (`FE/src/routes/`)
Prefix `_app.*` menandakan route bersarang di dalam layout terautentikasi (`_app.tsx`). Domain fitur utama:
- Dashboard, asset, gardu, bay
- Inspeksi/HAR per domain: `inspeksi-gi`, `inspeksi-gh`, `inspeksi-mp`, `har-gi`, `har-gh`, `har-mp`
- Legacy: `laporan-awal`, `laporan-akhir`
- `gis`, `scada-realtime`, `work-order`, `tickets`, `performance`, `kpi`
- `imports`, `documents`, `reports`
- `teams`/`personil`/`users`/`rtupp`, `monitoring`
- `sync` (offline sync), `ai-search`, `profile`
- `verify/$id` — halaman publik verifikasi tanda tangan digital via QR
- Family `v2.*` — catch-all untuk layer V2 yang lebih baru

Route guard: `lib/route-guards.ts` dan `lib/v2/route-guards.ts`.

### State management
Zustand stores: `stores/auth.ts` (normalisasi role backend → role FE: petugas/admin/manager/superadmin), `stores/mobileNav.ts`, `stores/notification.ts`. Dukungan offline-first di `lib/offline/` (penting untuk tim lapangan tanpa sinyal).

### Navigasi berbasis role
`Sidebar.tsx` dan `v2/V2Sidebar.tsx` — nav item digating berdasarkan role hasil normalisasi (MASTER/SUPERADMIN→superadmin, MANAGER→manager, ADMIN/ADMIN_RTUPP→admin, PETUGAS→petugas).

---

## portal/ (Executive Portal)

Aplikasi terpisah, read-only, untuk level eksekutif/manajemen.

**Stack:** TanStack Start (SSR, `@tanstack/react-start`) + TanStack Router + TanStack Query, Bun runtime (`bun.lock`, `bunfig.toml`), Tailwind v4, Radix UI.

**Routes:** hanya beberapa — `index.tsx`, `executive.tsx` (dashboard eksekutif di balik `ExecutiveAuthProvider`/`LoginGate`, menampilkan `ExecutiveDashboard` dengan KPI/trend/approval stats/asset stats), `__root.tsx`. Mengonsumsi API BE V2 (KPI/workflow/asset/gis/performance) tanpa duplikasi logika bisnis.

---

## Folder Top-Level Lainnya

| Folder | Fungsi |
|---|---|
| `docs/` | Dokumentasi proyek — spesifikasi, ERD, PRD, audit, handover (lihat daftar di bawah) |
| `dataset_scada/` | Excel mentah SCADA/telemetry & inspeksi/HAR sumber (GI/GH/Gardu RC), dipakai untuk seeding/referensi |
| `dokumen_lengkap/` | Dokumen Word resmi (PRD, desain ERD, domain model, business rules, strategi migrasi, spesifikasi API) — set dokumentasi "resmi" |
| `catatan/` | Catatan kerja informal — spreadsheet aset, foto bukti WhatsApp, ekspor data RTU |
| `icon/` | Aset branding (logo VoltHub, ikon chatbot) |
| `portal/` | Aplikasi Executive Portal (lihat di atas) |

### Isi `docs/` (inventaris nama file)

**Seri spesifikasi inti (bernomor):** 01_ARCHITECTURE_REVISION, 02_REQUIREMENT_ANALYSIS, 03_PRD, 04_DOMAIN_MODEL, 05_ERD, 06_MIGRATION_STRATEGY, 07_PERMISSION_MATRIX, 08_IMPORT_STRATEGY, 09_DASHBOARD_KPI, 10_DATA_DICTIONARY, 11_BUSINESS_RULES, 12_UAT_CATALOG, 13_SCREEN_SPECIFICATION, 14_GARDU_360, 15_API_SPEC, 16_BACKLOG, 17_EXECUTION_PACK.

**Dokumentasi subsistem:** AI_ASSISTANT_FOUNDATION, AI_BRAIN_V1, ANDROID_RELEASE, APPROVAL_WORKFLOW, AUDIT_TRAIL_COVERAGE, BACKEND_HANDOVER, BACKUP, DATABASE_OPTIMIZATION, DEPLOYMENT_CHECKLIST, DESIGN_SYSTEM, DIGITAL_SIGNATURE, DISASTER_RECOVERY, ENVIRONMENTS, EXECUTIVE_PORTAL, FINAL_ASSESSMENT, FIREBASE_SETUP, FRONTEND_FOUNDATION_AUDIT, FRONTEND_GAP_ANALYSIS, FRONTEND_IMPLEMENTATION_PLAN, GIS_MODULE, GI_OUTPUT_SPEC, GI_REPORTS, GI_STATUS_AUDIT, GI_UAT_GAP, GI_UAT_SCRIPT, GO_LIVE_CHECKLIST, GO_LIVE_GAP_ANALYSIS, KPI_DASHBOARD, MOBILE_RESPONSIVE_OPTIMIZATION, NOTIFICATION_SYSTEM, OFFLINE_ARCHITECTURE, OFFLINE_SYNC_REPORT, PHASE1_FRONTEND_AUDIT, PRODUCTION_READINESS_AUDIT, REBRANDING_REPORT, REPORT_GENERATOR, SCADA_DATA_ANALYSIS, SECURITY_AUDIT, SEED_DATA_PLAN, STAGING_DEPLOYMENT, UAT_CHECKLIST, UAT_PLAN, UAT_TEST_PLAN, VOLTHUB_MIGRATION_AUDIT, WEB_ADMIN_WIREFRAMES, WORKFLOW_COMPLETION, WORK_ORDER_ERD, WORK_ORDER_GAP_ANALYSIS, WORK_ORDER_IMPLEMENTATION_ROADMAP, WORK_ORDER_PHASE1_BACKEND, WORK_ORDER_PHASE2_FRONTEND, WORK_ORDER_PRD, WORK_ORDER_WORKFLOW, known-issues.

Juga tersedia: `openapi.yaml` (dikonsumsi FE via script `gen:api` untuk generate typed API client) dan `VoltReport_V2.postman_collection.json`.

---

## Alur Kerja Utama (End-to-End)

1. **Laporan Awal** — petugas lapangan membuat laporan awal saat mulai tugas (semua role petugas, restored untuk semua tanpa terbatas RTUPP tertentu).
2. **Work Order (WO)** — dibuat/di-assign, berisi `bays`, `work_order_assignments`, `work_order_attachments`. WO punya `requiredReports` (JSON, mis. `["GI"]`/`["HAR"]`) yang men-gate penyelesaian — WO tidak bisa selesai tanpa laporan wajib terisi.
3. **Laporan domain (GI/GH/MP)** — Inspeksi (preventif) atau HAR (korektif), wajib terkait WO (workOrderId wajib untuk beberapa modul terbaru, mis. Laporan GH). Struktur form multi-section dengan foto, relay flags (3-state), kubikel dinamis per penyulang untuk GH.
4. **Approval/Validasi** — laporan melalui status (ReportStatus unified: PENDING/APPROVED/REVISED, dst.), divalidasi ADMIN/MANAGER di halaman `/validasi`.
5. **Dashboard & KPI** — agregasi performa (RC/LR/ES/CB), GIS monitoring, executive portal read-only untuk manajemen.
6. **AI Assistant** — floating button di FE, chat via Claude tool-use (scoped ke Allowed Query Registry, tidak bypass RBAC), fallback ke engine lokal bila tanpa API key.
