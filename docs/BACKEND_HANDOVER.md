# VoltReport V2 — Backend Handover

**Version:** 2.0.0
**Status:** Backend Roadmap Complete (Sprint 1–6)
**Date:** 2026-06-03
**Scope:** V2 Asset Management domain, additive on the existing V1 (PLN field reporting) backend.

---

## 1. Executive Summary

VoltReport V2 adds an **Asset Management** domain to the existing VoltReport backend. It models the
PLN telecontrol/SCADA field hierarchy — **Location → Feeder → Asset → (SIM Cards / Communication
Media)** — plus the operational records built on top of it: **Inspections**, **HAR** (Hasil Analisa
Rutin), **Documents**, generated **PDF Reports**, an **Excel Import Engine**, and an **AI-ready
search** endpoint.

Key delivery facts:

- **10 modular modules** under `BE/src/modules/`, each following a strict
  `Route → Controller → Service → Repository → Prisma` layering.
- **29 OpenAPI paths / 48 operations** mounted under `/api/v1`, fully documented in Swagger
  (`/api/docs`) and exported to `docs/openapi.yaml`.
- **Additive & non-destructive**: V2 lives in the same MySQL database and codebase as V1. No V1
  table, route, or behaviour was changed. 5 forward-only Prisma migrations.
- **Verified**: every module passed TypeScript (0 errors), ESLint (0 warnings), Prisma validation,
  and live end-to-end API tests, plus a 10/10 Backend Release Audit.

> **Architectural deviation (approved):** TDD specifies PostgreSQL; the implementation is **additive
> on the existing MySQL** database to avoid disrupting the live V1 app. This was an explicit,
> approved decision. All other TDD contracts (enums, API shapes, RBAC matrix) are honoured.

---

## 2. Database Overview

**Engine:** MySQL (Prisma ORM). UUID string PKs (`@db.VarChar(36)`), `DateTime(0)` audit columns,
soft delete via `deletedAt` on master data.

### 2.1 Tables (V2)

| Table | Purpose | Soft delete | Audit cols |
|-------|---------|:-----------:|:----------:|
| `locations` | GI/GH/GARDU sites | ✅ | ✅ |
| `feeders` | Feeders under a location | ✅ | ✅ |
| `assets` | RTU/FDI/Rectifier/Battery/Router/Modem/Radio (self-hierarchy) | ✅ | ✅ |
| `asset_sim_cards` | SIM cards per asset (slotted) | — (cascade) | ✅ |
| `communication_media` | Comm links per location | ✅ | ✅ |
| `inspections` | Field inspection headers | — | ✅ |
| `inspection_findings` | Per-asset findings of an inspection | — (cascade) | ✅ |
| `inspection_photos` | Photos per finding | — (cascade) | ✅ |
| `har_reports` | HAR report headers | — | ✅ |
| `har_details` | Per-asset status rows of a HAR | — (cascade) | ✅ |
| `documents` | Uploaded files (location/asset scoped) | ✅ | ✅ |
| `generated_reports` | Generated PDF metadata | — | (generatedBy/At) |
| `import_jobs` | Excel import run summary | — | (createdBy/At) |
| `import_errors` | Per-row import failures | — (cascade) | — |

### 2.2 Enums

`LocationType` (GI, GH, GARDU) · `AssetType` (RTU, FDI, RECTIFIER, BATTERY_BANK, ROUTER, MODEM,
RADIO) · `AssetStatus` (ACTIVE, WARNING, DAMAGED, RETIRED) · `CommunicationMediaType` (GSM_4G,
GSM_2G, RADIO_DATA, FO, ICON_GSM, ICON_IPVPN) · `InspectionStatus` (NORMAL, WARNING, CRITICAL) ·
`HarStatus` (NORMAL, WARNING, CRITICAL, OFFLINE) · `DocumentType` (PHOTO, BERITA_ACARA, MANUAL_BOOK,
SERTIFIKAT, INSPECTION_DOC, OTHER).
`ImportJob.status` is a `VARCHAR(50)` (PENDING/PROCESSING/SUCCESS/FAILED) per TDD.

