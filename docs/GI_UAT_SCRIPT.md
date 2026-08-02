# GI UAT SCRIPT — Skenario Uji Terima Workflow GI RTUPP1

> Audiens: penguji UAT (business owner + tim RTUPP1). Tujuan: membuktikan alur lengkap
> **PETUGAS → Inspeksi/HAR GI → SCADA Compare → RC → Submit → ADMIN Validasi → Output → Dashboard**
> berjalan dengan data nyata, tanpa perlu penjelasan teknis.
>
> Semua endpoint/halaman di sini **sudah ada**. Tidak ada fitur baru yang dibuat untuk skrip ini.

## Prasyarat (setup sekali sebelum UAT)
1. **Akun uji** (RTUPP1 = unit GIS):
   - PETUGAS RTUPP1 (mengisi laporan).
   - ADMIN RTUPP1 (validasi + import SCADA).
   - (opsional) MASTER (lihat dashboard global + leaderboard).
   - Pastikan unit RTUPP akun bernama/berkode `RTUPP1` atau mengandung `GIS` agar menu GI muncul.
2. **Master GI & Penyulang** sudah ada (seed `prisma/seed-gi-rtupp1.ts` atau import) — dropdown Lokasi GI & Penyulang terisi.
3. **File SCADA** tersedia: `catatan/csd_IFS-IFS_RTU_Data.xlsx` (export IFS RTU).
4. Backend & frontend berjalan; login masing-masing peran di tab/sesi berbeda.

> Cara baca tiap skenario: **Langkah → Data → Hasil diharapkan → Kriteria lulus (PASS/FAIL)**.

---

## Scenario 0 — Import data SCADA (prasyarat compare)
**Peran:** ADMIN RTUPP1 (atau MASTER).

- **Langkah:**
  1. Login ADMIN RTUPP1 → menu **Operasional Lapangan → Import SCADA GI** (`/scada-import`).
  2. Klik **Upload IFS RTU** → pilih `csd_IFS-IFS_RTU_Data.xlsx`.
- **Data:** file IFS RTU (kolom B1=RTU, B3=penyulang/bay, Element CB/LR/ES/RACK/MSF/PSF/CSF).
- **Hasil diharapkan:** toast "Snapshot tersimpan: <RTU> (N titik)"; baris baru di tabel **Riwayat Snapshot** (RTU, gardu/bay utama, file, jumlah titik, waktu impor).
- **Kriteria lulus:** snapshot muncul dengan jumlah titik > 0; RTU tersebut nanti tampil di dropdown "RTU SCADA" pada form GI.

---

## Scenario 1 — PETUGAS melakukan Inspeksi GI (preventif)
**Peran:** PETUGAS RTUPP1.

- **Langkah:**
  1. Login PETUGAS → **Pelaporan Lapangan → Inspeksi GI** → **Buat Inspeksi GI**.
  2. Isi header: Lokasi GI, Penyulang, Tanggal, Pelaksana.
  3. Pilih **RTU SCADA** → lalu **Penyulang/Bay SCADA** (dropdown terisi dari snapshot).
  4. Buka tab **Kubikel (Relay→IED)** → isi Status PMT, Status L/R, Relay Aux ES/RACK/MSF/PSF/CSF; kolom "DI MASTER" terisi otomatis (read-only).
  5. Isi minimal beberapa seksi perangkat + Kesimpulan tiap seksi.
  6. Klik **Simpan Draft** lalu **Simpan & Kirim**.
- **Data:** master GI/Penyulang + snapshot SCADA dari Scenario 0.
- **Hasil diharapkan:** panel **Berhasil RC** muncul (badge LR/ES/RACK/MSF/PSF/CSF + penyulang); laporan tersimpan; setelah kirim, status **SUBMITTED**; diarahkan ke halaman detail.
- **Kriteria lulus:** laporan muncul di daftar Inspeksi GI milik petugas dengan status SUBMITTED; kolom "DI MASTER" terisi sesuai snapshot.

---

## Scenario 2 — PETUGAS melakukan HAR GI (korektif)
**Peran:** PETUGAS RTUPP1.

- **Langkah:**
  1. **Pelaporan Lapangan → HAR GI** → **Buat HAR GI**.
  2. Isi header: Gardu Induk, Penyulang, Tanggal, Pelaksana, Pengawas, Keterangan Kunjungan.
  3. Pilih **RTU SCADA** + **Penyulang/Bay SCADA**.
  4. Isi Detail Pekerjaan Korektif: Test, Penyebab Gangguan, Analisa, Langkah, Hasil, Status Gardu Sebelum/Sesudah, **Status Pekerjaan** (SELESAI/PARSIAL/GAGAL).
  5. Isi seksi kondisi perangkat seperlunya → **Simpan & Kirim**.
- **Data:** snapshot SCADA + entri korektif.
- **Hasil diharapkan:** panel **Berhasil RC** mencerminkan penyulang terpilih; status **SUBMITTED**.
- **Kriteria lulus:** laporan HAR muncul di daftar milik petugas, status SUBMITTED, badge RC sesuai snapshot.

