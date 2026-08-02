# Enterprise Report Generator

Generate official, branded reports automatically from existing field-report
entities, in **PDF** and **Excel**, with company branding, immutable
**versioning**, and a per-download **history** audit trail.

This feature is **additive** — it extends the existing `reports` module and the
`generated_reports` table without breaking any prior behaviour. Legacy endpoints
(`/reports/generate/inspection`, `/reports/generate/har`) keep working.

---

## 1. Scope

| Capability            | Delivered |
|-----------------------|-----------|
| Sources               | Laporan Awal, Laporan Akhir, Inspection, HAR |
| Formats               | PDF (`pdfkit`), Excel (`exceljs` streaming) |
| Template-based        | One format-agnostic `ReportModel` per source; renderers consume it |
| Company branding      | Env-driven letterhead (logo + company block) on every artifact |
| Versioning            | Immutable, auto-incrementing `version` per (source, format) |
| Download history      | `report_downloads` audit log + `downloadCount` counter |
| Large datasets        | Auto-paginated PDF tables + streamed Excel rows (constant memory) |

---

## 2. Architecture

```
                 ┌────────────────────────────────────────────────┐
   Source entity │ report.repository.loadSource(sourceType, id)   │
 (LaporanAwal /  │   → Prisma read with the needed includes        │
  LaporanAkhir / └───────────────┬────────────────────────────────┘
  Inspection /                    │
  HAR)                            ▼
                 ┌────────────────────────────────────────────────┐
   Template      │ report.templates.buildReportModel(...)          │
   layer         │   normalises ANY source → ReportModel           │
                 │   { title, meta[], sections[ {columns, rows} ] } │
                 └───────────────┬────────────────────────────────┘
                                 │ format-agnostic
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
   report.pdf.buildReportPdf(model)   report.excel.buildReportExcelToFile(model, path)
   (branded, paginated A4 Buffer)     (branded, streamed .xlsx)
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                 report.service.generate()  →  persists a versioned
                                               GeneratedReport row
```

**Why a normalised `ReportModel`?** Adding a *format* never touches a *source*,
and adding a *source* never touches a *renderer*. The model is row-oriented
(`sections[].rows: string[][]`) so unbounded child collections render into both
a paginated PDF and a streamed worksheet.

### Backend files (`BE/src/modules/reports/`)

| File                   | Responsibility |
|------------------------|----------------|
| `report.branding.ts`   | Env-driven company branding (name/unit/address/logo/footer), memoised |
| `report.templates.ts`  | `SourceType`/`ReportFormat` enums + per-source normalisers → `ReportModel` |
| `report.pdf.ts`        | Renders a `ReportModel` to a branded, auto-paginated A4 PDF buffer |
| `report.excel.ts`      | Streams a `ReportModel` to a branded `.xlsx` file (WorkbookWriter) |
| `report.repository.ts` | Source loaders, version count, persistence, download log |
| `report.service.ts`    | Orchestration: load → normalise → render → persist; download + history |
| `report.controller.ts` | HTTP handlers |
| `report.routes.ts`     | Route wiring + RBAC |
| `report.validation.ts` | Zod schemas |

---

## 3. Data model

Extends `generated_reports` (additive columns; `locationId` relaxed to NULL
because Laporan Awal/Akhir carry free-text `lokasiGardu`, not an FK) and adds a
`report_downloads` table.

Migration: `prisma/migrations/20260606000000_v2_enterprise_report_generator_additive`.

```prisma
model GeneratedReport {
  id            String  @id @default(uuid())
  locationId    String? // nullable (was required)
  reportNumber  String  // e.g. INSP-20260606-AB12CD-V2
  reportType    String  // mirrors sourceType (back-compat)
  pdfUrl        String  // generic stored-file path (PDF or XLSX)
  format        String  @default("PDF")  // PDF | EXCEL
  sourceType    String? // LAPORAN_AWAL | LAPORAN_AKHIR | INSPECTION | HAR
  sourceId      String?
  version       Int     @default(1)      // immutable, per (source, format)
  title         String?
  templateKey   String? // e.g. INSPECTION_DEFAULT
  fileSize      Int?
  downloadCount Int     @default(0)
  generatedBy   String?
  generatedAt   DateTime @default(now())
  downloads     ReportDownload[]
}

model ReportDownload {        // download-history audit trail
  id           String   @id @default(uuid())
  reportId     String
  downloadedBy String?  // userId
  ipAddress    String?
  downloadedAt DateTime @default(now())
  report       GeneratedReport @relation(..., onDelete: Cascade)
}
```

**Versioning.** Each generate call computes `version = count(existing rows for
(sourceType, sourceId, format)) + 1`. Artifacts are never overwritten — a
regenerate yields `…-V2`, `…-V3`, … so prior official copies remain downloadable
and auditable.

---

## 4. API

Base: `/api/v1/reports` (Bearer auth on all routes). Documented in Swagger
(`/api/docs`, tag **Reports**).

