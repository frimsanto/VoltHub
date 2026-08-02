# 11 — BUSINESS RULES CATALOG

**Product:** VoltHub V2
**Version:** 1.0
**Status:** Approved Draft
**Source:** `dokumen_lengkap/BUSINESS RULES CATALOG.docx`

---

## SITE RULES

| ID | Rule |
|----|------|
| **BR-001** | Every Gardu must have exactly **one** Penyulang. |
| **BR-002** | Every Gardu must belong to **one** UP3. |
| **BR-003** | Every Gardu must belong to **one** RTUPP. |
| **BR-004** | Gardu code (`site_code`) must be **globally unique**. |
| **BR-005** | A Gardu **must not be deleted** while it still has active Assets. |

## ASSET RULES

| ID | Rule |
|----|------|
| **BR-006** | An Asset must be linked to **one** Gardu. |
| **BR-007** | `asset_number` must be **unique**. |
| **BR-008** | An Asset may be **moved to another Gardu** with an audit record. |
| **BR-009** | An Asset with status **RETIRED must not be reused**. |

## PERFORMANCE RULES

| ID | Rule |
|----|------|
| **BR-010** | Performance **must not be entered manually**. |
| **BR-011** | Performance may originate **only from Import or System Integration**. |
| **BR-012** | A Gardu may have **only one performance record per date**. |

## INSPECTION RULES

| ID | Rule |
|----|------|
| **BR-013** | An Inspection must have a **date**. |
| **BR-014** | An Inspection must have an **officer (petugas)**. |
| **BR-015** | An Inspection must be **linked to a Gardu**. |

## HAR RULES

| ID | Rule |
|----|------|
| **BR-016** | HAR must be **linked to a Gardu**. |
| **BR-017** | HAR must have a **date**. |

## SECURITY RULES

| ID | Rule |
|----|------|
| **BR-018** | Audit Log **must not be edited**. |
| **BR-019** | The **Super Admin role must not be deleted**. |
| **BR-020** | A user **must not access another RTUPP** without access rights. |

---

## Cross-References (traceability)

| Rule | Enforced / verified by |
|------|------------------------|
| BR-001..003 | ERD `sites.feeder_id/up3_id/rtupp_id` NOT NULL; Import validation ([08_IMPORT_STRATEGY.md](08_IMPORT_STRATEGY.md)) |
| BR-004 | Unique index on `site_code`; API-001 validation |
| BR-005 | Delete guard on `sites` |
| BR-006 | `assets.site_id` NOT NULL |
| BR-007 | Unique index on `asset_number` |
| BR-008 | `audit_logs` action=`UPDATE`/`STATUS_CHANGE`; UAT-005 |
| BR-010..012 | Performance import-only path; unique `(site_id, performance_date)`; UAT-009 |
| BR-013..017 | Required-field validation on Inspection/HAR APIs |
| BR-018 | Immutable `audit_logs`; UAT-015 |
| BR-019 | Role delete guard |
| BR-020 | RBAC scoping; UAT-012, UAT-013 |

---

## Derived / Implied Rules (⚠️ recommended, confirm with owner)

| ID | Rule | Basis |
|----|------|-------|
| BR-D01 | Every operational record (Inspection, HAR, Performance, Ticket) must reference a Site; none may exist without one. | ERD §16 Database Principles |
| BR-D02 | All data changes must be written to `audit_logs` (who/when/what/old/new). | PRD §17, NFR Audit Trail |
| BR-D03 | Soft-deleted records (`deleted_at` set) are excluded from active lists and counts. | ERD §15 Soft Delete |

---

*END OF BUSINESS RULES*
