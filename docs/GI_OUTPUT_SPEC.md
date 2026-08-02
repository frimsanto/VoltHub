# GI OUTPUT SPEC — Output bisnis alur GI RTUPP1

> Sprint: VOLTHUB GI UAT PREPARATION. Dokumen ini mendefinisikan **output bisnis nyata**
> yang dihasilkan setelah PETUGAS RTUPP1 submit, untuk tiga audiens: **PETUGAS**,
> **ADMIN RTUPP1**, **MASTER**. Semua field di sini **benar-benar tersedia di sistem**
> (BE/src/modules/{inspeksi-gi,har-gi,scada-gi,gi-dashboard} + Prisma). Tidak ada output fiktif.
>
> Aturan emas: jika sebuah angka/atribut tidak punya sumber data di tabel/endpoint yang
> ada, ia **tidak** dicantumkan sebagai output. Catatan keterbatasan ada di tiap bagian.

## Alur & status
`PETUGAS isi → Submit → ADMIN validasi → Output`

`GiReportStatus`: **DRAFT → SUBMITTED → VALIDATED | REJECTED** (REJECTED dapat diperbaiki & dikirim ulang).

Sumber data output:
- `inspeksi_gi_reports` (Inspeksi GI — preventif)
- `har_gi_reports` (HAR GI — korektif)
- `scada_rtu_snapshots` + `scada_rtu_points` (master SCADA → "DI MASTER" + Berhasil RC)
- Endpoint baca: `GET /gi/inspeksi`, `/gi/inspeksi/:id`, `/gi/har`, `/gi/har/:id`,
  `/gi/scada/points?rtu=&bay=`, `/gi/dashboard`, `/gi/dashboard/leaderboard`.

---

## 1. Output PETUGAS (tim lapangan RTUPP1)

**Audiens:** petugas yang mengisi. **Scope:** hanya laporan miliknya sendiri (`inspectorId = userId`).
**Endpoint:** `GET /gi/inspeksi`, `/gi/har` (auto-filter milik sendiri), detail `/:id`.

### 1a. Laporan Inspeksi GI (preventif)
Output per laporan (kolom & JSON yang tersimpan):
- **Header:** Lokasi GI (`location.name`), Penyulang (`feeder.feederName`), Tanggal (`reportDate`), Pelaksana (`pelaksana`), Status.
- **8 seksi perangkat** (JSON): Rectifier, Baterai, Serial Device, RTU Concentrator, RTU IED,
  **Kubikel**, Relay Proteksi, Media — tiap seksi: field teknis + `keterangan` + `kesimpulan`
  (BAIK / PERLU_PENGECEKAN / RUSAK / TIDAK_ADA).
- **Hasil Compare SCADA** (kolom promosi + rollup): `pmtKubikel` vs `pmtDiMaster`,
  `lrKubikel` vs `lrDiMaster`, `mpufDiMaster`, plus pembanding **ES / RACK / MSF / PSF / CSF**
  (lapangan dari relay-aux Kubikel vs master SCADA) → `comparisonResult`
  (**BELUM_DIBANDING / SESUAI / TIDAK_SESUAI**).
- **Status RC** (panel "Berhasil RC" di form): dari snapshot SCADA per-penyulang —
  `BERHASIL RC` bila `LR=REMOTE && ES=OPEN`, plus alasan bila gagal.
- **Ringkasan approval:** Status, `submittedAt`, `validatedAt`, `validationNote` (alasan ACC/Reject dari ADMIN).

### 1b. Laporan HAR GI (korektif)
- **Header:** Gardu Induk, Penyulang, Tanggal, Pelaksana, Pengawas, Keterangan Kunjungan, Status.
- **Detail korektif:** `test`, `penyebabGangguan`, `analisaPenyebab`, `langkahPekerjaan`,
  `hasilPekerjaan`, `statusGarduSebelum` → `statusGarduSesudah`, `statusPekerjaan`
  (SELESAI / PARSIAL / GAGAL).
- **Seksi kondisi perangkat** (JSON): RTU IED, Relay, RTU Concentrator, Rectifier, Baterai, Media, CCTV, Switch PoE.
- **Status RC:** `rcSuccess` (Boolean) + `comparisonResult` dari snapshot SCADA per-penyulang.
- **Ringkasan approval:** sama seperti Inspeksi.

### 1c. Daftar Temuan (PETUGAS)
Diturunkan dari data yang ada (bukan tabel terpisah):
- Seksi Inspeksi dengan `kesimpulan ∈ {PERLU_PENGECEKAN, RUSAK}` → daftar perangkat bermasalah.
- `comparisonResult = TIDAK_SESUAI` → titik yang menyimpang dari master (lapangan ≠ SCADA).
- RC gagal → `berhasilRc.reasons` (mis. "Mode L/R bukan REMOTE", "Earth Switch masih CLOSE").

---

## 2. Output ADMIN RTUPP1

