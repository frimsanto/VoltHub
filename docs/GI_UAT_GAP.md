# GI UAT GAP — Review kesiapan workflow GI RTUPP1

> Hasil review menyeluruh alur GI (PETUGAS → Inspeksi/HAR → Compare → RC → Approval → Dashboard)
> menjelang UAT. Mencari: dead button, empty state buruk, data tidak muncul, error handling buruk,
> approval membingungkan, field tak dipakai, data tak pernah tampil.
>
> Prioritas: **CRITICAL** (blok UAT) · **HIGH** (UX penting/loop approval) · **MEDIUM** (akurasi/kejelasan) · **LOW** (kosmetik).
> Status happy-path: **siap UAT**. Gap di bawah adalah penghalus & tindak lanjut.

---

## Sudah diperbaiki pada sprint ini (untuk konteks)
- **Output bisnis di detail** (P1): kartu **Ringkasan**, **Daftar Temuan** (turunan kesimpulan/compare/RC),
  dan **Riwayat Approval** (timeline Dibuat→Dikirim→Divalidasi/Ditolak) — di Inspeksi GI & HAR GI.
- **Dashboard operasional** (P2): band 7 pertanyaan ADMIN (GI Diperiksa, Pending, Approved, Rejected,
  RC Berhasil, RC Gagal, Temuan Aktif) — semua dari endpoint `/gi/dashboard` yang sudah ada.

---

## CRITICAL
**C-1 · Prasyarat konfigurasi RTUPP1 (verifikasi sebelum UAT).**
Menu & akses GI hanya muncul bila `isRtupp1User()` benar — yaitu kode/nama unit RTUPP user
**`RTUPP1`** atau mengandung **`GIS`** ([FE/src/lib/v2/rtupp.ts](../FE/src/lib/v2/rtupp.ts)).
Bila data master unit RTUPP1 dinamai lain, **seluruh menu GI tak tampil** → UAT terblok.
*Bukan bug kode; precondition data.* **Aksi:** pastikan unit RTUPP1 di DB produksi cocok sebelum UAT.

> Tidak ada CRITICAL berupa bug kode pada happy-path setelah perbaikan sprint ini.

---

## HIGH
**H-1 · PETUGAS belum bisa meng-Edit laporan GI dari UI (loop reject→perbaiki→kirim ulang).**
Backend mendukung `PUT /gi/inspeksi/:id` & `/gi/har/:id` (owner-only, selama belum VALIDATED),
tetapi FE **tidak punya entry edit**: daftar hanya View, detail REJECTED hanya menampilkan
"Kirim untuk Validasi" (resubmit **tanpa** bisa memperbaiki data). Form sudah mendukung mode
`initial` — tinggal di-wire. **Dampak:** laporan ditolak hanya bisa dikirim ulang apa adanya.
**Rekomendasi:** tambah tombol **Edit** (owner + status DRAFT/REJECTED) → buka form ber-`initial`
→ `update`. Tanpa schema/endpoint baru.

**H-2 · Belum ada export PDF/Excel laporan GI.** Output saat ini web-only (Report Generator V2
belum mencakup entitas GI). **Dampak:** bila UAT menuntut dokumen cetak/arsip per laporan.
**Rekomendasi:** sprint lanjutan — hook entitas GI ke Report Generator yang ada.

---

## MEDIUM
**M-1 · `scadaRtuName`/`scadaBay` tidak dipersist → risiko reset compare saat update.**
Keduanya transien (tidak ada kolom). Bila H-1 di-implementasi dan petugas menyimpan ulang tanpa
memilih ulang RTU/penyulang, `update` menghitung master dari input saja → `comparisonResult`/`rcSuccess`
bisa kembali **BELUM_DIBANDING**. **Rekomendasi:** saat update, bila `scadaRtuName` kosong, pertahankan
hasil compare lama (jangan timpa); atau persist pilihan RTU/bay.

**M-2 · "DI MASTER" untuk ES/RACK/MSF/PSF/CSF tidak tampil di halaman detail.**
Compare engine sudah memperhitungkannya (rollup), tetapi hanya `pmt/lr/mpuf DI MASTER` yang
dipromosikan ke kolom → kartu "Pembanding Master" di detail hanya menampilkan tiga itu. Nilai
lapangan ES/RACK/dst tetap tampak di seksi Kubikel. **Dampak:** transparansi per-titik master terbatas.
**Rekomendasi:** tampilkan nilai master 5 titik tsb (mis. dari snapshot via `scadaSnapshotId`) bila perlu.

