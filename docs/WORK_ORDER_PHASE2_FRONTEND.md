# Work Order Domain — Phase 2 Frontend (Operation Management System GI RTUPP1)

> Status: **DONE**. Built 2026-06-21 on top of Phase 1 backend. Reuse-first
> (createResource factory, v2 client, DataTable/PageHeader/StatCard kit, RBAC).
> `vite build` ✓ and `tsc --noEmit` ✓ (both exit 0).

## What was built

### Enums / RBAC / badges (shared)
- `src/lib/v2/enums.ts` — WO types/statuses + labels, ChecklistCondition,
  WorkResult, CbStatus (+ labels). Mirror BE enums.
- `src/lib/v2/rbac.ts` — capabilities `workOrders.create` / `workOrders.manage`
  (ADMIN_TIER), `workOrders.execute` (REPORT_WRITE incl. PETUGAS), `bays.write`.
- `src/components/v2/StatusBadge.tsx` — `WorkOrderStatusBadge`, `WorkOrderTypeBadge`.

### Work Order feature (`src/features/v2/work-orders/`)
- `resource.ts` — typed WorkOrder/CreateWorkOrder/UpdateWorkOrder over the
  createResource factory; `useWorkOrderTransition(action)` (assign/start/submit/
  approve/reject/close/reopen → `POST /work-orders/:id/<action>`);
  `useWorkOrderStats` (counts by bucket for cards); `useWorkOrderActivity`
  (audit trail); zod form schema.
- `WorkOrderForm.tsx` — create/edit. Dependent dropdowns GI → Bay → Penyulang →
  Aset (reuse useLocationOptions("GI"), useBayOptions, useFeederOptions,
  useAssetOptions); team/PIC selects (admin only); jenis/priority/dueDate/SCADA ref.
- `AssignForm.tsx` — team + PIC reassignment from the detail page.

### Bay feature (`src/features/v2/bays/`)
- `resource.ts` (+ `useBayOptions`) and `BayForm.tsx` — master data CRUD.

### Routes
- `_app.work-order.tsx` — list + 4 StatCards (Aktif / Menunggu Approval /
  Selesai / Terlambat), filters (status, jenis), create/edit/delete. PETUGAS
  auto-scoped (`mine=true`). Lives at `/work-order`.
- `_app.work-order.$id.tsx` — detail with status-aware lifecycle action panel
  (Tugaskan / Mulai Kerjakan / Ajukan Approval / Setujui / Tolak+catatan revisi /
  Tutup / Buka Kembali), Ringkasan (InfoGrid), Timeline, Anggota Tim, Laporan
  Tertaut, Riwayat Aktivitas.
- `_app.bay.tsx` — Bay master-data table + create/edit/delete.

### Laporan checklist fields
- `_app.laporan-awal.tsx` — new "Kondisi Perangkat (Checklist)" section:
  Relay/RC/LR/ES/Status CB (NORMAL/ABNORMAL/TIDAK_BEROPERASI) + `workOrderId`
  passthrough; mapped in schema/defaults/toFormValues/submit.
- `_app.laporan-akhir.tsx` — new "Hasil Uji Remote & Analisis" section:
  RC/LR/ES (BERHASIL/GAGAL), Status CB (NORMAL/TIDAK_NORMAL), penyebab/tindakan/
  rekomendasi + `workOrderId`; flows to API via existing `...rest` spread.

### Navigation (`src/lib/v2/nav.ts`) — per-role restructure
- "Aset & Jaringan" → renamed **Master Data**; added **Bay**.
- "Operasional Lapangan": **Work Order** now points to `/work-order` (was the
  generic `/tickets`). Hidden (commented, routes kept): Inspeksi, HAR, Dashboard
  GI, Inspeksi GI, HAR GI.
- "Pelaporan Lapangan" (PETUGAS): added **WO Saya** (`/work-order`); hidden
  Inspeksi GI / HAR GI.
- "Monitoring SCADA": **Performance** hidden from menu (route kept).
- AI already lives in the floating FAB (not the sidebar) — nothing to hide.

## Not changed / kept intact
- All hidden routes (`/inspection`, `/har`, `/inspeksi-gi`, `/har-gi`,
  `/gi-dashboard`, `/performance`, `/tickets`) still exist and load — only removed
  from navigation per the locked Phase-1 decision. No data/route deletion.

## Verify locally
`cd FE && npm run build` (✓) then `npx tsc --noEmit` (✓). Backend must be running
with the Phase-1 migration applied (`cd BE && npx prisma migrate deploy`).

---