| Method | Path | Roles | Purpose |
|--------|------|-------|---------|
| POST | `/reports/generate` | SUPERADMIN, ADMIN, PETUGAS | **Unified** generate (any source × format) |
| POST | `/reports/generate/inspection` | ″ | Back-compat (Inspection PDF) |
| POST | `/reports/generate/har` | ″ | Back-compat (HAR PDF) |
| GET  | `/reports/generated` | any auth | List artifacts (paginated, filterable) |
| GET  | `/reports/generated/:id/download` | any auth | Stream file; records a download |
| GET  | `/reports/generated/:id/downloads` | any auth | Download history (audit trail) |

### Generate request

```http
POST /api/v1/reports/generate
Content-Type: application/json

{ "sourceType": "INSPECTION", "sourceId": "<uuid>", "format": "EXCEL" }
```

`sourceType` ∈ `LAPORAN_AWAL | LAPORAN_AKHIR | INSPECTION | HAR`,
`format` ∈ `PDF | EXCEL` (default `PDF`). Returns `201` with the persisted
`GeneratedReport`.

### List filters

`page, limit, locationId, reportType, sourceType, sourceId, format`.
Each row includes `_count.downloads`.

### Download

Streams the stored file with the correct `Content-Type`
(`application/pdf` or the `.xlsx` spreadsheet MIME) and an
`attachment; filename="<reportNumber>.<ext>"`. The call atomically inserts a
`report_downloads` row and increments `downloadCount` in one transaction.

---

## 5. Branding

Driven entirely by env vars (see `BE/src/config/env.ts`) — re-brand without code:

| Env var | Default |
|---------|---------|
| `REPORT_COMPANY_NAME` | `PT PLN (Persero)` |
| `REPORT_COMPANY_UNIT` | `Unit Pelaksana Pengatur Distribusi` |
| `REPORT_COMPANY_ADDRESS` | Jakarta address |
| `REPORT_COMPANY_LOGO` | *(empty)* — absolute path or path under `UPLOAD_DIR` |
| `REPORT_FOOTER_NOTE` | auto-generated note |

Applied as a letterhead (logo + company block + accent rule) on the PDF first
page band and the Excel **Ringkasan** sheet. A missing/unreadable logo silently
degrades to the text wordmark. Branding is memoised; `resetBrandingCache()`
clears it for tests.

---

## 6. Large-dataset handling

- **Excel** uses ExcelJS `stream.xlsx.WorkbookWriter` with
  `useSharedStrings: false`: rows are committed and flushed to disk as written,
  so a section with hundreds of thousands of rows exports at a near-constant
  memory footprint. Header rows are frozen for usability.
- **PDF** tables wrap and break across pages (`ensureSpaceWithRow` re-draws the
  section header after each page break); page numbering is stamped via
  `bufferPages`. No section can overflow the page.
- Source reads use the existing indexed Prisma includes; child collections are
  ordered deterministically (`createdAt asc`).

---

## 7. Frontend

### Export actions — `ReportExportMenu`
`FE/src/features/v2/reports/ReportExportMenu.tsx` — a reusable dropdown
(`Export ▾ → Unduh PDF / Unduh Excel`) gated by the `reports.generate`
capability. Generates the chosen format for one record and downloads it. Wired
into the detail pages:

- `_app.inspection.$id.tsx` (`INSPECTION`)
- `_app.har.$id.tsx` (`HAR`)
- `_app.laporan-awal.$id.tsx` (`LAPORAN_AWAL`)
- `_app.laporan-akhir.$id.tsx` (`LAPORAN_AKHIR`)

### Download Center — `_app/reports`
`FE/src/routes/_app.reports.tsx` — lists every generated artifact across all
sources with **Sumber / Format / Versi / Ukuran / Unduhan** columns, filters
(source type, format, location), a **Generate Laporan** modal (pick source →
record → format), and a per-report **Riwayat Unduhan** (download-history) viewer.

### API client
`FE/src/features/v2/reports/api.ts` — `useGenerateReport` (unified),
`useGeneratedReports`, `useDownloadReport`, `useReportDownloads`, plus
back-compat `useGenerateInspectionReport` / `useGenerateHarReport` wrappers.

---

## 8. Extending

**Add a new format** — add a renderer that consumes `ReportModel`, branch on it
in `report.service.generate`, and extend the `ReportFormat` enum.

**Add a new source** — add to `SOURCE_TYPES`, a loader case in
`report.repository.loadSource`, and a normaliser in `report.templates.ts`. No
renderer changes required.

---

## 9. RBAC

- **Generate**: `REPORT_WRITE_ROLES` = SUPERADMIN, ADMIN, PETUGAS.
- **List / Download / History**: any authenticated role.

(`BE/src/auth/roles.ts`; FE capability `reports.generate` in `lib/v2/rbac.ts`.)
