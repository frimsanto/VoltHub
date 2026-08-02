# 03 — PRODUCT REQUIREMENT DOCUMENT (PRD)

**Product:** VoltHub V2
**Version:** 2.0
**Status:** Proposed Baseline
**Source:** `dokumen_lengkap/PRODUCT REQUIREMENT DOCUMENT (PRD).docx`
**Paradigm:** Gardu-Centric Architecture — all operational activity centres on the Gardu.

---

## 1. Product Overview

VoltHub is an integrated platform for managing Gardu, Asset, Inspection, HAR, Performance Monitoring, Ticketing, and Reporting. It is designed to be the primary operational data source for RTUPP.

## 2. Target Users

| Tier | Users |
|------|-------|
| Primary | Admin RTUPP, Petugas Inspeksi, Petugas HAR |
| Secondary | Supervisor, Manager, Auditor |
| Tertiary | Management, Executive |

## 3. Application Structure

```
LOGIN → DASHBOARD → MASTER DATA → OPERATIONS → REPORTING → ADMINISTRATION
```

## 4. Sidebar Structure

```
Dashboard
MASTER DATA   → Gardu · Penyulang · Asset
OPERATIONS    → Inspection · HAR · Performance
SERVICE       → Ticket
REPORTING     → Reports · Analytics
ADMINISTRATION→ Users · Roles
```

---

## 5. Dashboard Page

**Purpose:** rapid overview of operational condition.

**Widgets:** (1) Total Gardu, (2) RC Aktif, (3) RC Tidak Aktif, (4) VIP, (5) Non VIP, (6) Inspection Bulan Ini, (7) HAR Bulan Ini, (8) Ticket Open, (9) Ticket Closed.

**Charts:** Performance Trend (Daily / Monthly / Yearly).
**Table:** Top 10 Gardu Bermasalah.

See [09_DASHBOARD_KPI.md](09_DASHBOARD_KPI.md).

---

## 6. Master Gardu — `/gardu`

**Table columns:** Kode Gardu, UP3, RTUPP, Penyulang, Status RC, VIP, Last Inspection, Last HAR.
**Filters:** RTUPP, UP3, Penyulang, VIP, Status RC.
**Actions:** Detail, Edit, Delete.

## 7. Detail Gardu Page — `/gardu/:id`

> **The most important page in the entire application.** Full spec in [14_GARDU_360.md](14_GARDU_360.md).

| Section | Content |
|---------|---------|
| A — Profil Gardu | Kode, Nama, UP3, RTUPP, Penyulang, VIP, RC |
| B — Asset Summary | Counts of Battery, Modem, Router, Panel |
| C — Inspection History | — |
| D — HAR History | — |
| E — Performance Trend | — |
| F — Ticket History | — |

## 8. Master Penyulang — `/penyulang`

**Data:** Kode, Nama, Kondisi, Status. **Features:** CRUD, Import, Export.

## 9. Asset Management — `/asset`

**Categories:** Battery, Modem, Router, Panel, Power Supply, Lainnya.
**Data:** Asset Number, Gardu, Serial Number, Merk, Model, Tahun, Kondisi.
**Filters:** RTUPP, UP3, Gardu, Kategori.

## 10. Inspection Module — `/inspection`

**Create Inspection data:** Gardu, Petugas, Tanggal, Catatan. **Upload:** Foto, Dokumen.
**Status / Workflow:** `Draft → Submitted → Approved`.

## 11. HAR Module — `/har`

**Create HAR data:** Gardu, Petugas, Tanggal, Catatan. **Upload:** Foto, Dokumen.
**Workflow:** `Draft → Submitted → Closed`.

## 12. Performance Module — `/performance`

**Views:** Daily, Weekly, Monthly, Yearly.
**Filters:** RTUPP, UP3, Penyulang, Gardu.
**Charts:** Trend, Availability, RC Success, RC Failure.

## 13. Ticketing Module — `/ticket`

**Data:** Ticket Number, Gardu, Category, Priority, Status.
**Priority:** Low, Medium, High, Critical.
**Status:** Open, Assigned, In Progress, Resolved, Closed.

## 14. Reporting Module

**Reports:** Gardu, Asset, Inspection, HAR, Performance, Ticket.
**Format:** PDF, Excel, CSV.

## 15. Analytics Module

- **Analisis RTUPP:** Total Gardu, Kinerja, Gangguan
- **Analisis UP3:** Top Performer, Lowest Performer
- **Analisis Penyulang:** Penyulang Bermasalah
- **Analisis Asset:** Asset Rusak, Asset Tua

## 16. User Management

**Data:** Nama, Username, Email, Role, RTUPP.
**Roles:** Super Admin, Admin RTUPP, Petugas Inspection, Petugas HAR, Viewer.

## 17. Audit Trail

All changes must be recorded: **Siapa (who), Kapan (when), Apa yang diubah (what), Nilai lama (old value), Nilai baru (new value)**.

## 18. Mobile Readiness

Pages that must be mobile-friendly (used by field officers): **Dashboard, Detail Gardu, Inspection, HAR**.

---

## 19. MVP Release Scope

| Release | Scope |
|---------|-------|
| **Release 1** | Login, Dashboard, Gardu, Penyulang, Asset, Inspection, HAR, User |
| **Release 2** | Performance, Ticketing, Analytics |
| **Release 3** | Predictive Analytics, SCADA integration, GIS integration, WhatsApp Notification integration |

---

*END OF PRD V2*