# Phase 3 — Loop closure + operational dashboard (DONE 2026-06-21)

## WO → Laporan prefill (closes the field loop)
- Both laporan routes accept `?wo=<id>` (added to `validateSearch`).
- `_app.laporan-awal.tsx` / `_app.laporan-akhir.tsx`: when `wo` present (non-edit),
  fetch the WO (`workOrders.useOne`) and prefill `workOrderId` + lokasi GI/gardu +
  pekerjaan/jenis. So a submitted laporan is auto-linked → WO mirrors to
  ON_PROGRESS / WAITING_APPROVAL (Phase-1 `workOrderSync`).
- `_app.work-order.$id.tsx`: assignee/admin get **Isi Laporan Awal** / **Isi
  Laporan Akhir** buttons (status ASSIGNED/ON_PROGRESS/REJECTED) →
  `navigate({ to: "/laporan-awal", search: { wo: id } })`.

## Operational dashboard — RC/LR/ES success + per-team
- **BE**: `GET /api/v1/work-orders/stats/summary` (tenant-scoped) →
  `{ total, open, waiting, approved, closed, rejected, overdue, byStatus, byType,
  byTeam:[{teamId,teamName,total,closed,successRate}], checklist:{rc,lr,es:
  {berhasil,gagal,total,successRate}} }`. Aggregations via Prisma `groupBy`
  (work-order.repository: statusCounts/typeCounts/overdueCount/teamTotals/
  teamClosed/checklistCounts). RC/LR/ES tallied from `laporan_akhir.hasil*`,
  scoped by report author's RTUPP. Route declared before `/:id`.
- **FE**: `useWorkOrderSummary` + `WorkOrderInsights.tsx` (RC/LR/ES success cards +
  per-team table). Embedded on the WO list page for non-PETUGAS (OPS roles).

## Verify
BE: `npx tsc --noEmit` ✓, `vitest run` ✓ (189). FE: `npm run build` ✓, `tsc` ✓.
Live groupBy smoke ✓.

---

# Phase 4 — WO replaces Laporan Akhir ("Laporan WO") (DONE 2026-06-22)

Stakeholder decision: **Laporan Akhir dihapus dari alur**; the WO itself is the
completion report. Tinggal **Laporan Awal** + **Laporan WO**. (Laporan Akhir
table/routes/data kept but hidden — not deleted.)

## Backend (migration `20260621120000_work_order_result_fields_additive`, additive)
- `work_orders` += `hasilRC/hasilLR/hasilES` (BERHASIL/GAGAL), `statusCB`
  (NORMAL/TIDAK_NORMAL), `penyebab/tindakan/rekomendasi` (TEXT).
- New table `work_order_attachments` (foto sebelum/sesudah; isolated from the
  shared `attachments` table) → served via existing `/uploads` static mount.
- Validation `workOrderResultSchema` (all optional). `submit` now accepts the
  result body → persists hasil + transitions ON_PROGRESS→WAITING_APPROVAL.
  New `POST /:id/result` (save draft, no transition).
- Photos: `GET/POST/DELETE /work-orders/:id/photos` (multer `uploadAllInOne`,
  category FOTO_HASIL; web path computed from the saved file).
- **Stats**: `checklistCounts` RC/LR/ES now reads `work_orders.hasil*`
  (was `laporan_akhir`) — the dashboard success-rate now reflects Laporan WO.

## Frontend
- `work-orders/resource.ts` += result fields on WorkOrder, `WorkOrderResult`,
  `WorkOrderPhoto`, hooks `useSaveWorkOrderResult` / `useWorkOrderPhotos` /
  `useUploadWorkOrderPhotos` / `useDeleteWorkOrderPhoto`.
- `WorkOrderResultForm.tsx` — RC/LR/ES/CB selects + penyebab/tindakan/rekomendasi
  + foto upload/list/delete; "Simpan Draft" (result) and "Simpan & Ajukan
  Approval" (submit with body).
- `_app.work-order.$id.tsx` — replaced "Isi Laporan Akhir" with **Lengkapi
  Laporan WO** (modal); removed the bare "Ajukan Approval" button (submission now
  carries the result); result + analisis shown in the summary InfoGrid.
- `nav.ts` — removed **Laporan Akhir** from the PETUGAS menu (already absent for
  ops). PETUGAS field menu = WO Saya + Laporan Awal + Riwayat.

## Verify
BE `tsc` ✓ + `vitest` ✓ (189); FE `build` ✓ + `tsc` ✓; live smoke (result fields +
attachment + RC groupBy) ✓.
