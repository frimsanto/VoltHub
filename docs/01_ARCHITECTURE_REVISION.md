# 01 — ARCHITECTURE REVISION

**Product:** VoltHub V2
**Document:** Requirement Rebaseline & Architecture Revision (Consolidated)
**Version:** 2.0
**Status:** APPROVED — Locked baseline for PRD, ERD, Database, Frontend, and future development
**Source:** `dokumen_lengkap/REQUIREMENT REBASELINE & ARCHITECTURE REVISION.docx`
**Date:** June 2026

---

## 1. Background

In the early development phase, VoltHub was designed as an **Asset Management** platform focused on recording RTU, modem, battery, router, panel, and other supporting devices.

After analysing the **actual operational data of RTUPP 2–5 (3,633 gardu)**, it was found that the primary operational object is **not** the device asset, but the **Gardu (Site)**. Physical assets are only supporting components attached to a Gardu.

This finding changes the system paradigm from:

> **Asset-Centric System** → **Gardu-Centric Operational Platform**

The change is required so VoltHub can support long-term operational needs: performance analysis, field inspection, HAR, RC monitoring, and integrated asset management.

---

## 2. Architecture Shift

### Before (Asset-Centric)

```
Core Entity: Asset

RTUPP
└─ Asset
   ├─ Battery
   ├─ Modem
   ├─ Router
   └─ Panel
```

Primary focus: asset inventory, asset documentation, asset monitoring.

### After (Gardu-Centric)

```
Core Entity: Gardu

RTUPP
└─ UP3
   └─ Gardu
      ├─ Penyulang
      ├─ RC
      ├─ Status VIP
      ├─ Asset
      ├─ Inspection
      ├─ HAR
      └─ Daily Performance
```

Primary focus: Gardu management, operational monitoring, performance monitoring, asset lifecycle, inspection management, HAR management.

---

## 3. Business Object Model

Primary system objects:

| Object | Role |
|--------|------|
| RTUPP | Regional management unit |
| UP3 | Service execution unit |
| Penyulang (Feeder) | Distribution line serving gardu |
| **Gardu (Site)** | **Core operational entity** |
| Asset | Supporting child of Gardu |
| Inspection | Operational activity on Gardu |
| HAR | Operational activity on Gardu |
| Performance | Daily performance history of Gardu |
| Ticket | Operational issue against Gardu |
| User | System actor |

**Relationships**

```
RTUPP → UP3 → Penyulang → Gardu → Asset
Gardu → Inspection
Gardu → HAR
Gardu → Performance
Gardu → Ticket
```

---

## 4. Master Data Structure

### RTUPP
Regional management data. Examples: **RTUPP 2, RTUPP 3, RTUPP 4, RTUPP 5**.

### UP3 (Unit Pelaksana Pelayanan Pelanggan)
Examples: **Bintaro, Bulungan, Cempaka Putih, Marunda**. Each UP3 belongs to exactly one RTUPP.

### Penyulang (Feeder)
Distribution line serving gardu. Stored: Kode Penyulang, Nama Penyulang, Kondisi Penyulang, Status Aktif.

### Gardu (Site) — primary operational object
Stored data: Kode Gardu, Nama Gardu, RTUPP, UP3, Penyulang, Posisi Gardu, Status RC, Status VIP, Koordinat, Foto, Status Operasional.

- **Initial capacity target:** 3,633 Gardu
- **Long-term capacity target:** 10,000+ Gardu

---

## 5. Asset Management Repositioning

Asset is **no longer** the primary entity. Asset becomes a **child entity of Gardu**.

Example — Gardu BT104 assets: Battery, Modem, Router, Antena, Panel, Power Supply.

Every asset must have: Asset Number, Serial Number, Merk (Brand), Model, Tahun Pengadaan (Manufacture/Procurement Year), Kondisi (Condition), Status Aktif.

---

## 6. Inspection Management

Each Gardu may have many inspections. Data: Nomor inspeksi, Tanggal inspeksi, Petugas, Catatan, Foto, Temuan, Tindak lanjut. Purpose: field-visit monitoring, gardu condition audit, historical documentation.

## 7. HAR Management

