# WORK ORDER — Gap Analysis (Current vs Target)

> Membandingkan **alur saat ini** (petugas membuat form langsung) dengan **alur target**
> (Work Order sebagai entry point). Berbasis kode nyata: modul `tickets`, `inspeksi-gi`,
> `har-gi`, `scada-gi`, `gi-dashboard`, dan schema Prisma. Desain-only; tidak ada perubahan kode.

---

## 1. Current Workflow (apa adanya)

```
PETUGAS
  └─ buka menu "Inspeksi GI" / "HAR GI"
        └─ klik "Buat"  ← entry point = FORM (langsung)
              └─ isi form (Lokasi GI, Penyulang, RTU/Bay, seksi perangkat)
                    └─ SCADA Compare + RC (otomatis)
                          └─ Submit (DRAFT→SUBMITTED)
ADMIN RTUPP1
  └─ Validasi (SUBMITTED→VALIDATED/REJECTED)
```

**Karakteristik:**
- Entry point = **form**, bukan penugasan. Petugas menentukan sendiri apa yang dikerjakan.
- Tidak ada konsep **PREVENTIVE vs CORRECTIVE** sebagai entitas — hanya tersirat (Inspeksi=preventif, HAR=korektif).
- Tidak ada **penugasan/assignment**, **due date**, **tim**, atau **penutupan (close)** siklus kerja.
- `tickets` (dilabeli "Work Order" di nav) **ada tapi terputus** dari GI: tidak punya `type`, tidak terhubung ke Inspeksi/HAR, tidak dipakai sebagai entry.

## 2. Target Workflow (diinginkan)

```
ADMIN RTUPP1 ── terbitkan WO (type, lokasi, penyulang, assignee, due) ──▶ OPEN
PETUGAS ── terima WO ── mulai ──▶ IN_PROGRESS
   ├─ PREVENTIVE → Inspeksi GI (prefilled dari WO) → Compare → RC → Submit
   └─ CORRECTIVE → HAR GI (prefilled) → Perbaikan → RC Test → Submit
                                                          └─▶ WO SUBMITTED
ADMIN ── Approve (laporan VALIDATED) ──▶ WO APPROVED ── Close ──▶ CLOSED
      └─ Reject ──▶ WO REJECTED ── petugas perbaiki ──▶ IN_PROGRESS
```

---

## 3. Gap matrix

| # | Kebutuhan target | Current | Gap | Prioritas |
|---|---|---|---|---|
| **G-1** | Entitas Work Order sebagai entry point | `tickets` ada tapi generic & terputus | Perlu type + link laporan + dipakai sebagai entry | **CRITICAL** |
| **G-2** | Tipe PREVENTIVE / CORRECTIVE | tidak ada kolom `type` di `tickets` | Tambah enum + kolom (additive) | **HIGH** |
| **G-3** | Status WO OPEN→…→CLOSED | `TicketStatus` = OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED | Tambah additive SUBMITTED/APPROVED/REJECTED | **HIGH** |
| **G-4** | Link WO ↔ Inspeksi/HAR | tak ada FK | Tambah `workOrderId` nullable di `InspeksiGiReport`/`HarGiReport` | **CRITICAL** |
| **G-5** | Penugasan ke tim + due date | `assignedTo` ada; `teamId`/`dueDate` tidak | Tambah `teamId`, `dueDate`, `completedAt` (additive) | **MEDIUM** |
| **G-6** | Dropdown WO dari data GI/aset/penyulang yang benar | lookups sudah ada (`useLocationOptions/useFeederOptions/useAssetOptions`) | Reuse di form WO; verifikasi penyulang GI ter-seed | **MEDIUM** |
| **G-7** | Form GI dibuka **dari** WO dengan prefill | form GI berdiri sendiri (mode create) | Tambah mode "dari WO" (prefill `workOrderId`, lokasi, penyulang) | **HIGH** |
| **G-8** | WO mengikuti hasil approval laporan | approval di laporan; WO tak tahu | Sinkronkan status WO saat submit/validate laporan | **HIGH** |
| **G-9** | Petugas tak lagi buat laporan langsung | tombol "Buat" bebas untuk PETUGAS | Sembunyikan entry mandiri (bertahap) | **MEDIUM** |
| **G-10** | Dashboard status WO (open/overdue/closed) | dashboard GI hanya metrik laporan | Tambah ringkasan WO (reuse pola dashboard) | **MEDIUM** |
| **G-11** | Audit transisi WO | `audit_logs` ada | Catat transisi WO via service | **LOW** |
| **G-12** | Reopen WO | tak ada | Aksi REOPEN (CLOSED→IN_PROGRESS) | **LOW** |

---

## 4. Apa yang SUDAH bisa di-reuse (tidak perlu dibangun ulang)
- **Tabel kerja:** `tickets` (+ relasi `location`, `assignee`) — fondasi WO.
- **Tenant scoping:** `Location.rtuppId` + `viaLocationScopeWhere` — pola identik dipakai GI.
- **Form & logika GI:** `InspeksiGiForm`, `HarGiForm`, SCADA Compare, RC, panel Berhasil RC — utuh.
- **Approval:** validate/reject Inspeksi/HAR + Riwayat Approval — utuh.
- **Lookups dropdown:** location/feeder/asset/user/team — utuh (arahan: WO pakai ini).
- **Audit:** `audit_logs` + `recordAuditLog`.
- **Idempotency, offline queue, nav/RBAC** — pola sudah ada.

## 5. Apa yang TIDAK boleh berubah
- Logika Inspeksi GI / HAR GI / SCADA Compare / RC Evaluation (sudah UAT-ready).
- `GiReportStatus` dan alur validate/reject laporan.
- Modul AI / WhatsApp / GH / MP.

## 6. Risiko & mitigasi
| Risiko | Mitigasi |
|---|---|
| Memuat `tickets` generic dengan logika GI → membingungkan GH/MP nanti | `type`+nullable link; WO GI = subset; GH/MP ikut pola yang sama nanti |
| Laporan GI legacy tanpa WO | `workOrderId` **nullable** → backward compatible selama transisi |
| Double approval (WO vs laporan) | WO **tidak** punya mesin approval sendiri; hanya mencerminkan keputusan laporan |
| Penyulang dropdown kosong | verifikasi seed penyulang GI (G-6); bukan blocker desain |

## 7. Keputusan yang menunggu (lihat PRD §10)
- Extend `tickets` (rekomendasi) vs tabel `work_orders` baru → **ERD §2**.
- 1 WO = 1 laporan (rekomendasi) vs banyak.
- Hapus total entry mandiri vs hanya untuk PETUGAS.
