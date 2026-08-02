# 08 — IMPORT STRATEGY

**Product:** VoltHub V2
**Status:** Derived baseline — consolidated from `DATABASE MIGRATION STRATEGY.docx`, `API DETAIL SPECIFICATION.docx` (API-005, EPIC-8), `PRODUCTION ERD DESIGN.docx` (System Domain), and `UAT SCENARIO CATALOG.docx`.

---

## 1. Purpose

Bulk-load operational data from Excel/CSV into VoltHub and eliminate dependence on standalone Excel files. Imports are **tracked** for auditability via `import_jobs` and `import_errors`.

## 2. Import Domains (EPIC-8 — Import Engine)

| Story | Import | Target table |
|-------|--------|--------------|
| Story 24 | **Import Gardu** | `sites` |
| Story 25 | **Import Performance** | `performance_daily` |
| Story 26 | **Import Asset** | `assets` |

Additional bulk loads from the migration plan: **Import Penyulang** → `feeders` (Phase 2).

## 3. Accepted Formats

Per **API-005 (`POST /api/import/sites`)**: `xlsx`, `csv`. (Export formats per PRD §14: PDF, Excel, CSV.)

## 4. Import Tracking Model

**`import_jobs`** — `id`, `job_type`, `file_name`, `status`, `total_rows`, `success_rows`, `failed_rows`, `created_by`, `created_at`, `completed_at`
**`import_errors`** — `id`, `import_job_id`, `row_number`, `error_message`, `created_at`

Every import run creates one `import_jobs` row; each rejected row creates one `import_errors` row (with the source `row_number` and reason).

## 5. Import Flow

```
Upload file (xlsx/csv)
  → Create import_job (status=PENDING, total_rows=N)
  → Validate each row
       ├─ valid   → insert/upsert target row, success_rows++
       └─ invalid → write import_errors row, failed_rows++
  → Update import_job (status=COMPLETED/FAILED, completed_at)
  → Return summary (total / success / failed) + error list
```

## 6. Validation Rules per Import

### 6.1 Import Gardu → `sites`
| Column | Rule | Source rule |
|--------|------|-------------|
| `site_code` | Required, **globally unique** | BR-004, API-001 |
| `feeder_id` | Required (Gardu must belong to one Penyulang) | BR-001 |
| `up3_id` | Required (one UP3) | BR-002 |
| `rtupp_id` | Required (one RTUPP) | BR-003 |
| `rc_status` | One of `INSCAN, OOP, UNKNOWN` | Data Dictionary |
| `vip_status` | One of `VIP, VVIP, NON_VIP` | Data Dictionary |
| `operational_status` | One of `ACTIVE, INACTIVE, MAINTENANCE` | Data Dictionary |

### 6.2 Import Performance → `performance_daily`
| Column | Rule |
|--------|------|
| `site_id` | Required; must reference existing Gardu (BR — no record without Site) |
| `performance_date` | Required |
| `performance_status` | `1` (Berhasil) or `0` (Gagal) |
| `score` | Numeric `0–100` |
| Uniqueness | **One record per Gardu per date** (BR-012) — duplicates rejected/upserted |

> Performance data **must not** be entered manually; it may originate **only** from Import or System Integration (BR-010, BR-011). The Excel source uses one column per day (`1 Juni … 30 Juni`); the importer pivots day-columns into one `performance_daily` row per (site, date).

### 6.3 Import Asset → `assets`
| Column | Rule |
|--------|------|
| `site_id` | Required — Asset must belong to one Gardu (BR-006) |
| `asset_number` | Required, **unique** (BR-007) |
| `asset_type_id` | Required (resolved from category/type taxonomy) |
| `serial_number` | Unique where present |
| `condition_status` | `GOOD, FAIR, DAMAGED, CRITICAL` |
| `lifecycle_status` | `INSTALLED, ACTIVE, MAINTENANCE, REPAIR, RETIRED, DISPOSED` |

## 7. Migration-Scale Import Targets

| Dataset | Volume | Tolerance |
|---------|--------|-----------|
| Gardu | 3,633 | 0% (all must be created — UAT-003) |
| Penyulang | per actual | 0% match (Phase 6) |
| Asset | per actual | 0% match (Phase 6) |
| Performance | monthly batches | per-date uniqueness enforced (UAT-009) |

## 8. UAT Coverage

- **UAT-003** — Import 3,633 Gardu → all Gardu created.
- **UAT-009** — Import monthly performance → data stored in `performance_daily`.

## 9. Open Items (⚠️ not specified in source)

1. Exact Excel **column headers / template** for each import are not defined in the source documents — a canonical import template must be agreed before go-live.
2. **Upsert vs. reject** policy for duplicate `site_code` / duplicate `(site_id, performance_date)` is not stated — recommended: reject on Gardu import, upsert on Performance import. Confirm with product owner.
3. Mapping of free-text RTUPP/UP3/Penyulang names in source spreadsheets to FK IDs (lookup-or-create vs. strict lookup) is not specified.