### 2.3 Relations

```
Location 1─┬─* Feeder
           ├─* Asset ──┬─* AssetSimCard           (cascade on Asset delete)
           │           ├─* InspectionFinding
           │           ├─* InspectionPhoto
           │           ├─* HarDetail
           │           ├─* Document
           │           └── parentAsset/children    (self relation: RTU→MODEM, RECTIFIER→BATTERY_BANK)
           ├─* CommunicationMedia
           ├─* Inspection 1─* InspectionFinding 1─* InspectionPhoto
           ├─* HarReport   1─* HarDetail           (@@unique[harReportId, assetId])
           ├─* Document
           └─* GeneratedReport

ImportJob 1─* ImportError                           (cascade)
User (V1) 1─* Inspection (as inspector)
```

Notable constraints: `assets.assetCode` unique, `assets.serialNumber` unique,
`feeders @@unique(locationId, feederCode)`, `asset_sim_cards @@unique(assetId, simSlot)`,
`har_details @@unique(harReportId, assetId)`.

### 2.4 Migrations (forward-only, applied)

| Order | Migration | Adds |
|-------|-----------|------|
| 1 | `20260603125411_v2_sprint1_asset_management` | locations, feeders, assets, asset_sim_cards, communication_media + enums |
| 2 | `20260603131505_v2_sprint2_inspection` | inspections, inspection_findings, inspection_photos + InspectionStatus |
| 3 | `20260603132227_v2_sprint3_har` | har_reports, har_details + HarStatus |
| 4 | `20260603132743_v2_sprint4_documents_reports` | documents, generated_reports + DocumentType |
| 5 | `20260603135616_v2_sprint5_import_engine` | import_jobs, import_errors |

`prisma migrate status` → **Database schema is up to date.**

---

## 3. Module Overview

All modules live in `BE/src/modules/<name>/` with files `*.validation.ts` (Zod), `*.repository.ts`
(only Prisma access), `*.service.ts` (business rules), `*.controller.ts` (HTTP glue), `*.routes.ts`.

| Module | Base path | Highlights |
|--------|-----------|-----------|
| **Locations** | `/locations` | CRUD, soft delete, search (`code/name/up3`), filter `type`. Write: SUPERADMIN/ADMIN. |
| **Feeders** | `/feeders` | CRUD; enforces location FK + unique `(locationId, feederCode)`. Write: SUPERADMIN/ADMIN. |
| **Assets** | `/assets` | CRUD, hierarchy (`parentAssetId`), filters `assetType/locationId/status`, search. Rules: unique code/serial, no self-parent, no 1-level cycle, block delete if children. Write: SUPERADMIN/ADMIN/ADMIN_RTUPP. |
| **Asset SIM Cards** | `/assets/:id/sim-cards`, `/sim-cards/:id` | Nested list/create + flat update/delete; unique slot per asset; hard delete (cascade with asset). |
| **Communication Media** | `/communication-media` | CRUD, soft delete, filter `mediaType/locationId`. |
| **Inspection** | `/inspections`, `/findings/:id/photos` | Create inspection → add findings → upload photos (multipart). `inspectorId` from JWT. Finding asset must belong to inspection location. |
| **HAR** | `/har-reports` | Create report → add/update/delete details. One detail per asset per report. OFFLINE status supported. |
| **Documents** | `/documents` | Multipart upload, soft delete, location/asset scoped, filters. |
| **Reports** | `/reports` | Generate Inspection/HAR **PDF** (pdfkit), list + download generated reports. |
| **Import Engine** | `/imports` | Asset bulk import from **Excel** (exceljs), per-row validation, ImportJob + ImportError summary. |
| **AI Search** | `/ai/assets/search` | AI-ready aggregation: location + assets + comm media + last inspection + last HAR + doc count. |

