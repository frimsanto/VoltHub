# WORK ORDER — Product Requirements (PRD)

> **Sprint:** VOLTHUB GI WORK ORDER FOUNDATION. **Status:** DESAIN (belum implementasi).
> **Lingkup:** RTUPP1 (GI) lebih dulu; pola yang sama akan dipakai GH/MP nanti.
> **Prinsip:** Work Order menjadi **entry point** workflow GI — **tidak** mengganti/membongkar
> modul GI, HAR, SCADA, RC, atau Approval yang sudah stabil. Additive di atas yang ada.
> **Tidak menyentuh:** AI, WhatsApp, GH, MP.

---

## 1. Tujuan bisnis
Saat ini petugas dapat **langsung** membuat Inspeksi GI / HAR GI dari menu. Secara operasional ini
salah: petugas lapangan tidak bekerja dari form — mereka bekerja dari **penugasan (Work Order)** yang
diterbitkan atasan/ADMIN. Work Order menertibkan: siapa mengerjakan apa, di mana, kapan jatuh tempo,
dan menyatukan hasil (Inspeksi/HAR) + persetujuan dalam satu siklus yang dapat dilacak & ditutup.

**Outcome yang diinginkan:**
1. Petugas **menerima** WO, bukan membuat form dari nol.
2. Setiap Inspeksi GI / HAR GI **lahir dari** sebuah WO (ketertelusuran 1 WO → 1 laporan).
3. ADMIN RTUPP1 dapat menerbitkan, menugaskan, memantau, menyetujui, dan **menutup** WO.
4. Dashboard menjawab "berapa WO open/terlambat/selesai" selain metrik laporan yang sudah ada.

**Non-goals (sprint ini):** menjadwalkan WO otomatis, SLA/eskalasi, notifikasi push, WO untuk GH/MP,
WO multi-laporan (1 WO = banyak laporan). Semua itu fase lanjutan.

---

## 2. Actor & peran
| Actor | Wewenang terhadap Work Order |
|---|---|
| **ADMIN RTUPP1** | Membuat/menerbitkan WO, menugaskan ke petugas/tim, memantau, menyetujui hasil, menutup (CLOSE), menolak (REJECT), membuka ulang (REOPEN). Tidak mengisi laporan. |
| **PETUGAS RTUPP1** | Menerima WO yang ditugaskan padanya, mulai mengerjakan (IN_PROGRESS), mengisi Inspeksi/HAR **dari** WO, submit. Hanya WO miliknya. |
| **MASTER** | Lihat semua WO lintas RTUPP (monitoring), dapat bertindak sebagai approver lintas RTUPP. |
| **MANAGER** | Read-only (monitoring) WO + dashboard. |

Scope tenant: WO discope per-RTUPP melalui **`Location.rtuppId`** (pola yang sama dengan modul GI),
PETUGAS lebih jauh dibatasi ke WO yang `assignedTo = dirinya`.

---

## 3. Jenis Work Order
| Type | Menghasilkan | Jalur |
|---|---|---|
| **PREVENTIVE** | **Inspeksi GI** | terencana / berkala |
| **CORRECTIVE** | **HAR GI** | respons gangguan / perbaikan |

Satu WO punya **satu** `type`, yang menentukan laporan apa yang boleh dibuat dari WO tsb.

---

## 4. Workflow (status hidup WO)
```
OPEN ──assign──▶ (assigned) ──petugas mulai──▶ IN_PROGRESS
   └─ petugas isi & submit laporan ──▶ SUBMITTED
        ├─ ADMIN setujui ──▶ APPROVED ──tutup──▶ CLOSED
        └─ ADMIN tolak  ──▶ REJECTED ──petugas perbaiki──▶ IN_PROGRESS (loop)
CLOSED ──ADMIN reopen (opsional)──▶ IN_PROGRESS
```
Status kanonik WO: **OPEN · IN_PROGRESS · SUBMITTED · APPROVED · REJECTED · CLOSED**
(lihat pemetaan ke enum existing di ERD §4).

Hubungan dengan status laporan GI (`GiReportStatus`: DRAFT→SUBMITTED→VALIDATED/REJECTED) **dipertahankan**;
WO membungkusnya (lihat WORKFLOW §3 untuk sinkronisasi).

---

## 5. Relasi dengan modul yang sudah ada

### 5.1 Relasi dengan GI (Inspeksi)
- WO `PREVENTIVE` → tombol "Mulai Inspeksi" membuka **form Inspeksi GI yang sudah ada**, dengan
  `locationId`, `feederId`, dan konteks RTU/penyulang **terisi dari WO** (prefill).
- Laporan Inspeksi GI menyimpan `workOrderId` (FK additive) → 1 WO ↔ 1 Inspeksi.

