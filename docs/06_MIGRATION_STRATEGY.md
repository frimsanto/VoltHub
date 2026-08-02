# 06 — DATABASE MIGRATION STRATEGY

**Product:** VoltHub V2
**Version:** 2.0
**Status:** Approved Draft
**Source:** `dokumen_lengkap/DATABASE MIGRATION STRATEGY.docx`

---

## 1. Objective

Migrate from the old architecture (**Asset-Centric**) to the new architecture (**Gardu-Centric**) **without losing historical data** and **without disrupting operations**.

## 2. Migration Principle

- Data is **not** deleted.
- Data is **transformed**.
- Old data remains traceable via the audit trail.

---

## 3. Migration Phases

### PHASE 1 — Master Organization
**Create:** `organizations`, `rtupps`, `up3s`.
**Seed:** RTUPP 2, RTUPP 3, RTUPP 4, RTUPP 5.

### PHASE 2 — Network Structure
**Create:** `feeders`.
**Import:** Penyulang data.

### PHASE 3 — Site Structure
**Create:** `sites`.
**Import:** 3,633 Gardu.
**Mapping:** `Excel Gardu → sites`.

### PHASE 4 — Asset Migration
`Old Asset → New Asset Registry`.
**Mapping:** `asset.site_id → gardu`.

### PHASE 5 — Operational Data
**Create:** `inspections`, `har_records`, `performance_daily`.

### PHASE 6 — Validation
**Checklist:** Total Gardu match · Total Penyulang match · Total Asset match.
**Tolerance:** **0%**.

---

## 4. Rollback Strategy

If migration fails:
1. Restore database snapshot.
2. Rollback the release.
3. Freeze write access.

## 5. Success Criteria

- 100% of Gardu migrated.
- 100% of Penyulang migrated.
- Assets linked to Gardu.
- Dashboard running normally.

---

## Appendix A — Current → Target Mapping (planning reference)

The current codebase (`BE/prisma/schema.prisma`, MySQL) is **Location-centric**. The following mapping guides Phases 1–4. **No schema or code is changed during the documentation phase.**

| Current (MySQL) | Target (PostgreSQL ERD) | Transformation notes |
|-----------------|-------------------------|----------------------|
| `RTUPP` (standalone model) | `organizations` + `rtupps` | Introduce `organizations` parent (e.g. *UID Jakarta Raya*); link `rtupps.organization_id` |
| `Location.up3` (free-text VarChar) | `up3s` (table) | Normalise distinct UP3 strings → rows; backfill `sites.up3_id` |
| `locations` (`LocationType=GARDU`) | `sites` | Rows where the location represents a Gardu become `sites`; map `code→site_code`, `name→site_name`, lat/long, `status→operational_status` |
| `Feeder` (`locationId`) | `feeders` (`up3_id`) | Re-parent feeder from Location to UP3; retain `feederCode/feederName` |
| `Asset` (`locationId`, `AssetType` enum) | `assets` (`site_id`, `asset_type_id`) | Map `locationId→site_id`; convert `AssetType` enum → `asset_types`/`asset_categories` rows |
| `Inspection` (`locationId`) | `inspections` (`site_id`) | Map FK; preserve status values |
| `HarReport` (`locationId`) | `har_records` (`site_id`) | Map FK |
| — (not present) | `performance_daily` | New; populated via Performance import (Phase 5) |
| — (not present) | `tickets` | New (Release 2) |
| `ActivityLog` / `activity_logs` | `audit_logs` | Map to `entity_type/entity_id/action/old_value/new_value` shape |
| `ImportJob` / `ImportError` | `import_jobs` / `import_errors` | Direct structural match |

### Open migration risks (flagged, not resolved here)
1. **Engine change MySQL → PostgreSQL** — the approved ERD targets PostgreSQL (partitioning, reserved GIS/SCADA). This is an infrastructure decision that contradicts the current MySQL deployment and must be confirmed by the architecture owner before Phase 1.
2. **Role model expansion** — current 4-role enum → 5 roles (see [07_PERMISSION_MATRIX.md](07_PERMISSION_MATRIX.md)). Requires a `roles` seed + user remap.
3. **UP3 normalisation** — free-text `up3` values may contain spelling variants; a cleansing pass is required before creating `up3s`.
4. **Gardu identification in `locations`** — confirm the predicate that distinguishes Gardu rows from non-Gardu locations (via `LocationType`).
