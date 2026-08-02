# WORK ORDER — Implementation Roadmap

> Rencana implementasi **setelah desain (PRD/GAP/ERD/WORKFLOW) disetujui**. Additive, reuse-first,
> tidak membongkar GI. Dibagi 3 sprint. **Belum dieksekusi** — ini peta kerja, bukan kode.
> Asumsi: **Opsi A** (perluas `tickets`) dari ERD §2.

---

## Prinsip eksekusi
- Setiap sprint **hijau** (build + test) sebelum lanjut.
- Migration hanya **additive** (kolom nullable, nilai enum baru). Tidak ada drop/rename.
- Laporan GI legacy tanpa WO tetap jalan (transisi mulus).
- Tidak menyentuh logika Compare/RC/validasi laporan.

---

## SPRINT 1 — Fondasi data & API Work Order (backend)
**Tujuan:** WO bisa dibuat, di-list, di-assign, dan ditautkan ke laporan — lewat API.

**Schema (Prisma — additive):**
- `enum WorkOrderType { PREVENTIVE, CORRECTIVE }`.
- `enum TicketStatus` += `SUBMITTED, APPROVED, REJECTED`.
- `model Ticket` += `type, teamId, feederId, assetId, dueDate, completedAt, createdBy` (semua nullable) + relasi `team/feeder/asset`.
- `model InspeksiGiReport` += `workOrderId` (nullable FK) + index.
- `model HarGiReport` += `workOrderId` (nullable FK) + index.
- Migration baru: `add_work_order_foundation_additive`.

**Backend (reuse modul `tickets` yang ada — `BE/src/modules/tickets/…`):**
- Perluas `ticket.validation.ts`: terima `type, teamId, feederId, assetId, dueDate` (opsional).
- `ticket.service.ts`: generator nomor `WO-GI-YYYYMM-####`; scope per-RTUPP (`viaLocationScopeWhere`); filter `assignedTo` untuk PETUGAS; transisi `start/close/reopen`.
- `ticket.repository.ts`: select + relasi `team/feeder/asset/assignee`; filter `type/status/assignedTo/overdue`.
- `ticket.controller.ts` / `ticket.routes.ts`: endpoint reuse (`GET/POST /tickets`, `:id`, aksi). Tambah transisi (mis. `POST /tickets/:id/start|close|reopen`) **bila** belum ada.
- `audit_logs`: catat transisi via `recordAuditLog`.

**Files berubah (perkiraan):**
- `BE/prisma/schema.prisma`, `BE/prisma/migrations/<new>/migration.sql`
- `BE/src/modules/tickets/ticket.{validation,service,repository,controller,routes}.ts`
- (opsi) `BE/src/modules/tickets/ticket.workflow.ts` (state machine kecil)
- Test: `BE/src/modules/tickets/*.test.ts` (transisi + nomor WO + scope).

**Tidak berubah:** inspeksi-gi, har-gi, scada-gi, gi-dashboard (kecuali link di Sprint 2).

**Exit criteria:** buat WO via API; list discope; transisi start/close tervalidasi + teraudit; build & test hijau.

---

## SPRINT 2 — Integrasi WO ↔ GI (link + sinkronisasi status)
**Tujuan:** laporan lahir **dari** WO; status WO mengikuti peristiwa laporan.

**Backend:**
- `inspeksi-gi.validation.ts` / `har-gi.validation.ts`: terima `workOrderId` (opsional).
- `inspeksi-gi.service.ts` / `har-gi.service.ts`:
  - `create`: bila `workOrderId` ada → validasi WO (type cocok, milik scope, assignee benar) → set `workOrderId` → WO `IN_PROGRESS`.
  - `submit`: bila tertaut → WO `SUBMITTED`.
  - `validateReport`: VALIDATED → WO `APPROVED`+`completedAt`; REJECTED → WO `REJECTED`.
  - Hook ringan memanggil `ticketService` (atau fungsi transisi). **Logika compare/RC tak disentuh.**
- Guard: WO PREVENTIVE↔Inspeksi, CORRECTIVE↔HAR.

**Files berubah:**
- `BE/src/modules/inspeksi-gi/inspeksi-gi.{validation,service}.ts`
- `BE/src/modules/har-gi/har-gi.{validation,service}.ts`
- Test: alur WO→submit→validate menggerakkan status WO.