### 5.2 Relasi dengan HAR
- WO `CORRECTIVE` → tombol "Mulai HAR" membuka **form HAR GI yang sudah ada**, prefill dari WO.
- Laporan HAR GI menyimpan `workOrderId` (FK additive).

### 5.3 Relasi dengan Approval
- Approval **tetap di laporan** (validate/reject Inspeksi/HAR yang sudah ada). WO mengikuti hasil:
  laporan VALIDATED → WO APPROVED → ADMIN CLOSE; laporan REJECTED → WO REJECTED (petugas perbaiki).
- Tidak ada mesin approval kedua; WO hanya **mencerminkan & menutup** keputusan yang sudah ada.

### 5.4 Relasi dengan SCADA Compare & RC
- Tidak berubah. Compare "DI MASTER" + Berhasil RC tetap dihitung di dalam Inspeksi/HAR seperti sekarang.
  WO hanya membawa konteks (RTU/penyulang) sebagai prefill.

---

## 6. Sumber data dropdown WO (penting — sesuai arahan)
WO **memakai data GI/aset yang sudah benar**, tidak membuat master baru:
| Field WO | Sumber existing |
|---|---|
| Lokasi GI | `locations` (locationType=GI) — `useLocationOptions("GI")` |
| Penyulang | `feeders` milik GI terpilih — `useFeederOptions(locationId)` |
| Aset (opsional, mis. RTU) | `assets` milik GI terpilih — `useAssetOptions({locationId})` |
| Penyulang/Bay SCADA | snapshot SCADA per-RTU (sudah ada) |
| Petugas (assignedTo) | users RTUPP/tim — `useUserOptions` |
| Tim (teamId) | `teams` di RTUPP |

> Catatan: bila dropdown Penyulang tampak kosong saat memilih GI, itu karena tabel `feeders`
> untuk GI tsb belum terisi — **bukan** logika form. Verifikasi seed/import penyulang GI
> (lihat GAP_ANALYSIS G-6). Desain WO tetap menarik dari sumber yang sama agar konsisten.

---

## 7. Kebutuhan fungsional (FR)
- **FR-1** ADMIN dapat membuat WO: type, lokasi GI, penyulang (opsional), aset (opsional), assignedTo, teamId, dueDate, notes. Nomor WO otomatis.
- **FR-2** WO discope per-RTUPP; PETUGAS hanya melihat WO yang ditugaskan padanya.
- **FR-3** PETUGAS mengubah WO OPEN→IN_PROGRESS saat mulai bekerja.
- **FR-4** Dari WO, PETUGAS membuka form Inspeksi (PREVENTIVE) / HAR (CORRECTIVE) dengan prefill; laporan ter-link ke WO.
- **FR-5** Saat laporan disubmit, WO → SUBMITTED; saat divalidasi → APPROVED; ditolak → REJECTED.
- **FR-6** ADMIN dapat CLOSE WO yang APPROVED; REOPEN WO CLOSED; REJECT.
- **FR-7** Dashboard menampilkan ringkasan WO (open, in-progress, terlambat/over-due, closed) di samping metrik laporan.
- **FR-8** Transisi WO tercatat (audit) — reuse `audit_logs`.

## 8. Kebutuhan non-fungsional (NFR)
- Additive only: tidak menghapus kolom/route/komponen GI yang ada.
- Reuse: tickets module + lookups + form GI + approval existing.
- Backward compatible: laporan GI **tanpa** `workOrderId` (legacy/manual) tetap valid selama transisi.
- Idempotent create (pola idempotency yang sudah dipakai laporan GI).

## 9. Kriteria sukses
1. PETUGAS dapat menyelesaikan satu siklus PREVENTIVE penuh **dari WO**: terima WO → IN_PROGRESS → Inspeksi GI (prefilled) → submit → ADMIN approve → CLOSE.
2. Idem untuk CORRECTIVE via HAR GI.
3. Menu "Buat Inspeksi/HAR GI" mandiri **dinonaktifkan/disembunyikan** untuk PETUGAS (entry hanya via WO) — bertahap, lihat ROADMAP.
4. Dashboard menampilkan status WO yang konsisten dengan tindakan lapangan.

## 10. Pertanyaan terbuka (perlu keputusan sebelum implementasi)
- **Q1:** Realisasikan WO dengan **memperluas tabel `tickets`** (rekomendasi, reuse) atau **tabel `work_orders` baru**? (ERD §2 membandingkan.)
- **Q2:** 1 WO = 1 laporan (rekomendasi sprint ini) atau boleh banyak laporan?
- **Q3:** Apakah menu "Buat Inspeksi/HAR GI" mandiri dihapus total atau hanya untuk PETUGAS (ADMIN/MASTER tetap bisa untuk kasus khusus)?
- **Q4:** Apakah `dueDate` wajib? SLA/overdue dihitung sekarang atau fase lanjut?