**Audiens:** ADMIN unit RTUPP1 (validator). **Scope:** **seluruh** laporan GI dalam RTUPP-nya
(`viaLocationScopeWhere` per `Location.rtuppId`) — bukan hanya miliknya. **Tidak mengisi** laporan.
**Endpoint:** `GET /gi/inspeksi`, `/gi/har` (semua di RTUPP), `POST /gi/inspeksi/:id/validate`, `/gi/har/:id/validate`, `GET /gi/dashboard` (discope RTUPP).

### 2a. Antrian Validasi (Ringkasan Approval)
- Daftar laporan `SUBMITTED` menunggu ACC/Reject — `pendingValidation` = `inspeksi.SUBMITTED + har.SUBMITTED`.
- Aksi: **VALIDATED** atau **REJECTED** + `validationNote` (alasan, tersimpan & terlihat petugas).
- Tiap keputusan menstempel `validatedAt` + `validatedBy` (userId ADMIN).

### 2b. Dashboard GI RTUPP1 (`GET /gi/dashboard`, discope RTUPP)
Angka nyata dari agregasi laporan RTUPP:
- **Count per status** Inspeksi & HAR (DRAFT/SUBMITTED/VALIDATED/REJECTED + total).
- **% Berhasil RC** = HAR `rcSuccess=true` ÷ HAR yang sudah dinilai (`rcSuccess != null`).
- **% Sesuai master** = Inspeksi `comparisonResult=SESUAI` ÷ Inspeksi yang sudah dibanding.
- **Breakdown per Tim** (dari `inspector.team`): jumlah inspeksi/har, validated, rcSuccess, total.
- **Recent** (8 terbaru, gabungan inspeksi+har): gardu, petugas, tim, status, tanggal.

### 2c. Hasil Compare SCADA (review ADMIN)
Saat membuka detail laporan, ADMIN melihat hasil compare yang sudah dihitung saat submit
(`pmt/lr/es/rack/msf/psf/csf` lapangan vs master, `comparisonResult`, snapshot yang dipakai) —
dasar objektif untuk ACC/Reject.

---

## 3. Output MASTER

**Audiens:** MASTER (pemilik sistem, lintas-RTUPP). **Scope:** global.
**Endpoint:** `GET /gi/dashboard` (global), `GET /gi/dashboard/leaderboard`.

### 3a. Dashboard GI Global
Sama struktur seksi 2b, tetapi **lintas seluruh RTUPP** (`scope.global`) — total status,
%Berhasil RC, %Sesuai master, breakdown per Tim, recent — agregat nasional GI.

### 3b. Leaderboard Petugas Terbaik (`/gi/dashboard/leaderboard`)
Peringkat petugas lintas-RTUPP berdasarkan data nyata:
- `validated` (laporan tervalidasi terbanyak) → `rcSuccessRate` (%Berhasil RC) → `total`.
- Atribut: `petugasName`, `rtuppName`, `teamName`, `total`, `validated`, `rcSuccessRate`.

### 3c. Output validasi/audit MASTER
MASTER dapat memvalidasi laporan RTUPP mana pun (RBAC `ADMIN_ROLES` mencakup MASTER); jejak
`validatedBy/validatedAt/validationNote` tersimpan per laporan.

---

## Matriks Output × Audiens (yang benar-benar ada)

| Output | PETUGAS | ADMIN RTUPP1 | MASTER |
|---|---|---|---|
| Laporan Inspeksi GI | milik sendiri | semua di RTUPP | global |
| Laporan HAR GI | milik sendiri | semua di RTUPP | global |
| Hasil Compare SCADA (per-penyulang) | ✔ (form + detail) | ✔ (review) | ✔ |
| Status RC (Berhasil/Gagal + alasan) | ✔ | ✔ | ✔ |
| Daftar Temuan (kesimpulan/TIDAK_SESUAI/RC reasons) | ✔ | ✔ (agregat) | ✔ (agregat) |
| Ringkasan Approval (status, note, validator) | ✔ (lihat keputusan) | ✔ (buat keputusan) | ✔ |
| Dashboard GI | — (lihat Dashboard Lapangan) | per-RTUPP | global + leaderboard |

## Keterbatasan jujur (tidak dijanjikan sebagai output sprint ini)
- **Belum ada export PDF/Excel** khusus laporan GI (Report Generator V2 belum mencakup entitas GI).
  Output saat ini = tampilan web + data API, bukan dokumen unduhan. (Audit P3.)
- "Daftar Temuan" adalah **turunan** dari field yang ada (kesimpulan, comparisonResult, RC reasons),
  bukan entitas/tabel tersendiri.
- Jejak audit transisi memakai kolom `validatedBy/At/Note`, bukan `audit_logs` penuh.
- Akurasi Compare/RC bergantung pada **adanya snapshot SCADA** (lihat Import SCADA GI) dan pemilihan
  **penyulang/bay** yang benar di form.
