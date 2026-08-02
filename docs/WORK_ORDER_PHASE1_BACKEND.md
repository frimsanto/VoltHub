# Work Order Domain — Phase 1 Backend (Operation Management System GI RTUPP1)

> Status: **DONE (backend foundation)**. Built 2026-06-21. Additive, reuse-first.
> Decisions taken by stakeholder (this refactor): **new `work_orders` + `work_order_assignments`
> + `bays` tables** (literal spec, not "extend tickets"); **Laporan Awal + Laporan Akhir**
> are the WO field forms (Inspeksi-GI / HAR-GI NOT used); **first-class Bay** entity.
> Supersedes the earlier Option-A proposal in WORK_ORDER_ERD.md / _PRD.md / _ROADMAP.md.

## What was built

### Schema (`prisma/schema.prisma`) + migration `20260621000000_work_order_domain_additive`
PURELY ADDITIVE — no DROP/RENAME. New:
- **enums**: `WorkOrderType {CORRECTIVE, PREVENTIVE}`, `WorkOrderStatus {DRAFT, ASSIGNED,
  ON_PROGRESS, WAITING_APPROVAL, APPROVED, REJECTED, CLOSED}`, `ChecklistCondition
  {NORMAL, ABNORMAL, TIDAK_BEROPERASI}`, `WorkResult {BERHASIL, GAGAL}`, `CbStatus
  {NORMAL, TIDAK_NORMAL}`.
- **`bays`** — GI → Bay master data (locationId→GI, code, name, voltageLevel). Unique (locationId, code).
- **`work_orders`** — woNumber (unique, auto `WO-GI-YYYYMM-xxxxxx`), type, status, priority,
  title/description, location hierarchy (locationId GI + nullable bayId/feederId/assetId),
  assignment (teamId, assignedToId), SCADA source (scadaGarduId, scadaEventRef), dueDate,
  lifecycle stamps (started/submitted/approved/rejected/closed + by-whom), revisionNote, soft delete.
- **`work_order_assignments`** — per-WO team members (workOrderId, userId, role: PELAKSANA/
  PENGAWAS/K3/MANUVER). Unique (workOrderId, userId).
- **additive FKs/cols on existing tables**: `feeders.bayId`, `assets.bayId` (GI→Bay→Penyulang/Asset);
  `laporan_awal` += `workOrderId` + checklist `cekRelay/cekRC/cekLR/cekES/cekStatusCB`;
  `laporan_akhir` += `workOrderId`, `hasilRC/hasilLR/hasilES` (BERHASIL/GAGAL), `statusCB`,
  `penyebab/tindakan/rekomendasi`. All nullable → legacy rows untouched.

### Modules (mirror the `tickets` module conventions)
- `src/modules/bays/` — bay.{validation,repository,service,controller,routes}.ts. CRUD, tenant-scoped
  via `location.rtuppId` (`viaLocationScopeWhere`), audit-logged. Bay only on GI locations.
- `src/modules/work-orders/` — work-order.{validation,repository,service,controller,routes}.ts +
  `work-order.transitions.ts` (pure state machine, unit-tested) + `.test.ts`.
  - State machine: DRAFT→ASSIGNED→ON_PROGRESS→WAITING_APPROVAL→APPROVED→CLOSED, with
    REJECTED (→ON_PROGRESS rework loop) and REOPEN (CLOSED→ON_PROGRESS).
  - Endpoints: `GET/POST /work-orders`, `GET/PUT/DELETE /work-orders/:id`,
    `POST /:id/{assign,start,submit,approve,reject,close,reopen}`.
  - RBAC: read = all auth (PETUGAS auto-restricted to own/assigned WOs);
    create/update/assign/approve/reject/close/reopen/delete = MASTER+ADMIN (WRITE_ROLES);
    start/submit = +PETUGAS (REPORT_WRITE_ROLES, must be the assignee).
- Mounted at `/api/v1/bays` and `/api/v1/work-orders` (`src/routes/index.ts`).

### Laporan ↔ WO integration (`src/utils/workOrderSync.ts`)
Best-effort, never-throws mirror of WO status from Laporan events:
- Laporan Awal/Akhir created (linked to WO) → WO `ON_PROGRESS`
- Laporan Akhir submitted (PENDING) → WO `WAITING_APPROVAL`
- Laporan Akhir approved → WO `APPROVED`; rejected → WO `REJECTED`
- A CLOSED WO is never moved back by report events.
New checklist + workOrderId fields mapped in `laporanAwalService` / `laporanAkhirService`
create + update; validators (`validators/laporanValidators.ts`) accept them.

## Verification
- `tsc --noEmit` clean. `vitest run` → **189 passed** (incl. 11 new WO state-machine tests).
- Live DB end-to-end smoke: created Bay + WO on a real GI, walked full lifecycle to CLOSED
  with an assignment row, FK relations & cleanup all OK.

## ⚠️ Environment note (NOT a code issue)
During this session the `voltreport` DB was observed to **roll back externally** to a pre-
`20260612` state (lost `locations.rtuppId`, AI-brain, and this WO migration). Recovered with
`prisma migrate deploy` (re-applied 5 pending migrations). If the DB regresses again, run
`cd BE && npx prisma migrate deploy` to restore. Tenant scoping (ADMIN/PETUGAS) for the whole
app depends on `locations.rtuppId`, so a regressed DB breaks scoped reads everywhere, not just WO.

## Not done in Phase 1 (next: Frontend, per checkpoint)
- FE: Work Order list/detail/create, assignment UI, dashboard WO cards, Laporan Awal/Akhir
  checklist fields (RC/LR/ES/CB) in forms, nav restructure per role, hide GH/MP/HAR/Inspeksi/AI/
  Performance from menus.
- Bay master-data CRUD screen + import; SCADA-event → WO entry button.