**M-3 · Akurasi Compare/RC & "Temuan Aktif" bergantung snapshot SCADA ter-import.**
Tanpa import (Scenario 0), `comparisonResult=BELUM_DIBANDING` dan temuan under-count.
**Rekomendasi:** jadikan import SCADA langkah wajib di runbook UAT (sudah di GI_UAT_SCRIPT Scenario 0);
opsional: banner peringatan di form bila RTU belum punya snapshot.

**M-4 · Dashboard GI: loading & error handling minim.** Saat memuat hanya teks "Memuat…" (tanpa
skeleton); kegagalan `useGiDashboard`/leaderboard tidak menampilkan pesan/retry.
**Rekomendasi:** tambah state error + tombol retry (pola DataTable sudah ada di app).

---

## LOW
**L-1 · "GI Diperiksa" menghitung lokasi unik termasuk DRAFT.** Bisa sedikit lebih besar dari
"sudah diperiksa & dikirim". **Rekomendasi:** bila perlu, batasi ke status ≥ SUBMITTED.

**L-2 · Riwayat Approval menampilkan `validatedBy` sebagai userId mentah,** bukan nama validator
(BE tidak men-join nama). **Rekomendasi:** join nama user validator bila ingin lebih ramah.

**L-3 · Daftar Inspeksi/HAR GI belum punya filter Status** (hanya search + rentang tanggal) →
ADMIN harus memindai untuk menemukan SUBMITTED. **Rekomendasi:** tambah FilterSelect status.

**L-4 · Empty state "Pembanding Master" di detail** menampilkan "—" tanpa petunjuk (form punya
hint "impor di menu SCADA", detail tidak). **Rekomendasi:** tambah hint kecil bila belum dibanding.

**L-5 · Tidak ada konfirmasi pada aksi Tolak.** Reject langsung mengeksekusi; catatan validasi
opsional di UI. **Rekomendasi:** wajibkan catatan saat menolak + dialog konfirmasi.

---

## Tabel ringkas
| ID | Prioritas | Area | Inti masalah |
|---|---|---|---|
| C-1 | CRITICAL | Config | Nama unit RTUPP1 harus cocok agar menu GI tampil |
| H-1 | HIGH | Approval loop | PETUGAS tak bisa Edit laporan dari UI |
| H-2 | HIGH | Output | Belum ada export PDF/Excel GI |
| M-1 | MEDIUM | Compare | Update bisa reset hasil compare (RTU/bay transien) |
| M-2 | MEDIUM | Detail | "DI MASTER" 5 titik (ES/RACK/MSF/PSF/CSF) tak tampil |
| M-3 | MEDIUM | Data | Compare/temuan butuh snapshot SCADA |
| M-4 | MEDIUM | Dashboard | Loading/error handling minim |
| L-1..L-5 | LOW | UX | over-count GI, nama validator, filter status, hint, konfirmasi tolak |

---

## Checklist siap UAT
- [x] Import SCADA UI tersedia (ADMIN/MASTER RTUPP1).
- [x] Form Inspeksi GI & HAR GI: header + RTU + Penyulang/Bay + seksi perangkat + panel RC.
- [x] SCADA Compare per-penyulang (PMT, LR, ES, RACK, MSF, PSF, CSF).
- [x] RC Evaluation per bay (`LR=REMOTE && ES=OPEN`).
- [x] Workflow: DRAFT → SUBMITTED → VALIDATED/REJECTED + owner-check.
- [x] Output detail: Ringkasan + Daftar Temuan + Riwayat Approval (Inspeksi & HAR).
- [x] Dashboard operasional menjawab 7 pertanyaan ADMIN.
- [x] BE compare tests hijau; BE typecheck bersih; FE build sukses.
- [ ] **C-1**: verifikasi nama unit RTUPP1 di DB produksi (precondition).
- [ ] **H-1**: (disarankan) tombol Edit untuk laporan DRAFT/REJECTED — sprint lanjutan.
- [ ] **H-2**: (opsional) export PDF/Excel GI — sprint lanjutan.
