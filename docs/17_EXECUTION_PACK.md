# 17 — EXECUTION PACK

**Product:** VoltHub V2
**Status:** Consolidated execution reference
**Purpose:** A single entry point tying together all 16 preceding documents into an actionable build sequence. This pack introduces **no new architecture**; it only sequences what the approved documents define.

---

## 1. Architecture Lock (non-negotiable)

| Item | Decision |
|------|----------|
| Core Entity | **GARDU (Site)** |
| Architecture Style | **Gardu-Centric Architecture** |
| Primary Screen | **Gardu 360** (`/gardu/:id`) |
| Hierarchy | RTUPP → UP3 → Penyulang → Gardu → Asset |
| Operational Modules | Inspection · HAR · Performance · Ticket |
| Preserved Terminology | `INSCAN`, `OOP`, `UNKNOWN`, `VIP`, `VVIP`, `NON_VIP` |
| Target DB (approved docs) | PostgreSQL |

> Rule: *No operational record may exist without a Site. Asset is not the center; Site is the center.*

---

## 2. Document Map

| # | Document | Role in execution |
|---|----------|-------------------|
| 01 | Architecture Revision | Why & the locked decision |
| 02 | Requirement Analysis | What the system must do |
| 03 | PRD | Product behaviour & releases |
| 04 | Domain Model | Entities & taxonomy |
| 05 | ERD | Physical data model (target) |
| 06 | Migration Strategy | Old → new data move |
| 07 | Permission Matrix | RBAC enforcement |
| 08 | Import Strategy | Bulk data loading |
| 09 | Dashboard & KPI | Metrics & aggregation |
| 10 | Data Dictionary | Field definitions & enums |
| 11 | Business Rules | Invariants to enforce |
| 12 | UAT Catalog | Acceptance tests |
| 13 | Screen Specification | UI surfaces |
| 14 | Gardu 360 | Primary screen detail |
| 15 | API Spec | Endpoints |
| 16 | Backlog | EPICs/Stories & releases |
| 17 | Execution Pack | This sequencing document |

---

## 3. Build Order (end-to-end)

```
1. Provision PostgreSQL + schema (ERD §1–16)           → EPIC-1
2. Seed Organization tree (RTUPP 2–5)                  → Migration Phase 1
3. Import Penyulang → feeders                          → Migration Phase 2
4. Import 3,633 Gardu → sites                          → Migration Phase 3 / Story 24
5. Asset taxonomy + Asset registry migration           → Migration Phase 4 / EPIC-3
6. Operations: Inspection, HAR, Performance            → EPIC-4 / Migration Phase 5
7. Service: Ticket + Attachment                        → EPIC-5
8. Admin: Roles, Users, Audit                          → EPIC-6
9. Dashboards + Analytics                              → EPIC-7
10. Validation (0% tolerance) + UAT (≥95%, 0 critical) → Migration Phase 6 / EPIC-9
```

---

## 4. Go-Live Gate

| Gate | Source | Threshold |
|------|--------|-----------|
| Gardu migrated | Migration §5 | 100% |
| Penyulang migrated | Migration §5 | 100% |
| Assets linked to Gardu | Migration §5 | 100% |
| Reconciliation tolerance | Migration §6 | 0% |
| UAT pass rate | UAT criteria | ≥ 95% |
| UAT critical failures | UAT criteria | 0 |
| Dashboard real-time | Requirement Analysis §6 | Available |
| Excel dependency removed | Requirement Analysis §6 | Yes |

---

## 5. Decisions Required Before Build (open items consolidated)

| # | Open item | Source doc | Owner decision needed |
|---|-----------|-----------|-----------------------|
| 1 | **MySQL (current) vs PostgreSQL (approved ERD)** | 01, 05, 06 | Confirm target engine & migration path |
| 2 | **4 roles (current enum) vs 5 roles (approved)** | 02, 07 | Confirm final role set & mapping |
| 3 | Excel import templates / column headers | 08 | Define canonical templates |
| 4 | Upsert vs reject policy on duplicate imports | 08 | Define per dataset |
| 5 | Penyulang `condition_status` allowed values | 10 | Enumerate |
| 6 | Ticket `category` allowed values | 10 | Enumerate |
| 7 | KPI formulas (availability, "Sehat/Bermasalah", "Asset Tua") | 09 | Define formulas/thresholds |
| 8 | PETUGAS scoping granularity (RTUPP vs UP3 vs assignment) | 07 | Confirm |
| 9 | Asset status taxonomy overlap (taxonomy list vs Data Dictionary enums) | 04, 10 | Confirm canonical enum |
| 10 | Per-tab Gardu 360 endpoints (derived, not in source) | 14, 15 | Ratify endpoint list |

---

## 6. Non-Goals (this phase)

- No source code modification.
- No database schema modification.
- No new core entity.
- No replacement or regeneration of the approved architecture.

This phase produces **documentation only**.
