# 05 — PRODUCTION ERD DESIGN

**Product:** VoltHub V2
**Version:** 2.0
**Status:** Architecture Locked
**Source:** `dokumen_lengkap/PRODUCTION ERD DESIGN.docx`
**Target engine:** PostgreSQL

> **Core principle:** *Site (Gardu) is the center. All operational records must reference Site. No operational record may exist without a Site. Asset is not the center.*

---

## 1. Organization Domain

**`organizations`** — `id`, `name`, `code`, `created_at`, `updated_at`
**`rtupps`** — `id`, `organization_id`, `name`, `code`, `created_at`, `updated_at`
**`up3s`** — `id`, `rtupp_id`, `name`, `code`, `created_at`, `updated_at`

Relationships: Organization `1→N` RTUPP; RTUPP `1→N` UP3.

## 2. Network Domain

**`feeders`** (Penyulang) — `id`, `up3_id`, `code`, `name`, `condition_status`, `is_active`, `created_at`, `updated_at`

Relationship: UP3 `1→N` Feeders.

## 3. Site Domain — CORE

**`sites`** (Gardu)
`id`, `feeder_id`, `rtupp_id`, `up3_id`, `site_code`, `site_name`, `position_order`, `rc_status`, `vip_status`, `operational_status`, `latitude`, `longitude`, `address`, `remarks`, `created_at`, `updated_at`, `deleted_at`

**Indexes:** `site_code`, `rtupp_id`, `up3_id`, `feeder_id`, `rc_status`, `vip_status`
**Relationship:** Feeder `1→N` Sites.

## 4. Asset Domain

**`asset_categories`** — `id`, `name`, `description` → e.g. Power, Communication, Control, Infrastructure, Supporting
**`asset_types`** — `id`, `asset_category_id`, `name`, `description` → e.g. Battery, Modem, Router, RTU, RC, Panel, Switch, UPS
**`assets`** — `id`, `site_id`, `asset_type_id`, `asset_number`, `serial_number`, `brand`, `model`, `manufacture_year`, `installation_date`, `condition_status`, `lifecycle_status`, `notes`, `created_at`, `updated_at`, `deleted_at`

**Indexes:** `site_id`, `asset_number`, `serial_number`, `condition_status`
**Relationship:** Site `1→N` Assets.

## 5. Inspection Domain

**`inspections`** — `id`, `site_id`, `inspection_number`, `inspection_date`, `inspector_id`, `status`, `notes`, `created_at`, `updated_at`
**Status:** `Draft`, `Submitted`, `Approved`
**`inspection_findings`** — `id`, `inspection_id`, `category`, `severity`, `finding`, `recommendation`, `created_at`

Relationships: Site `1→N` Inspections; Inspection `1→N` Findings.

## 6. HAR Domain

**`har_records`** — `id`, `site_id`, `har_number`, `har_date`, `technician_id`, `status`, `notes`, `created_at`, `updated_at`

Relationship: Site `1→N` HAR Records.

## 7. Performance Domain

**`performance_daily`** — `id`, `site_id`, `performance_date`, `performance_status`, `score`, `created_at`

**Indexes:** `site_id`, `performance_date`, composite `(site_id, performance_date)`
**Expected volume:** 20M+ records
**Partitioning:** yearly — `performance_daily_2026`, `performance_daily_2027`, `performance_daily_2028`

## 8. Ticketing Domain

**`tickets`** — `id`, `site_id`, `ticket_number`, `category`, `priority`, `status`, `assigned_to`, `opened_at`, `closed_at`, `notes`, `created_at`, `updated_at`

Relationship: Site `1→N` Tickets.

## 9. Document Domain

**`attachments`** — `id`, `entity_type`, `entity_id`, `file_name`, `file_url`, `mime_type`, `file_size`, `uploaded_by`, `created_at`
**Supported `entity_type`:** `site`, `asset`, `inspection`, `har`, `ticket`

## 10. User Domain

**`roles`** — `id`, `name`, `description`
**`users`** — `id`, `role_id`, `rtupp_id`, `full_name`, `username`, `email`, `password_hash`, `is_active`, `last_login`, `created_at`, `updated_at`

Relationships: Role `1→N` Users; RTUPP `1→N` Users.

## 11. Audit Domain

**`audit_logs`** — `id`, `entity_type`, `entity_id`, `action`, `old_value`, `new_value`, `performed_by`, `performed_at`
**Actions:** `CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`
**Retention:** minimum **5 years**.

## 12. System Domain

**`import_jobs`** — `id`, `job_type`, `file_name`, `status`, `total_rows`, `success_rows`, `failed_rows`, `created_by`, `created_at`, `completed_at`
**`import_errors`** — `id`, `import_job_id`, `row_number`, `error_message`, `created_at`

## 13. Future GIS Domain (reserved)

**`site_geometries`** — `id`, `site_id`, `geometry`, `created_at` — reserved for GIS integration.

## 14. Future SCADA Domain (reserved)

**`telemetry_points`** — `id`, `site_id`, `point_code`, `point_name`, `data_type`, `created_at`
**`telemetry_values`** — `id`, `telemetry_point_id`, `recorded_at`, `value`, `quality`, `created_at`
Future expansion: SCADA integration, IoT integration, real-time monitoring.

---

## 15. Soft Delete Policy

Applied to: `sites`, `assets`, `users`, `tickets`. Columns: `deleted_at`, `deleted_by`.

## 16. Database Principles

- Core entity: **Site (Gardu)**.
- All operational records must reference Site.
- No operational record may exist without Site.
- Asset is **not** the center; Site is the center.

---

## Logical ERD (text diagram)

```
organizations 1─┐
                └─N rtupps 1─┐
                            ├─N up3s 1─┐
                            │          └─N feeders 1─┐
                            │                        └─N SITES (gardu) 1─┬─N assets ─N (asset_types ─ asset_categories)
                            │                                            ├─N inspections 1─N inspection_findings
                            │                                            ├─N har_records
                            │                                            ├─N performance_daily  (partitioned by year)
                            │                                            ├─N tickets
                            │                                            └─N site_geometries / telemetry_points (future)
                            └─N users ─ roles
attachments (polymorphic: site|asset|inspection|har|ticket)
audit_logs (polymorphic)   import_jobs 1─N import_errors
```

---

## FINAL ERD STATUS

**PRODUCTION READY** — scalable to 10+ years · multi-RTUPP · GIS · SCADA · Mobile App.

> Implementation note (no code change this phase): the current schema is MySQL/Location-centric. Mapping to this PostgreSQL target is in [06_MIGRATION_STRATEGY.md](06_MIGRATION_STRATEGY.md). The engine difference (MySQL vs PostgreSQL) is flagged as a conflict in the status report.
