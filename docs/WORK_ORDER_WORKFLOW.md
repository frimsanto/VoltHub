# WORK ORDER — Workflow Mapping

> Memetakan siklus hidup Work Order ke modul GI yang sudah ada (Inspeksi / HAR / Approval).
> WO **membungkus**, bukan menggantikan. Status laporan (`GiReportStatus`) tetap; WO mengikutinya.
> DESAIN — belum implementasi.

---

## 1. Status WO & transisi (state machine)
| Status | Arti | Aktor pemicu | Transisi berikutnya |
|---|---|---|---|
| **OPEN** | WO terbit, belum dikerjakan | ADMIN (create) | IN_PROGRESS (petugas mulai) |
| **IN_PROGRESS** | Petugas mengerjakan / mengisi laporan | PETUGAS | SUBMITTED |
| **SUBMITTED** | Laporan dikirim untuk validasi | PETUGAS (submit laporan) | APPROVED / REJECTED |
| **APPROVED** | Laporan tervalidasi ADMIN | ADMIN (validate) | CLOSED |
| **REJECTED** | Laporan ditolak ADMIN | ADMIN (reject) | IN_PROGRESS (perbaiki) |
| **CLOSED** | Siklus selesai & ditutup | ADMIN (close) | (REOPEN → IN_PROGRESS, opsional) |

Guard transisi (selaras pola GI):
- OPEN→IN_PROGRESS: hanya `assignedTo` (petugas WO) atau ADMIN.
- IN_PROGRESS→SUBMITTED: otomatis saat laporan terkait di-**submit**.
- SUBMITTED→APPROVED/REJECTED: otomatis saat laporan di-**validate/reject** ADMIN.
- APPROVED→CLOSED: ADMIN eksplisit.
- CLOSED→IN_PROGRESS (REOPEN): ADMIN eksplisit (opsional, fase lanjut).

---

## 2. WO PREVENTIVE → Inspeksi GI
```
ADMIN buat WO (type=PREVENTIVE, lokasi GI, penyulang?, assignee, due)         [OPEN]
  → PETUGAS lihat WO di "Tugas Saya" → klik "Mulai"                            [IN_PROGRESS]
      → klik "Isi Inspeksi GI" → form Inspeksi GI terbuka, PREFILL:
            locationId, feederId, (RTU/penyulang konteks) dari WO
        → SCADA Compare + RC Evaluation (logika existing, tak berubah)
        → Submit laporan (DRAFT→SUBMITTED)                                      [WO: SUBMITTED]
  → ADMIN buka laporan → Validasi (SUBMITTED→VALIDATED)                         [WO: APPROVED]
      → ADMIN Close WO                                                          [CLOSED]
  (bila ADMIN Tolak → laporan REJECTED)                                         [WO: REJECTED → IN_PROGRESS]
```
- Laporan Inspeksi menyimpan `workOrderId`. Satu WO PREVENTIVE = satu Inspeksi GI.

## 3. WO CORRECTIVE → HAR GI
```
ADMIN buat WO (type=CORRECTIVE, lokasi GI, penyulang?, assignee, due)          [OPEN]
  → PETUGAS "Mulai"                                                            [IN_PROGRESS]
      → "Isi HAR GI" → form HAR GI PREFILL dari WO
        → Perbaikan + RC Test (Berhasil RC dari snapshot, existing)
        → Submit (DRAFT→SUBMITTED)                                              [WO: SUBMITTED]
  → ADMIN Validasi                                                             [WO: APPROVED]
      → Close                                                                  [CLOSED]
  (Tolak → REJECTED → perbaiki)                                                 [IN_PROGRESS]
```
- Laporan HAR menyimpan `workOrderId`. Satu WO CORRECTIVE = satu HAR GI.

---

## 3.1 Sinkronisasi status WO ↔ status laporan (penting)
WO **tidak** punya mesin approval sendiri. Status WO diturunkan dari peristiwa laporan yang sudah ada:

| Peristiwa laporan (existing) | Efek ke WO (baru, di service layer) |
|---|---|
| Inspeksi/HAR **create dari WO** | WO: OPEN/ASSIGNED → IN_PROGRESS (bila belum) |
| Laporan **submit** | WO → SUBMITTED |
| Laporan **validate (VALIDATED)** | WO → APPROVED + `completedAt=now` |
| Laporan **reject (REJECTED)** | WO → REJECTED |
| ADMIN **close** WO | WO → CLOSED + `closedAt=now` |

Implementasi: hook ringan di service Inspeksi/HAR (`submit`, `validateReport`) — bila `workOrderId`
ada, perbarui status WO. **Tidak mengubah** logika compare/RC/validasi laporan itu sendiri.

---

## 4. Aksi Approval / Close / Reopen / Reject (sisi WO)
| Aksi | Pra-syarat status WO | Hasil | Aktor |
|---|---|---|---|
| **Approve** (implisit) | SUBMITTED | APPROVED (mengikuti laporan VALIDATED) | ADMIN |
| **Reject** (implisit) | SUBMITTED | REJECTED (mengikuti laporan REJECTED) | ADMIN |
| **Close** | APPROVED | CLOSED | ADMIN |
| **Reopen** (opsional) | CLOSED | IN_PROGRESS | ADMIN |

Catatan: "Approve/Reject" sisi WO **bukan** tombol kedua — ia refleksi keputusan validasi laporan.
Tombol eksplisit yang ada hanya **Close** dan (opsional) **Reopen**.

---

## 5. RBAC per transisi (selaras modul GI)
| Transisi | PETUGAS | ADMIN RTUPP1 | MASTER | MANAGER |
|---|---|---|---|---|
| Create WO | ✗ | ✔ | ✔ | ✗ |
| Start (OPEN→IN_PROGRESS) | ✔ (assignee) | ✔ | ✔ | ✗ |
| Isi & Submit laporan | ✔ (assignee) | ✗ | ✗ | ✗ |
| Approve/Reject (via validasi laporan) | ✗ | ✔ | ✔ | ✗ |
| Close / Reopen | ✗ | ✔ | ✔ | ✗ |
| Lihat | ✔ (miliknya) | ✔ (RTUPP) | ✔ (global) | ✔ (read-only) |

---

## 6. Edge cases & aturan
- **WO tanpa laporan** lalu di-close: hanya boleh dari APPROVED; WO OPEN/IN_PROGRESS tidak bisa langsung CLOSE (cegah penutupan kosong) — atau sediakan "Cancel" terpisah (fase lanjut).
- **Laporan legacy tanpa WO** (`workOrderId=null`): tetap valid; alur lama jalan selama transisi (G-9).
- **Reject berulang**: REJECTED→IN_PROGRESS→SUBMITTED→… (loop didukung; sama dengan loop laporan).
- **Type mismatch**: WO PREVENTIVE hanya boleh menghasilkan Inspeksi; CORRECTIVE hanya HAR (validasi di service).
- **Overdue**: `dueDate < today` & status belum CLOSED → tandai "Terlambat" di list/dashboard (turunan, tanpa kolom baru).

---

## 7. Diagram ringkas (gabungan)
```
                 ┌──────────── ADMIN ────────────┐
                 │ create WO        close/reopen  │
                 ▼                                ▼
   OPEN ─start→ IN_PROGRESS ─submit→ SUBMITTED ─validate→ APPROVED ─close→ CLOSED
     ▲              ▲                     │  reject                         │
     │              └────── REJECTED ◀────┘                                 │
     └───────────────────────── reopen ◀──────────────────────────────────┘
                 (PREVENTIVE→Inspeksi GI | CORRECTIVE→HAR GI, prefilled dari WO)
```
