# 07 — PERMISSION MATRIX (RBAC)

**Product:** VoltHub V2
**Status:** Derived baseline — consolidated from `REQUIREMENT ANALYSIS.docx` (§3 User Roles), `PRD.docx` (§16), and `BUSINESS RULES CATALOG.docx` (Security Rules).
**Authorization model:** Role-Based Access Control (RBAC), scoped by RTUPP.

---

## 1. Roles (Approved)

| Role | Scope | Summary |
|------|-------|---------|
| **SUPER ADMIN** | Global | Full access to all users, roles, master data, and all RTUPP; views all reports |
| **ADMIN RTUPP** | Own RTUPP only | Manages Gardu, Penyulang, Asset, Inspection, HAR; views RTUPP dashboard; **cannot** access other RTUPP |
| **PETUGAS INSPEKSI** | Assigned scope | Views Gardu, fills inspection results, uploads photos, creates findings; **cannot** modify master data |
| **PETUGAS HAR** | Assigned scope | Creates/updates HAR, uploads documentation; **cannot** modify master data |
| **VIEWER / MANAJEMEN** | Read-only | Views dashboard, reports, analytics; **cannot** modify data |

> ⚠️ **Conflict with current code.** The live enum `UserRole` is `SUPERADMIN, ADMIN, ADMIN_RTUPP, PETUGAS` (4 values). The approved baseline requires 5 roles: `SUPER_ADMIN, ADMIN_RTUPP, PETUGAS_INSPEKSI, PETUGAS_HAR, VIEWER`. Reconciliation (mapping `PETUGAS`→split, adding `VIEWER`, removing/retasking `ADMIN`) is a migration item — see [06_MIGRATION_STRATEGY.md](06_MIGRATION_STRATEGY.md). No code is changed in the documentation phase.

---

## 2. Permission Matrix

Legend: **F** = Full (CRUD) · **C** = Create · **R** = Read/View · **U** = Update · **—** = No access · **own** = limited to own RTUPP scope

| Capability | SUPER ADMIN | ADMIN RTUPP | PETUGAS INSPEKSI | PETUGAS HAR | VIEWER |
|------------|:-----------:|:-----------:|:----------------:|:-----------:|:------:|
| **Users — manage** | F | — | — | — | — |
| **Roles — manage** | F | — | — | — | — |
| **Master Gardu — CRUD** | F | F (own) | R | R | R |
| **Master Penyulang — CRUD** | F | F (own) | R | R | R |
| **Asset — CRUD** | F | F (own) | R | R | R |
| **Asset — move between Gardu** | F | F (own) | — | — | — |
| **Inspection — create/edit** | F | F (own) | C/U | R | R |
| **Inspection — upload photo** | F | F (own) | C | R | — |
| **Inspection — approve** | F | F (own) | — | — | — |
| **HAR — create/update** | F | F (own) | R | C/U | R |
| **HAR — upload docs** | F | F (own) | — | C | — |
| **HAR — close** | F | F (own) | — | C/U | — |
| **Performance — view** | R | R (own) | R | R | R |
| **Performance — import** | F | F (own) | — | — | — |
| **Ticket — create/assign/close** | F | F (own) | C (R) | C (R) | R |
| **Dashboard — view** | R (all) | R (own) | R | R | R |
| **Analytics — view** | R (all) | R (own) | R | R | R |
| **Reports — generate/export** | F | F (own) | R | R | R |
| **Audit Log — view** | R | R (own) | — | — | — |
| **Audit Log — edit** | — | — | — | — | — |

> Cells marked "own" are constrained to the user's `rtupp_id`. All authenticated roles can view the Dashboard (per Screen Spec SCREEN-002).

---

## 3. Security Business Rules (binding)

| Rule | Statement |
|------|-----------|
| **BR-018** | Audit Log **must not** be edited (no role, including SUPER ADMIN). |
| **BR-019** | The Super Admin role **must not** be deleted. |
| **BR-020** | A user **must not** access another RTUPP without explicit access rights. |

Reinforced by UAT:
- **UAT-012** — Admin RTUPP sees KPI data only for their own RTUPP.
- **UAT-013** — Admin RTUPP opening another RTUPP → **Access Denied**.
- **UAT-014** — Viewer attempting to edit → **Access Denied**.

---

## 4. Scoping Rules

1. Every data-mutating request from an **ADMIN RTUPP / PETUGAS** is filtered by the user's `rtupp_id`.
2. **SUPER ADMIN** bypasses RTUPP scoping (global).
3. **VIEWER / MANAJEMEN** is read-only across all modules within their granted scope.
4. RTUPP isolation is enforced server-side (not only in the UI) — cross-RTUPP reads/writes must return `403 Access Denied`.

> ⚠️ **Not specified in source:** whether PETUGAS INSPEKSI / PETUGAS HAR are scoped per-RTUPP, per-UP3, or per-assignment. Assumed RTUPP-scoped here, consistent with the org model. Confirm with product owner.