HAR becomes an independent module. Data: Nomor HAR, Tanggal HAR, Petugas, Catatan HAR, Lampiran, Status penyelesaian. Purpose: maintenance documentation, work history, fault analysis.

## 8. Performance Management

Actual data shows each Gardu has daily performance data.

- **Excel model:** columns `1 Juni, 2 Juni, 3 Juni … 30 Juni`
- **Database model (`performance_daily`):** `id, gardu_id, performance_date, status, score, created_at`

One record represents one Gardu on one date.

---

## 9. Data Volume Estimation

| Metric | Value |
|--------|-------|
| Number of Gardu | 3,633 |
| Assumption | 1 performance record / day |
| Per month | 3,633 × 30 ≈ **108,990** records |
| Per year | ≈ **1,307,880** records |

This volume is well within PostgreSQL's safe operating range. (Long-term NFR target: **20,000,000+** performance records — see [02_REQUIREMENT_ANALYSIS.md](02_REQUIREMENT_ANALYSIS.md).)

---

## 10. Dashboard Redesign

The dashboard no longer centres on asset counts. The main dashboard must show:

- **OPERATIONAL OVERVIEW:** Total Gardu, Total UP3, Total Penyulang, Total VIP
- **RC OVERVIEW:** RC Aktif, RC Tidak Aktif
- **PENYULANG OVERVIEW:** Penyulang Sehat, Penyulang Bermasalah
- **PERFORMANCE OVERVIEW:** Kinerja Hari Ini, Kinerja Bulan Ini, Kinerja Tahun Ini
- **OPERATIONS OVERVIEW:** Inspeksi Bulan Ini, HAR Bulan Ini, Ticket Open, Ticket Closed

See [09_DASHBOARD_KPI.md](09_DASHBOARD_KPI.md).

---

## 11. Sidebar Restructure

```
Dashboard
MASTER DATA
  ├─ Gardu
  ├─ Penyulang
  └─ Asset
OPERATIONS
  ├─ Inspection
  ├─ HAR
  └─ Performance
SERVICE
  └─ Ticket
ADMINISTRATION
  ├─ Users
  └─ Roles
REPORTING
  ├─ Reports
  └─ Analytics
```

---

## 12. Long-Term Vision

VoltHub is no longer positioned as an Asset Inventory Application. It is positioned as an:

> **Integrated Gardu Monitoring & Asset Management Platform**

managing — in one integrated platform — Master Gardu, Asset Registry, RC Monitoring, Penyulang Monitoring, Inspection, HAR, Performance Analytics, Ticketing, and Reporting.

---

## FINAL DECISION (Approved)

| Item | Decision |
|------|----------|
| **Core Entity** | **GARDU** |
| Supporting Entities | Asset, Inspection, HAR, Performance, Ticket |
| Architecture Style | **Gardu-Centric Architecture** |
| Status | **APPROVED** for PRD, ERD, Database, Frontend, and future development |

---

## Appendix A — Delta vs. Current Implementation (informational; no code change in this phase)

The current codebase (`BE/prisma/schema.prisma`) reflects the **pre-revision** state. Key deltas the migration must close (detailed in [06_MIGRATION_STRATEGY.md](06_MIGRATION_STRATEGY.md)):

| Aspect | Current implementation | Approved target |
|--------|------------------------|-----------------|
| Core table | `locations` (`LocationType` enum) | dedicated `sites` (Gardu) + explicit org tree |
| Org hierarchy | `RTUPP` model standalone; `up3` is free-text on `Location` | `organizations → rtupps → up3s → feeders → sites` |
| DB engine | MySQL | **PostgreSQL** (per approved ERD) — ⚠️ conflict, see status report |
| Asset typing | `AssetType` enum | `asset_categories` + `asset_types` reference tables |
| Performance | not present | `performance_daily` (partitioned) |
| Ticket | not present | `tickets` |
| Roles | `SUPERADMIN, ADMIN, ADMIN_RTUPP, PETUGAS` | 5 roles (see [07_PERMISSION_MATRIX.md](07_PERMISSION_MATRIX.md)) — ⚠️ conflict |

> These deltas are recorded for planning only. **No source code or schema is modified in the documentation phase.**
