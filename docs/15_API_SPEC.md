# 15 — API DETAIL SPECIFICATION

**Product:** VoltHub V2
**Version:** 1.0
**Status:** Development Ready
**Source:** `dokumen_lengkap/API DETAIL SPECIFICATION & DEVELOPMENT BACKLOG.docx`

> **Authoritative endpoints** are the five explicitly specified below (API-001…API-005). Additional endpoints in §6 are **derived** to cover the modules described in the PRD/Screen Spec and are marked as such.

---

## 1. Conventions

- **Auth:** JWT bearer token (NFR). **Authz:** RBAC scoped by RTUPP ([07_PERMISSION_MATRIX.md](07_PERMISSION_MATRIX.md)).
- **IDs:** UUID.
- **Content type:** `application/json` (except import endpoints: `multipart/form-data`).

---

## 2. API-001 — CREATE SITE

```
POST /api/sites
```
**Request**
```json
{
  "siteCode": "BT104",
  "siteName": "BT104",
  "feederId": "uuid",
  "rcStatus": "INSCAN",
  "vipStatus": "VIP"
}
```
**Validation:** `siteCode` unique; `feederId` required.
**Response:** `201 Created`.

## 3. API-002 — GET SITE DETAIL

```
GET /api/sites/{id}
```
**Response includes:** Site Profile, Assets, Inspection Summary, HAR Summary, Performance Summary, Ticket Summary. (Backs the Gardu 360 screen — [14_GARDU_360.md](14_GARDU_360.md).)

## 4. API-003 — CREATE INSPECTION

```
POST /api/inspections
```
**Validation:** `siteId` required; `inspectionDate` required.

## 5. API-004 — CREATE HAR

```
POST /api/har
```
**Validation:** `siteId` required; `harDate` required.

## 6. API-005 — IMPORT SITES

```
POST /api/import/sites
```
**Accepted formats:** `xlsx`, `csv`. (See [08_IMPORT_STRATEGY.md](08_IMPORT_STRATEGY.md).)

---

## 6b. Derived Endpoints (proposed — not in source, for module completeness)

> ⚠️ The source specifies only API-001…API-005. The following are **proposed** to satisfy the Screen Spec / PRD modules and should be ratified before build.

### Organization & Network
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/rtupps` | List RTUPP |
| GET | `/api/up3s` | List UP3 |
| GET/POST/PUT/DELETE | `/api/feeders` | Penyulang CRUD |

### Sites (Gardu)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sites` | List/filter Gardu (RTUPP, UP3, Penyulang, RC, VIP) |
| PUT | `/api/sites/{id}` | Edit Gardu (audited) |
| DELETE | `/api/sites/{id}` | Soft-delete Gardu (guard: no active assets — BR-005) |
| GET | `/api/sites/{id}/assets` · `/inspections` · `/har` · `/performance` · `/tickets` · `/attachments` · `/audit` | Gardu 360 tabs |

### Assets
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PUT | `/api/assets` | Asset registry CRUD |
| POST | `/api/assets/{id}/move` | Move asset to another Gardu (audited — BR-008) |
| GET | `/api/asset-categories`, `/api/asset-types` | Taxonomy |
| POST | `/api/import/assets` | Import assets (Story 26) |

### Operations
| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/api/inspections/{id}` | Edit / status (`Draft→Submitted→Approved`) |
| POST | `/api/inspections/{id}/findings` | Add finding |
| POST | `/api/inspections/{id}/photos` | Upload photo |
| PUT | `/api/har/{id}` | Update / status (`Draft→Submitted→Closed`) |
| GET | `/api/performance` | Performance views (daily/monthly/yearly) |
| POST | `/api/import/performance` | Import performance (Story 25) |

### Service & Admin
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PUT | `/api/tickets` | Ticket CRUD; assign; close |
| GET/POST/PUT | `/api/users` | User management (SUPER ADMIN) |
| GET/POST | `/api/roles` | Role management |
| GET | `/api/audit-logs` | Read-only audit (BR-018) |
| GET | `/api/dashboard`, `/api/analytics` | KPI aggregates ([09_DASHBOARD_KPI.md](09_DASHBOARD_KPI.md)) |
| GET | `/api/reports/{type}` | Export PDF/Excel/CSV |

---

## 7. Development Backlog (EPICs / Stories) — verbatim from source

| EPIC | Stories |
|------|---------|
| **EPIC-1 FOUNDATION** | 1 organizations · 2 rtupps · 3 up3s · 4 feeders · 5 sites |
| **EPIC-2 MASTER DATA** | 6 Site CRUD · 7 Feeder CRUD · 8 Import Site |
| **EPIC-3 ASSET** | 9 Asset Category · 10 Asset Type · 11 Asset Registry |
| **EPIC-4 OPERATIONS** | 12 Inspection Module · 13 Inspection Findings · 14 HAR Module · 15 Performance Module |
| **EPIC-5 SERVICE** | 16 Ticket Module · 17 Attachment Module |
| **EPIC-6 ADMINISTRATION** | 18 Role Management · 19 User Management · 20 Audit Logs |
| **EPIC-7 DASHBOARD** | 21 Executive Dashboard · 22 RTUPP Dashboard · 23 Operational Dashboard |
| **EPIC-8 IMPORT ENGINE** | 24 Import Gardu · 25 Import Performance · 26 Import Asset |
| **EPIC-9 UAT** | 27 UAT Master Data · 28 UAT Operations · 29 UAT Dashboard · 30 Go Live Validation |

(See [16_BACKLOG.md](16_BACKLOG.md) for the sprint-mapped backlog.)

---

*END OF API DETAIL SPECIFICATION*