---

## 4. API Overview

- **Base path:** `/api/v1` (V1 remains at `/api/...`, untouched).
- **Auth:** `Authorization: Bearer <JWT>` on all V2 endpoints. Login is the existing V1
  `POST /api/auth/login` (returns `accessToken` / `refreshToken`).
- **Response envelope (all endpoints):**
  ```json
  { "success": true, "message": "…", "data": {}, "meta": { "page":1,"limit":20,"total":0,"totalPages":0 } }
  ```
  Errors: `{ "success": false, "message": "…", "error": {} }`.
- **Error codes:** 400 validation · 401 unauthorized · 403 forbidden · 404 not found ·
  409 conflict (duplicate) · 422 validation/business rule · 500 internal.
- **Counts:** 29 paths, 48 operations. Live docs at `/api/docs`; machine spec at `/api/docs.json`
  and `docs/openapi.yaml`.

Endpoint list (grouped):

```
Locations            GET /locations · POST /locations · GET/PUT/DELETE /locations/:id
Feeders              GET /feeders · POST /feeders · GET/PUT/DELETE /feeders/:id
Assets               GET /assets · POST /assets · GET/PUT/DELETE /assets/:id
SIM Cards            GET/POST /assets/:assetId/sim-cards · PUT/DELETE /sim-cards/:id
Communication Media  GET /communication-media · POST · GET/PUT/DELETE /communication-media/:id
Inspections          GET /inspections · POST · GET /inspections/:id · POST /inspections/:id/findings · POST /findings/:id/photos
HAR                  GET /har-reports · POST · GET /har-reports/:id · POST /:id/details · PUT/DELETE /:id/details/:detailId
Documents            GET /documents · POST · GET/DELETE /documents/:id
Reports              POST /reports/generate/inspection · POST /reports/generate/har · GET /reports/generated · GET /reports/generated/:id/download
Imports              POST /imports/assets · GET /imports/jobs · GET /imports/jobs/:id · GET /imports/jobs/:id/errors
AI                   GET /ai/assets/search?q=
```

---

## 5. RBAC Matrix

Roles (existing): `SUPERADMIN`, `ADMIN`, `ADMIN_RTUPP`, `PETUGAS`. The TDD "USER" role maps to
**PETUGAS** (field officer). Enforced via `authenticate` + `authorize(...roles)` middleware.

| Module | SUPERADMIN | ADMIN | ADMIN_RTUPP | PETUGAS (USER) |
|--------|:---------:|:-----:|:-----------:|:--------------:|
| Locations | CRUD | CRUD | Read | Read |
| Feeders | CRUD | CRUD | Read | Read |
| Assets | CRUD | CRUD | CRUD | Read |
| SIM Cards | CRUD | CRUD | CRUD | Read |
| Communication Media | CRUD | CRUD | CRUD | Read |
| Inspections | CRUD | CRUD | CRUD | Create / View |
| HAR | CRUD | CRUD | CRUD | Create / View¹ |
| Documents | CRUD | CRUD | CRUD | Upload / View² |
| Reports | CRUD | Generate | Generate | View |
| Imports | Yes | Yes | Yes | — |
| AI Search | Yes | Yes | Yes | Yes (read) |

¹ HAR: any authenticated role may create reports/details; **PUT/DELETE of details** is restricted to
SUPERADMIN/ADMIN/ADMIN_RTUPP.
² Documents: any authenticated role may upload/view; **DELETE** is restricted to
SUPERADMIN/ADMIN/ADMIN_RTUPP.

Read endpoints require authentication only. See **Known Issues #1** for the ADMIN_RTUPP scoping caveat.

---

## 6. Upload Architecture

```
Client ──multipart/form-data──▶ Route (multer) ──▶ Controller ──▶ Service ──▶ Repository
                                     │
                                     ▼ disk: BE/uploads/{images|documents}/<safe-name>
```