**Exit criteria:** satu siklus PREVENTIVE & CORRECTIVE penuh lewat API: WO→IN_PROGRESS→(laporan)→SUBMITTED→APPROVED→CLOSED, status WO konsisten.

---

## SPRINT 3 — Frontend: WO sebagai entry point (UI)
**Tujuan:** PETUGAS bekerja dari WO; ADMIN menerbitkan & menutup; dashboard menampilkan status WO.

**FE — daftar & detail WO (reuse halaman `tickets`):**
- `FE/src/features/v2/tickets/resource.ts`: tipe + hooks `type/teamId/feederId/assetId/dueDate/workOrderId`, aksi start/close/reopen.
- `FE/src/routes/_app.tickets.tsx` (+ `$id`): kolom type/status/assignee/due/overdue; form **Buat WO** memakai dropdown existing (`useLocationOptions("GI")`, `useFeederOptions`, `useAssetOptions`, `useUserOptions`, teams) — **sesuai arahan reuse data GI**.
- Detail WO: panel status + tombol **Mulai** (petugas), **Close/Reopen** (ADMIN), dan tombol **Isi Inspeksi/HAR GI**.

**FE — form GI dibuka dari WO (prefill):**
- `InspeksiGiForm` / `HarGiForm`: terima `initial` dari WO (locationId, feederId, RTU/bay konteks) + kirim `workOrderId` di payload (mekanisme `initial` sudah ada).
- Route: `/inspeksi-gi?wo=<id>` / `/har-gi?wo=<id>` membuka form prefilled.

**FE — navigasi & guard (transisi entry point):**
- `FE/src/lib/v2/nav.ts`: tambah/teruskan "Work Order" sebagai entry utama PETUGAS; **sembunyikan** tombol "Buat Inspeksi/HAR GI" mandiri untuk PETUGAS (G-9) — bertahap, di belakang flag bila perlu.
- "Tugas Saya" (WO assignee) untuk PETUGAS.

**FE — dashboard WO:**
- `gi-dashboard` (atau `tickets` ringkas): kartu WO **Open / In-Progress / Overdue / Closed** memakai data WO (pola metrik yang sudah ada).

**Files berubah:**
- `FE/src/features/v2/tickets/*`, `FE/src/routes/_app.tickets*.tsx`
- `FE/src/features/v2/{inspeksi-gi,har-gi}/*Form.tsx` (+ route query `?wo=`)
- `FE/src/lib/v2/nav.ts`, dashboard GI.

**Exit criteria:** PETUGAS menyelesaikan siklus penuh **dari UI** tanpa membuat form langsung; ADMIN menerbitkan & menutup WO; dashboard menampilkan status WO; build FE hijau.

---

## Ringkasan dampak per layer
| Layer | Sprint 1 | Sprint 2 | Sprint 3 |
|---|---|---|---|
| Schema | enum + kolom additive `tickets`/`*_gi_reports` | — | — |
| Route | transisi WO (start/close/reopen) | `workOrderId` di create laporan | route `?wo=` (FE) |
| Service | tickets WO logic + audit | sync status WO dari laporan | — |
| FE | — | — | list/detail WO, form prefill, nav, dashboard |

## Yang TIDAK dikerjakan (tegas)
- Tidak ada AI / WhatsApp / GH / MP.
- Tidak mengubah logika SCADA Compare / RC / validasi laporan.
- Tidak menghapus tabel/route/komponen GI yang ada.
- Tidak ada penjadwalan otomatis / SLA / notifikasi (fase jauh).

## Urutan keputusan sebelum Sprint 1
1. Setujui **Opsi A** (extend `tickets`) vs Opsi B (tabel baru). → ERD §2.
2. Setujui **1 WO = 1 laporan**. → PRD Q2.
3. Setujui kebijakan **menyembunyikan entry mandiri** untuk PETUGAS. → PRD Q3 / G-9.
4. `dueDate` wajib? overdue dihitung Sprint 1 atau lanjut? → PRD Q4.

> Setelah keputusan 1–4 + review dokumen, implementasi mulai dari **Sprint 1** (migration additive pertama).
