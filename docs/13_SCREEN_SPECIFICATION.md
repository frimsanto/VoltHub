# 13 — SCREEN SPECIFICATION

**Product:** VoltHub V2
**Version:** 1.0
**Status:** Approved Draft
**Source:** `dokumen_lengkap/SCREEN SPECIFICATION.docx`

---

## SCREEN-001 — LOGIN
- **Route:** `/login`
- **Purpose:** User authentication.
- **Fields:** Username, Password
- **Actions:** Login, Forgot Password
- **Redirect:** Success → Dashboard

## SCREEN-002 — DASHBOARD
- **Route:** `/dashboard`
- **Purpose:** Operational summary.
- **Widgets:** Total Gardu, Total Penyulang, RC INSCAN, RC OOP, VIP, VVIP, Inspection Bulan Ini, HAR Bulan Ini, Ticket Open
- **Charts:** Performance Trend, Top Problem Gardu, Top Problem Penyulang
- **Roles:** All Authenticated Users
- See [09_DASHBOARD_KPI.md](09_DASHBOARD_KPI.md).

## SCREEN-003 — GARDU LIST
- **Route:** `/gardu`
- **Purpose:** Master data Gardu.
- **Columns:** Kode Gardu, UP3, RTUPP, Penyulang, RC Status, VIP Status, Last Inspection, Last HAR
- **Filters:** RTUPP, UP3, Penyulang, RC Status, VIP Status
- **Actions:** Detail, Edit, Export, Import

## SCREEN-004 — PENYULANG LIST
- **Route:** `/penyulang`
- **Columns:** Kode, Nama, Kondisi, Status
- **Actions:** Create, Edit, Delete, Export

## SCREEN-005 — ASSET LIST
- **Route:** `/asset`
- **Columns:** Asset Number, Asset Type, Site, Serial Number, Brand, Condition
- **Filters:** RTUPP, UP3, Site, Asset Type

## SCREEN-006 — INSPECTION LIST
- **Route:** `/inspection`
- **Columns:** Inspection Number, Site, Date, Inspector, Status
- **Actions:** Create, Edit, Approve

## SCREEN-007 — HAR LIST
- **Route:** `/har`
- **Columns:** HAR Number, Site, Date, Technician, Status
- **Actions:** Create, Edit, Close

## SCREEN-008 — PERFORMANCE
- **Route:** `/performance`
- **Views:** Daily, Monthly, Yearly
- **Filters:** RTUPP, UP3, Site
- **Charts:** Availability Trend, Performance Trend

## SCREEN-009 — TICKETS
- **Route:** `/ticket`
- **Columns:** Ticket Number, Site, Category, Priority, Status
- **Actions:** Create, Assign, Close

## SCREEN-010 — USERS
- **Route:** `/users`
- **Columns:** Name, Username, Role, RTUPP, Status
- **Actions:** Create, Edit, Disable

---

## SCREEN-011 — GARDU 360 (Detail Gardu)
- **Route:** `/gardu/:id`
- The single most important screen. Full tab-by-tab spec in [14_GARDU_360.md](14_GARDU_360.md).

---

## Route Map Summary

| Screen | Route | Primary roles |
|--------|-------|---------------|
| Login | `/login` | Public |
| Dashboard | `/dashboard` | All authenticated |
| Gardu List | `/gardu` | All (edit/import: ADMIN+) |
| Gardu 360 | `/gardu/:id` | All (actions per role) |
| Penyulang | `/penyulang` | ADMIN+ (view: all) |
| Asset | `/asset` | ADMIN+ (view: all) |
| Inspection | `/inspection` | PETUGAS INSPEKSI, ADMIN+ |
| HAR | `/har` | PETUGAS HAR, ADMIN+ |
| Performance | `/performance` | All (import: ADMIN+) |
| Ticket | `/ticket` | All (manage: ADMIN+) |
| Users | `/users` | SUPER ADMIN |

> Role applicability cross-referenced from [07_PERMISSION_MATRIX.md](07_PERMISSION_MATRIX.md). Mobile-friendly screens (PRD §18): Dashboard, Gardu 360, Inspection, HAR.

---

*END OF SCREEN SPECIFICATION*