- **Library:** `multer` (existing V1 infra reused). Disk storage routes images →
  `uploads/images/`, other files → `uploads/documents/`. Filenames sanitised via
  `safeUploadFilename`.
- **Bootstrapped dirs** (in `index.ts`): `laporan-awal, laporan-akhir, temp, avatars, images,
  documents` (the last two were added during V2 — previously missing).
- **Inspection photos:** `uploadImage.single('photo')` (images ≤ 10 MB) → stored URL
  `/uploads/images/<file>`, linked to the finding's asset.
- **Documents:** `upload.single('file')` (images/pdf/etc) → URL `/uploads/{images|documents}/<file>`,
  metadata in `documents`.
- **Static serving:** `/uploads/...` is served by Express (V1 mount), so stored URLs are directly
  retrievable.
- **Note:** TDD lists Firebase Storage as the target. Current implementation uses **local disk**
  (V1 parity). Swapping to Firebase is a future, isolated change behind the repository/controller.

---

## 7. PDF Architecture

```
POST /reports/generate/{inspection|har}
   └▶ ReportService ──▶ {inspection|har}Repository.findById (data)
                    ──▶ report.pdf.ts (pdfkit → Buffer)
                    ──▶ write Buffer to uploads/documents/report-<uuid>.pdf
                    ──▶ ReportRepository.create (GeneratedReport row)
GET /reports/generated/:id/download ──▶ res.sendFile(absolutePdfPath)
```

- **Library:** `pdfkit` (chosen over puppeteer to avoid a ~300 MB Chromium download; pure server-side
  JS). Templates in `modules/reports/report.pdf.ts` (`buildInspectionPdf`, `buildHarPdf`).
- **Report number:** `INSP-YYYYMMDD-XXXXXXXX` / `HAR-YYYYMMDD-XXXXXXXX`.
- **Storage:** PDF on disk under `uploads/documents/`, metadata (`reportNumber`, `reportType`,
  `pdfUrl`, `locationId`, `generatedBy/At`) in `generated_reports`.
- Verified: download returns a valid `%PDF` binary.

---

## 8. Import Architecture

```
POST /imports/assets (xlsx, in-memory multer)
   └▶ ImportService.importAssets
        1. persist file → uploads/documents, create ImportJob (PROCESSING)
        2. import.parser.ts (exceljs): header-map + skip empty cells → rows
        3. per row: Zod validate → resolve locationCode→location, feederCode→feeder
                    → assetService.create  (reuses ALL asset business rules)
        4. collect per-row failures → import_errors (rowNumber, message, rawData JSON)
        5. finalize ImportJob (totalRows / successRows / failedRows / status)
```

- **Parser:** built on the existing **`exceljs`** dependency — no new parser library. Header labels
  are normalised and aliased (e.g. `kodelokasi`→`locationCode`).
- **Columns:** `locationCode*`, `feederCode`, `assetType*`, `assetCode*`, `assetName*`, `brand`,
  `model`, `serialNumber`, `tahunOperasi`, `status`, `notes`.
- **Validation engine:** per-row Zod, then reuse of `assetService.create` so unique/FK/hierarchy
  rules apply consistently. A row failure never aborts the batch.
- **Status:** `SUCCESS` if ≥1 row imported (partial success allowed), `FAILED` if all rows failed or
  the file is unparseable.
- **RBAC:** SUPERADMIN/ADMIN/ADMIN_RTUPP only.

---

## 9. AI Architecture

```
GET /ai/assets/search?q=KB305
   └▶ AiService.searchAssets
        resolveLocation(q): exact code → fuzzy code/name
        Promise.all → assets(+sim), communicationMedia, lastInspection, lastHar, documentCount
        return { location, assetCount, assets, communicationMedia, lastInspection, lastHar, documentCount }
```

- Provides the **structured, AI-ready feed** described in TDD §15 (intended consumers: WhatsApp AI,
  dashboard, global search). It is a deterministic data aggregation — **no external LLM call**.
