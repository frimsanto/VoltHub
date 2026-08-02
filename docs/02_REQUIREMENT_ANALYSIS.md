# 02 — REQUIREMENT ANALYSIS

**Product:** VoltHub V2
**Version:** 2.0
**Status:** Architecture Baseline
**Source:** `dokumen_lengkap/REQUIREMENT ANALYSIS.docx`

---

## 1. System Overview

VoltHub is an integrated platform for managing **Gardu, Asset, Inspection, HAR, Performance Monitoring, Ticketing, and Reporting**. It supports the operations of **RTUPP 2, RTUPP 3, RTUPP 4, and RTUPP 5**. The primary system object is the **Gardu**.

---

## 2. Business Goals

1. Provide a **single source of truth** for all Gardu.
2. Provide inspection history for every Gardu.
3. Provide HAR history for every Gardu.
4. Provide daily performance monitoring.
5. Provide an asset inventory attached to each Gardu.
6. Provide a real-time operational dashboard.
7. Reduce dependence on separate Excel files.

---

## 3. User Roles

> Five roles are defined by this baseline. (The current codebase enum has four — see conflict note in [07_PERMISSION_MATRIX.md](07_PERMISSION_MATRIX.md).)

### SUPER ADMIN — full access
- Manage all users
- Manage roles
- Manage master data
- Manage all RTUPP
- View all reports

### ADMIN RTUPP — scoped to own RTUPP
- **Can:** manage Gardu, Penyulang, Asset, Inspection, HAR; view RTUPP dashboard
- **Cannot:** access other RTUPP

### PETUGAS INSPEKSI
- **Can:** view Gardu, fill inspection results, upload photos, create findings
- **Cannot:** modify master data

### PETUGAS HAR
- **Can:** create HAR, update HAR, upload documentation
- **Cannot:** modify master data

### VIEWER / MANAJEMEN
- **Can:** view dashboard, view reports, view analytics
- **Cannot:** modify data

---

## 4. Module Requirements

### Module A — MASTER GARDU
**Purpose:** central hub of all operational data.

**Data:** Kode Gardu, Nama Gardu, RTUPP, UP3, Penyulang, Posisi Gardu, Status RC, Status VIP, Latitude, Longitude, Status Aktif.

**Features:** Tambah, Edit, Detail, Search, Filter, Import Excel, Export Excel.

**Detail Gardu must display:** Profile Gardu, Asset, Inspection History, HAR History, Performance History, Ticket History.

### Module B — MASTER PENYULANG
**Data:** Kode Penyulang, Nama Penyulang, Kondisi, Status.
**Features:** CRUD, Search, Filter.

### Module C — ASSET MANAGEMENT
Asset is a child of Gardu.
**Categories:** Battery, Modem, Router, Antena, Panel, Power Supply, Lainnya.
**Data:** Asset Number, Serial Number, Merk, Model, Tahun, Status, Kondisi.
**Features:** CRUD, Import, Export, Riwayat Perubahan (change history).

### Module D — INSPECTION
**Data:** Nomor Inspeksi, Gardu, Petugas, Tanggal, Catatan, Temuan.
**Attachments:** Foto, Dokumen.
**Features:** Buat inspeksi, Edit inspeksi, Upload foto, Riwayat inspeksi.

### Module E — HAR
**Data:** Nomor HAR, Gardu, Petugas, Tanggal, Catatan, Status.
**Attachments:** Foto, Dokumen.
**Features:** Buat HAR, Update HAR, Riwayat HAR.

### Module F — PERFORMANCE
**Data:** Gardu, Tanggal, Status, Score.
**Features:** Daily / Monthly / Yearly monitoring, Trend Analysis.

### Module G — TICKETING
**Data:** Nomor Ticket, Gardu, Kategori, Prioritas, Status.
**Features:** Create Ticket, Assign Ticket, Close Ticket.

### Module H — REPORTING
**Reports:** Gardu, Asset, Inspection, HAR, Performance, Ticket.
**Format:** PDF, Excel.

### Module I — ANALYTICS
Dashboard KPI showing: Total Gardu, RC Aktif, RC Tidak Aktif, VIP, Non VIP, Inspection Count, HAR Count, Ticket Count.
**Analysis:** Top Gangguan, Top UP3 Bermasalah, Top Penyulang Bermasalah.

---

## 5. Non-Functional Requirements

| NFR | Target |
|-----|--------|
| Availability | 99% |
| Target Users | 100+ |
| Target Gardu | 10,000+ |
| Target Assets | 100,000+ |
| Target Performance Records | 20,000,000+ |
| Database | PostgreSQL |
| Authentication | JWT |
| Authorization | Role-Based Access Control (RBAC) |
| Storage | Object Storage |
| Audit Trail | **Mandatory** — every data change must be recorded |

---

## 6. Success Criteria

VoltHub is considered successful when:

1. All Gardu are digitalised.
2. All Inspections are digitalised.
3. All HAR are digitalised.
4. The operational dashboard is available in real time.
5. There is no dependence on Excel files as the primary operational source.

---

*END OF REQUIREMENT ANALYSIS V2*
