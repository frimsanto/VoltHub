# 16 — DEVELOPMENT BACKLOG

**Product:** VoltHub V2
**Status:** Development Ready
**Source:** `dokumen_lengkap/API DETAIL SPECIFICATION & DEVELOPMENT BACKLOG.docx` (EPICs/Stories), mapped to PRD release scope.

---

## 1. EPIC → Story Master List (verbatim)

| EPIC | Story # | Story | Target table / module |
|------|---------|-------|------------------------|
| **EPIC-1 FOUNDATION** | 1 | Create organizations | `organizations` |
| | 2 | Create rtupps | `rtupps` |
| | 3 | Create up3s | `up3s` |
| | 4 | Create feeders | `feeders` |
| | 5 | Create sites | `sites` |
| **EPIC-2 MASTER DATA** | 6 | Site CRUD | `sites` |
| | 7 | Feeder CRUD | `feeders` |
| | 8 | Import Site | `import_jobs` → `sites` |
| **EPIC-3 ASSET** | 9 | Asset Category | `asset_categories` |
| | 10 | Asset Type | `asset_types` |
| | 11 | Asset Registry | `assets` |
| **EPIC-4 OPERATIONS** | 12 | Inspection Module | `inspections` |
| | 13 | Inspection Findings | `inspection_findings` |
| | 14 | HAR Module | `har_records` |
| | 15 | Performance Module | `performance_daily` |
| **EPIC-5 SERVICE** | 16 | Ticket Module | `tickets` |
| | 17 | Attachment Module | `attachments` |
| **EPIC-6 ADMINISTRATION** | 18 | Role Management | `roles` |
| | 19 | User Management | `users` |
| | 20 | Audit Logs | `audit_logs` |
| **EPIC-7 DASHBOARD** | 21 | Executive Dashboard | aggregate |
| | 22 | RTUPP Dashboard | aggregate (scoped) |
| | 23 | Operational Dashboard | aggregate |
| **EPIC-8 IMPORT ENGINE** | 24 | Import Gardu | `sites` |
| | 25 | Import Performance | `performance_daily` |
| | 26 | Import Asset | `assets` |
| **EPIC-9 UAT** | 27 | UAT Master Data | — |
| | 28 | UAT Operations | — |
| | 29 | UAT Dashboard | — |
| | 30 | Go Live Validation | — |

---

## 2. Release Mapping (PRD §19)

### Release 1 — MVP Core
EPIC-1, EPIC-2, EPIC-3, EPIC-4 (Inspection + HAR), EPIC-6 (Users/Roles/Audit), EPIC-8 (Import Gardu).
Screens: Login, Dashboard (basic), Gardu, Gardu 360, Penyulang, Asset, Inspection, HAR, User.

### Release 2 — Operations & Insight
EPIC-4 (Performance Module), EPIC-5 (Ticket + Attachment), EPIC-7 (Dashboards), EPIC-8 (Import Performance/Asset), EPIC-9 (UAT), Analytics.

### Release 3 — Advanced (future)
Predictive Analytics, SCADA integration, GIS integration, WhatsApp Notification (reserved domains: `site_geometries`, `telemetry_points`/`telemetry_values`).

---

## 3. Suggested Sprint Sequence (derived; dependency-ordered)

| Sprint | Focus | Stories | Exit criteria |
|--------|-------|---------|---------------|
| S1 | Foundation | 1–5 | Org→Site hierarchy persists; seed RTUPP 2–5 |
| S2 | Master Data + Import Gardu | 6–8, 24 | Site CRUD + 3,633 Gardu imported (UAT-003) |
| S3 | Asset | 9–11, 26 | Asset registry under Gardu (UAT-004/005) |
| S4 | Operations | 12–15, 25 | Inspection/HAR/Performance live (UAT-006…010) |
| S5 | Service + Admin | 16–20 | Tickets, Users, Roles, Audit (UAT-015) |
| S6 | Dashboards + Analytics | 21–23 | Executive/RTUPP/Operational KPI (UAT-011/012) |
| S7 | UAT + Go-Live | 27–30 | ≥95% pass, 0 critical (UAT criteria) |

> Sprint grouping is a recommendation derived from EPIC dependencies; the source lists EPICs/Stories but does not assign sprints.

---

## 4. Definition of Done (per story)

- Endpoint(s) implemented and documented (see [15_API_SPEC.md](15_API_SPEC.md)).
- RBAC scoping enforced ([07_PERMISSION_MATRIX.md](07_PERMISSION_MATRIX.md)).
- Audit log written for create/update/delete/status-change (BR-D02).
- Relevant Business Rules enforced ([11_BUSINESS_RULES.md](11_BUSINESS_RULES.md)).
- Mapped UAT scenario passes ([12_UAT_CATALOG.md](12_UAT_CATALOG.md)).
