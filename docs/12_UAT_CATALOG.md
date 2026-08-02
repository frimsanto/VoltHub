# 12 — UAT SCENARIO CATALOG

**Product:** VoltHub V2
**Version:** 1.0
**Status:** Approved Draft
**Source:** `dokumen_lengkap/UAT SCENARIO CATALOG.docx`

---

## MASTER DATA

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-001** | Create Gardu | Gardu saved successfully. |
| **UAT-002** | Edit Gardu | Change saved **and** audit log recorded. |
| **UAT-003** | Import 3,633 Gardu | All Gardu created successfully. |

## ASSET

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-004** | Add Asset to Gardu | Asset appears on the Gardu Detail page. |
| **UAT-005** | Move Asset to another Gardu | Move history is recorded. |

## INSPECTION

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-006** | Create Inspection | Inspection appears in Gardu history. |
| **UAT-007** | Upload Inspection photo | Photo is saved and can be opened. |

## HAR

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-008** | Create HAR | HAR appears in Gardu history. |

## PERFORMANCE

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-009** | Import monthly Performance | Data stored in `performance_daily`. |
| **UAT-010** | Display Performance Trend | Chart renders according to the data. |

## DASHBOARD

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-011** | Display Executive KPI | All widgets render. |
| **UAT-012** | Display RTUPP KPI | Data limited to the user's RTUPP only. |

## SECURITY

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-013** | Admin RTUPP opens another RTUPP | **Access Denied.** |
| **UAT-014** | Viewer attempts to edit data | **Access Denied.** |

## AUDIT

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| **UAT-015** | Data change recorded in Audit Log | Audit log complete. |

---

## GO-LIVE CRITERIA

- All UAT scenarios must pass.
- **Minimum pass rate: 95%.**
- **Critical failures: 0.**

---

## Traceability — UAT → Business Rule / Module

| UAT | Module | Related rule |
|-----|--------|--------------|
| UAT-001/002/003 | Master Gardu | BR-001..004, BR-D02 |
| UAT-004/005 | Asset | BR-006, BR-008 |
| UAT-006/007 | Inspection | BR-013..015 |
| UAT-008 | HAR | BR-016, BR-017 |
| UAT-009/010 | Performance | BR-010..012 |
| UAT-011/012 | Dashboard/Analytics | BR-020 |
| UAT-013/014 | Security/RBAC | BR-019, BR-020 |
| UAT-015 | Audit | BR-018, BR-D02 |

---

*END OF UAT CATALOG*