- "Last" inspection/HAR are ordered by date (verified to return the most recent record).
- **Out of scope (intentionally):** actual LLM/WhatsApp wiring. That requires credentials
  (ANTHROPIC/OPENAI/WhatsApp) and a separate business decision; not implemented.

---

## 10. Known Issues

| # | Severity | Issue | Notes / Mitigation |
|---|----------|-------|--------------------|
| 1 | WARNING | **ADMIN_RTUPP scope not enforced.** Matrix says "CRUD within own RTUPP", but V2 models have no `rtuppId` FK, so only the *role* is gated, not per-RTUPP ownership. | Requires a schema change (add `rtuppId`/ownership) — a freeze decision. Currently ADMIN_RTUPP can write across all RTUPPs. |
| 2 | WARNING | **`npm audit`** reports transitive vulnerabilities (moderate/high/critical). | Schedule `npm audit fix`; review before production. |
| 3 | INFO | **DB is MySQL, not PostgreSQL** (TDD target). | Approved additive decision; revisit if a Postgres migration is desired. |
| 4 | INFO | **File storage is local disk**, not Firebase (TDD target). | Isolated behind upload layer; swap later if needed. |
| 5 | INFO | **AI = data feed only**; no LLM/WhatsApp integration. | Needs credentials + business sign-off. |
| 6 | INFO | Import is **synchronous** (request blocks until done). | Fine for moderate files; consider a queue/`import_jobs` async worker for very large sheets. |

No FAILURE-level issues. No blocking defects.

---

## 11. Deployment Notes

- **Runtime:** Node 22 LTS, TypeScript, Express. Dev: `npm run dev` (tsx watch). Build: `npm run
  build` → `dist/`, run `node dist/index.js`.
- **Required env** (`BE/.env`): `DATABASE_URL` (MySQL), `JWT_SECRET`, `JWT_REFRESH_SECRET`,
  `API_PREFIX` (default `/api`), `UPLOAD_DIR` (default `uploads`), plus existing V1 vars
  (Sentry, FCM, rate-limit, app version). No new mandatory env was introduced by V2.
- **Migrations:** `npx prisma migrate deploy` applies all 5 V2 migrations (forward-only, additive).
- **Prisma client:** regenerate with `npx prisma generate`. On Windows, stop the dev server first
  (the running process locks the query-engine DLL → EPERM otherwise).
- **Uploads:** ensure `uploads/{images,documents}` exist/writable (auto-created on boot).
- **Docs:** Swagger UI at `${API_PREFIX}/docs`, raw spec at `${API_PREFIX}/docs.json` (public, no
  auth, mounted before the rate limiter).
- **Seed users (dev):** `superadmin@voltreport.com`, `admin@voltreport.com`, `petugas@voltreport.com`
  (seed password `password123`; live DB password may differ — do not reset live credentials).

---

## 12. Future Roadmap

1. **ADMIN_RTUPP scoping** — add RTUPP ownership to V2 master data and enforce per-RTUPP CRUD
   (schema + RBAC change; needs approval).
2. **AI/LLM integration** — wire the `/ai/assets/search` feed into a WhatsApp/LLM assistant
   (credentials + provider decision).
3. **`vw_asset_summary` DB view** — materialise the AI summary (TDD §7) for dashboard/global search
   performance.
4. **Async import worker** — move large imports to a background queue using `import_jobs` status.
5. **Firebase Storage / Postgres** — optional migrations to the TDD-target infra.
6. **Automated tests** — add Vitest unit/integration tests for the V2 modules (V1 already has a test
   harness).
7. **Security** — `npm audit fix`; review upload MIME/type hardening for the new endpoints.
8. **Frontend** — proceed to `TDD_FRONTEND.md` (see release status for recommendations).

---

*Artifacts accompanying this handover: `docs/openapi.yaml` (OpenAPI 3.0.3),
`docs/VoltReport_V2.postman_collection.json` (Postman v2.1.0).*