---

## Scenario 3 — SCADA Compare (lapangan vs master)
**Peran:** PETUGAS (saat isi) / ADMIN (saat review).

- **Langkah:**
  1. Pada form Inspeksi GI, isi **Status PMT** & **Status L/R** lapangan **berbeda** dari nilai "DI MASTER".
  2. Simpan & buka **detail** laporan → lihat kartu **Pembanding Master SCADA** + badge **Hasil Compare**.
- **Data:** nilai lapangan vs nilai master snapshot.
- **Hasil diharapkan:** bila ada beda → **TIDAK_SESUAI**; bila sama → **SESUAI**; bila belum ada snapshot → **BELUM_DIBANDING**. Compare mencakup PMT, L/R, ES, RACK, MSF, PSF, CSF.
- **Kriteria lulus:** badge Hasil Compare berubah sesuai input; bila TIDAK_SESUAI, muncul di **Daftar Temuan**.

---

## Scenario 4 — RC Evaluation per penyulang/bay
**Peran:** PETUGAS / ADMIN.

- **Langkah:**
  1. Pada form (Inspeksi atau HAR), pilih RTU lalu **ganti Penyulang/Bay SCADA** ke penyulang yang `LR=REMOTE & ES=OPEN`.
  2. Amati panel **Berhasil RC** → harus **BERHASIL RC**.
  3. Ganti ke penyulang dengan `LR=LOCAL` atau `ES=CLOSE` → panel berubah **BELUM BERHASIL RC** + alasan.
- **Data:** titik SCADA per-bay dari snapshot.
- **Hasil diharapkan:** status RC mengikuti penyulang terpilih (bukan seluruh RTU); aturan tetap `LR=REMOTE && ES=OPEN`.
- **Kriteria lulus:** dua penyulang berbeda menghasilkan status RC berbeda; alasan gagal jelas (mis. "Earth Switch masih CLOSE").

---

## Scenario 5 — Approval oleh ADMIN RTUPP1
**Peran:** ADMIN RTUPP1.

- **Langkah:**
  1. Login ADMIN → **Operasional Lapangan → Inspeksi GI / HAR GI** → buka laporan **SUBMITTED**.
  2. Tinjau **Ringkasan**, **Pembanding Master**, **Daftar Temuan**.
  3. Isi **Catatan Validasi** → klik **Validasi** (ACC) atau **Tolak** (Reject).
- **Data:** laporan SUBMITTED dari Scenario 1/2.
- **Hasil diharapkan:** status → **VALIDATED** atau **REJECTED**; **Riwayat Approval** menampilkan langkah Dibuat → Dikirim → Divalidasi/Ditolak + waktu + catatan. ADMIN tidak punya tombol "Buat" (hanya validasi).
- **Kriteria lulus:** status berubah; petugas melihat keputusan + catatan di detail laporannya; ADMIN hanya melihat laporan dalam RTUPP-nya.

---

## Scenario 6 — Review Dashboard Operasional
**Peran:** ADMIN RTUPP1 (per-RTUPP) / MASTER (global).

- **Langkah:**
  1. Login ADMIN → **Dashboard → (Operasional Lapangan) Dashboard GI** (`/gi-dashboard`).
  2. Baca band metrik atas (7 pertanyaan operasional).
  3. Periksa tabel **Kinerja per Tim** & **Laporan Terbaru**. (MASTER: + **Petugas Terbaik**.)
- **Data:** agregasi laporan GI hasil Scenario 1–5.
- **Hasil diharapkan:** band menjawab langsung: **GI Diperiksa, Pending Approval, Approved, Rejected, RC Berhasil, RC Gagal, Temuan Aktif**; angka konsisten dengan tindakan di skenario sebelumnya.
- **Kriteria lulus:**
  - "Pending Approval" turun setelah ADMIN memvalidasi (Scenario 5).
  - "Approved"/"Rejected" naik sesuai keputusan.
  - "RC Berhasil/Gagal" konsisten dengan Scenario 4.
  - "Temuan Aktif" mencerminkan laporan TIDAK_SESUAI / RC gagal / pekerjaan GAGAL/PARSIAL yang belum ditolak.

---

## Ringkasan kriteria lulus UAT (semua harus PASS)
| # | Skenario | Kriteria inti |
|---|---|---|
| 0 | Import SCADA | snapshot tersimpan, RTU/penyulang tersedia di form |
| 1 | Inspeksi GI | submit OK, "DI MASTER" auto-fill |
| 2 | HAR GI | submit OK, badge RC sesuai penyulang |
| 3 | Compare | SESUAI/TIDAK_SESUAI/BELUM_DIBANDING benar |
| 4 | RC per bay | dua penyulang → status RC berbeda |
| 5 | Approval | status berubah + riwayat approval tampil |
| 6 | Dashboard | 7 pertanyaan ADMIN terjawab & konsisten |

> Catatan: jika ada langkah gagal, catat nomor skenario + perilaku aktual, lalu rujuk **docs/GI_UAT_GAP.md** untuk klasifikasi & rencana perbaikan.
