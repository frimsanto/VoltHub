# 09 — DASHBOARD & KPI SPECIFICATION

**Product:** VoltHub V2
**Status:** Derived baseline — consolidated from `ARCHITECTURE REVISION.docx` (§10), `PRD.docx` (§5, §15), `REQUIREMENT ANALYSIS.docx` (Module I), and `SCREEN SPECIFICATION.docx` (SCREEN-002).

---

## 1. Purpose

Provide a rapid, real-time overview of operational condition. The dashboard centres on **Gardu**, not on asset counts.

## 2. Executive / Operational Dashboard Widgets

Canonical widget set (union of PRD §5 + Screen Spec SCREEN-002 + Architecture Revision §10):

| # | Widget | Metric definition |
|---|--------|-------------------|
| 1 | **Total Gardu** | Count of `sites` (not soft-deleted) in scope |
| 2 | **Total UP3** | Count of `up3s` in scope |
| 3 | **Total Penyulang** | Count of `feeders` in scope |
| 4 | **Total VIP** | Count of `sites` where `vip_status IN (VIP, VVIP)` |
| 5 | **RC Aktif / RC INSCAN** | Count of `sites` where `rc_status = INSCAN` |
| 6 | **RC Tidak Aktif / RC OOP** | Count of `sites` where `rc_status = OOP` |
| 7 | **VIP** | Count `vip_status = VIP` |
| 8 | **VVIP** | Count `vip_status = VVIP` |
| 9 | **Non VIP** | Count `vip_status = NON_VIP` |
| 10 | **Inspection Bulan Ini** | Count of `inspections` where `inspection_date` in current month |
| 11 | **HAR Bulan Ini** | Count of `har_records` where `har_date` in current month |
| 12 | **Ticket Open** | Count of `tickets` where `status NOT IN (Resolved, Closed)` |
| 13 | **Ticket Closed** | Count of `tickets` where `status = Closed` |

> The source lists these widgets across three documents with slight grouping differences; all are included. RC "Aktif/Tidak Aktif" maps to `INSCAN/OOP`; `UNKNOWN` is reported separately where relevant.

## 3. Dashboard Overview Groups (Architecture Revision §10)

| Group | Metrics |
|-------|---------|
| **OPERATIONAL OVERVIEW** | Total Gardu, Total UP3, Total Penyulang, Total VIP |
| **RC OVERVIEW** | RC Aktif (INSCAN), RC Tidak Aktif (OOP) |
| **PENYULANG OVERVIEW** | Penyulang Sehat, Penyulang Bermasalah |
| **PERFORMANCE OVERVIEW** | Kinerja Hari Ini, Kinerja Bulan Ini, Kinerja Tahun Ini |
| **OPERATIONS OVERVIEW** | Inspeksi Bulan Ini, HAR Bulan Ini, Ticket Open, Ticket Closed |

## 4. Charts

| Chart | Description |
|-------|-------------|
| **Performance Trend** | Daily / Monthly / Yearly trend of performance score/availability |
| **Top Problem Gardu** | Top 10 Gardu Bermasalah (table) |
| **Top Problem Penyulang** | Penyulang with most issues |

## 5. Analytics Module KPIs (PRD §15 / Module I)

| Analysis dimension | KPIs |
|--------------------|------|
| **RTUPP** | Total Gardu, Kinerja (performance), Gangguan (faults) |
| **UP3** | Top Performer, Lowest Performer |
| **Penyulang** | Penyulang Bermasalah |
| **Asset** | Asset Rusak (damaged), Asset Tua (aged) |

Cross-cutting analytic counts: Total Gardu, RC Aktif, RC Tidak Aktif, VIP, Non VIP, Inspection Count, HAR Count, Ticket Count.
Top-N analyses: **Top Gangguan**, **Top UP3 Bermasalah**, **Top Penyulang Bermasalah**.

## 6. KPI Calculation Notes

| KPI | Calculation |
|-----|-------------|
| **Kinerja Hari Ini** | Aggregate of `performance_daily.performance_status` for today (e.g. % of Gardu with status=1) |
| **Kinerja Bulan Ini** | Aggregate over current month |
| **Kinerja Tahun Ini** | Aggregate over current year |
| **Penyulang Sehat / Bermasalah** | Derived from `feeders.condition_status` (healthy vs. problematic) |
| **Performance Trend** | Time series of average `score` (range 0–100) and/or availability (% status=1) |

> ⚠️ **Not specified in source:** exact aggregation formula and thresholds for "Sehat vs. Bermasalah", "Asset Tua" (age threshold), and the precise availability formula. Placeholder definitions above; confirm with product owner before implementation.

## 7. Scoping (RBAC)

- **SUPER ADMIN:** dashboard aggregates across all RTUPP.
- **ADMIN RTUPP / PETUGAS / VIEWER:** dashboard scoped to the user's RTUPP (UAT-012).
- All authenticated users may view the dashboard (SCREEN-002).
