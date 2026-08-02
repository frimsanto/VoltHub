# VoltHub — UAT Test Plan (Test Cases)

> **Tujuan:** Skenario UAT formal yang mencakup seluruh alur bisnis kritis VoltHub (evolusi VoltReport).
> **Sifat:** Dokumen ini melengkapi [UAT_PLAN.md](./UAT_PLAN.md) (strategi & exit criteria) dan [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) (centang cepat per role) dengan **test case detail**: setiap kasus punya Test ID, Objective, Preconditions, Steps, Expected Result, dan kolom Pass/Fail.
> **Lingkungan:** Jalankan di **STAGING**, bukan produksi. Data uji: [SEED_DATA_PLAN.md](./SEED_DATA_PLAN.md). Backend V2 = FROZEN (cacat dicatat sebagai defect, bukan diperbaiki ad-hoc).
> **Disusun:** 2026-06-09

---

## 1. Konvensi

**Format Test ID:** `UAT-<AREA>-<NN>` — `<AREA>` = kode modul (di bawah), `<NN>` = nomor urut.

| # | Area | Kode | # | Area | Kode |
|---|------|------|---|------|------|
| 1 | Authentication | `AUTH` | 7 | Documents | `DOC` |
| 2 | User Management | `USR` | 8 | Import | `IMP` |
| 3 | Team Management | `TEAM` | 9 | Dashboard | `DASH` |
| 4 | Laporan Awal | `LA` | 10 | Notifications | `NOTIF` |
| 5 | Laporan Akhir | `LK` | 11 | Offline Sync | `SYNC` |
| 6 | Rekap | `RKP` | 12 | Executive Portal | `EXEC` |

**Jenis alur (path):** 🟢 **Happy** · 🔴 **Failure** · 🔒 **Permission/RBAC**.

**Role kanonik (3):** `SUPERADMIN` > `ADMIN` > `PETUGAS`. `ADMIN_RTUPP` diperlakukan sebagai tier ADMIN (lihat KI-01 di [UAT_PLAN.md](./UAT_PLAN.md)). Backend adalah enforcer; UI hanya menyembunyikan aksi.

**Akun uji (SEED_DATA_PLAN §2.1):**

| Role | Email | Dipakai untuk |
|------|-------|---------------|
| SUPERADMIN | `super.uat@pln.co.id` | Administration, semua akses, semua RTUPP |
| ADMIN | `admin.uat@pln.co.id` | Validasi, master/operations dalam RTUPP sendiri |
| ADMIN (RTUPP lain) | `admin2.uat@pln.co.id` | Uji isolasi cross-RTUPP |
| PETUGAS | `petugas.uat@pln.co.id` | Laporan Awal/Akhir, offline, foto, GPS |

**Cara mengisi Pass/Fail:** tulis `PASS` / `FAIL` + tanggal + inisial penguji. Jika FAIL, catat ID defect.

---

## 2. Authentication (`AUTH`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-AUTH-01 | 🟢 | Login valid berhasil & landing sesuai role | Akun aktif tiap role tersedia | 1. Buka halaman login. 2. Masukkan email & password benar. 3. Submit. | Berhasil masuk; redirect ke landing sesuai role (PETUGAS→reporting, ADMIN/SUPERADMIN→dashboard); token tersimpan. | |
| UAT-AUTH-02 | 🔴 | Kredensial salah ditolak | — | 1. Masukkan email benar + password salah. 2. Submit. | Gagal login; pesan generik "email atau password salah"; tidak membocorkan apakah email terdaftar. | |
| UAT-AUTH-03 | 🔴 | Lockout setelah 5× gagal | Akun valid | 1. Salah password 5× berturut. 2. Coba lagi (ke-6). | Akun terkunci ±15 menit; respons `429`; pesan menyebut percobaan terlalu banyak. | |
| UAT-AUTH-04 | 🟢 | First-login wajib ganti password | User baru `mustChangePassword=true` | 1. Login pertama kali. | Dipaksa ke form ganti password sebelum bisa akses fitur lain. | |
| UAT-AUTH-05 | 🟢 | Refresh-token rotation menjaga sesi | Sudah login, biarkan access-token kedaluwarsa | 1. Diamkan hingga access-token expired. 2. Lakukan aksi yang butuh API. | Token di-refresh otomatis (rotation); pengguna tidak ter-logout paksa. | |
| UAT-AUTH-06 | 🟢 | Logout mencabut sesi | Sudah login | 1. Klik Logout. 2. Tekan Back / akses URL terproteksi. | Diarahkan ke login; token tidak valid di server; halaman terproteksi tidak terbuka. | |
| UAT-AUTH-07 | 🔴 | Akses tanpa sesi diblok | Belum login / token dihapus | 1. Akses URL halaman dalam aplikasi langsung. | Redirect ke login; API mengembalikan `401`. | |
| UAT-AUTH-08 | 🔒 | Token kedaluwarsa/invalid ditolak server | Token dimanipulasi/dicabut | 1. Panggil endpoint terproteksi dengan token rusak. | `401 Unauthorized`; tidak ada data bocor. | |

---

## 3. User Management (`USR`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-USR-01 | 🟢 | SUPERADMIN membuat user baru | Login SUPERADMIN | 1. Administration → Users → Tambah. 2. Isi nama, email, role, RTUPP, team. 3. Simpan. | User dibuat; `mustChangePassword=true`; muncul di daftar; email unik tervalidasi. | |
| UAT-USR-02 | 🟢 | SUPERADMIN edit role/scope user | User target ada | 1. Buka user. 2. Ubah role/RTUPP. 3. Simpan. | Perubahan tersimpan; tercatat di audit log; scope user berubah saat login berikutnya. | |
| UAT-USR-03 | 🟢 | Reset password user | Login SUPERADMIN | 1. Buka user → Reset Password. 2. Konfirmasi. | Password di-reset; `mustChangePassword=true`; user wajib ganti saat login. | |
| UAT-USR-04 | 🟢 | Nonaktifkan/aktifkan user | User aktif ada | 1. Toggle status user → nonaktif. 2. Coba login sebagai user itu. | User nonaktif tidak bisa login; reaktivasi memulihkan akses. | |
| UAT-USR-05 | 🔴 | Email duplikat ditolak | Sudah ada user dgn email X | 1. Buat user baru dgn email X. 2. Simpan. | Validasi gagal; pesan "email sudah digunakan"; user tidak dibuat. | |
| UAT-USR-06 | 🔴 | Field wajib kosong ditolak | — | 1. Submit form user tanpa email/role. | Validasi inline; submit diblok; tidak ada request tersimpan. | |
| UAT-USR-07 | 🔒 | ADMIN hanya kelola user di RTUPP sendiri | Login ADMIN | 1. Buka Users. 2. Coba buat/lihat PETUGAS RTUPP lain. | Hanya user dalam RTUPP sendiri terlihat/terkelola; lintas-RTUPP `403`. | |
| UAT-USR-08 | 🔒 | PETUGAS tidak boleh akses User Management | Login PETUGAS | 1. Coba buka menu/URL Users. 2. Coba panggil API create user. | Menu tidak tampil; akses URL diblok; API `403`. | |
| UAT-USR-09 | 🔒 | SUPERADMIN tidak bisa dihapus (BR-019) | — | 1. Coba hapus akun SUPERADMIN. | Aksi ditolak; akun super tetap ada. | |

---

## 4. Team Management (`TEAM`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-TEAM-01 | 🟢 | SUPERADMIN buat RTUPP & Team | Login SUPERADMIN | 1. Administration → Teams/RTUPP. 2. Buat RTUPP baru lalu Team di dalamnya. 3. Simpan. | RTUPP & Team tersimpan; tersedia di selector saat buat user. | |
| UAT-TEAM-02 | 🟢 | Assign user ke Team | RTUPP/Team & user ada | 1. Buka user / Team. 2. Pilih team. 3. Simpan. | User ter-assign; muncul sebagai anggota team; scope laporan mengikuti. | |
| UAT-TEAM-03 | 🟢 | Find-or-create selector statis | — | 1. Saat buat user, pilih RTUPP/Team dari selector. | Selector menampilkan opsi statis; memilih membuat asosiasi yang benar tanpa duplikat. | |
| UAT-TEAM-04 | 🔴 | Nama RTUPP/Team duplikat ditolak | RTUPP X sudah ada | 1. Buat RTUPP dgn nama X. 2. Simpan. | Validasi gagal; tidak ada duplikat dibuat. | |
| UAT-TEAM-05 | 🔴 | Hapus Team yang masih punya anggota | Team punya ≥1 user | 1. Coba hapus Team. | Ditolak / diberi peringatan; integritas referensial terjaga (tidak ada user yatim). | |
| UAT-TEAM-06 | 🔒 | ADMIN tidak boleh buat RTUPP global | Login ADMIN | 1. Coba buat RTUPP baru di luar scope. | Aksi diblok di UI; API `403`; hanya SUPERADMIN yang boleh. | |
| UAT-TEAM-07 | 🔒 | PETUGAS tidak punya akses Team Management | Login PETUGAS | 1. Coba akses menu/URL Teams. | Menu tidak tampil; akses diblok; API `403`. | |

---

## 5. Laporan Awal (`LA`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-LA-01 | 🟢 | PETUGAS buat & submit Laporan Awal | Login PETUGAS, online | 1. Buat Laporan Awal. 2. Isi safety checklist, personil, pengawas, WP/JSA/HIRARC. 3. Submit. | Nomor `LA-YEAR-XXX` ter-generate; status `DRAFT`→`PENDING`; muncul di Riwayat. | |
| UAT-LA-02 | 🟢 | Auto-save draft | Form sebagian terisi | 1. Isi sebagian. 2. Tutup tanpa submit. 3. Buka lagi form. | Draft pulih dari localStorage; data tidak hilang. | |
| UAT-LA-03 | 🟢 | Upload foto/lampiran (≤20 file, ≤25MB) | Laporan terbuka | 1. Tambah beberapa foto. 2. Simpan. | Foto terunggah & terkait laporan; jumlah/ukuran tervalidasi. | |
| UAT-LA-04 | 🟢 | Generator template WhatsApp | Laporan terisi | 1. Klik generate template WA. | Teks ringkasan ter-format & dapat disalin sesuai isi laporan. | |
| UAT-LA-05 | 🟢 | ADMIN approve Laporan Awal | Ada LA status PENDING | 1. Login ADMIN. 2. Buka validasi. 3. Approve. | Status → `APPROVED`; tercatat di audit; PETUGAS lihat hasil. | |
| UAT-LA-06 | 🟢 | ADMIN minta revisi | Ada LA PENDING | 1. Buka LA. 2. Pilih Revisi + catatan. | Status → `REVISED`; catatan tampil ke PETUGAS; bisa diedit & submit ulang. | |
| UAT-LA-07 | 🔴 | Submit dgn field wajib kosong | Form belum lengkap | 1. Submit tanpa checklist/personil wajib. | Validasi memblok submit; pesan field; tidak tersimpan sebagai PENDING. | |
| UAT-LA-08 | 🔴 | Upload melebihi batas | — | 1. Tambah >20 file atau file >25MB. | Ditolak dgn pesan batas; laporan lain tidak rusak. | |
| UAT-LA-09 | 🔒 | PETUGAS hanya lihat laporan sendiri | ≥2 PETUGAS punya LA | 1. Login PETUGAS A. 2. Buka Riwayat. 3. Coba akses ID milik B. | Hanya laporan sendiri tampil; akses ID lain `403`/tidak ditemukan. | |
| UAT-LA-10 | 🔒 | PETUGAS tidak boleh approve laporan | Login PETUGAS | 1. Coba panggil aksi/endpoint approve. | Tidak ada tombol approve; API `403`. | |
| UAT-LA-11 | 🔒 | ADMIN tak boleh validasi laporan RTUPP lain | LA milik RTUPP lain | 1. Login ADMIN. 2. Coba approve LA RTUPP lain. | Akses ditolak `403`; isolasi RTUPP terjaga. | |

---

## 6. Laporan Akhir (`LK`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-LK-01 | 🟢 | PETUGAS buat & submit Laporan Akhir | Login PETUGAS | 1. Buat Laporan Akhir. 2. Isi aset SCADA, RTU/media/rectifier/baterai, kondisi perangkat. 3. Submit. | Nomor `LK-YEAR-XXX`; status `PENDING`; data perangkat tersimpan utuh. | |
| UAT-LK-02 | 🟢 | Kaitkan Laporan Akhir ke Laporan Awal terkait | LA terkait ada | 1. Saat buat LK, kaitkan ke LA. 2. Simpan. | Relasi tersimpan; dapat ditelusuri dua arah. | |
| UAT-LK-03 | 🟢 | Upload dokumentasi perangkat | LK terbuka | 1. Tambah foto kondisi perangkat. 2. Simpan. | Lampiran tersimpan & terkait LK. | |
| UAT-LK-04 | 🟢 | ADMIN approve / reject LK | LK PENDING | 1. Login ADMIN. 2. Approve atau Reject + alasan. | Status → `APPROVED`/`REJECTED`; alasan reject tampil ke PETUGAS; audit tercatat. | |
| UAT-LK-05 | 🔴 | Submit data perangkat tidak valid | — | 1. Isi nilai baterai/rectifier di luar rentang valid. 2. Submit. | Validasi menolak; pesan jelas; tidak tersimpan. | |
| UAT-LK-06 | 🔴 | Edit laporan yang sudah APPROVED | LK APPROVED | 1. Coba edit laporan approved. | Diblok / butuh alur revisi; data approved immutable tanpa otorisasi. | |
| UAT-LK-07 | 🔒 | PETUGAS lihat LK sendiri saja | ≥2 PETUGAS | 1. Akses LK milik PETUGAS lain. | Diblok; hanya milik sendiri. | |
| UAT-LK-08 | 🔒 | PETUGAS tak boleh reject/approve | Login PETUGAS | 1. Coba aksi approve/reject. | Tombol tak ada; API `403`. | |

---

## 7. Rekap (`RKP`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-RKP-01 | 🟢 | Buka Rekap Awal (`/rekap`, LaporanAwal) | Login ADMIN, ada data LA | 1. Buka `/rekap`. | Grid spreadsheet tampil dgn data Laporan Awal; baris summary akurat. | |
| UAT-RKP-02 | 🟢 | Buka Rekap Akhir (`/rekap-akhir`, LaporanAkhir) | Ada data LK | 1. Buka `/rekap-akhir`. | Grid kembar untuk Laporan Akhir; summary akurat. | |
| UAT-RKP-03 | 🟢 | Toggle kolom | Grid terbuka | 1. Sembunyikan/tampilkan beberapa kolom. | Tampilan kolom berubah sesuai pilihan; tidak error. | |
| UAT-RKP-04 | 🟢 | Export template Rekap | Grid terisi | 1. Klik Export. | File XLSX terunduh sesuai template & kolom aktif; data cocok dgn grid. | |
| UAT-RKP-05 | 🟢 | Filter & summary konsisten | Data > 1 RTUPP/periode | 1. Terapkan filter periode/RTUPP. | Grid & baris summary ter-update konsisten dgn filter. | |
| UAT-RKP-06 | 🔴 | Export saat data kosong | Filter menghasilkan 0 baris | 1. Filter ke kosong. 2. Export. | Ditangani anggun (file kosong/peringatan); tidak crash. | |
| UAT-RKP-07 | 🔒 | Scope Rekap mengikuti RTUPP | Login ADMIN RTUPP A | 1. Buka Rekap. | Hanya data RTUPP sendiri; SUPERADMIN melihat semua RTUPP. | |
| UAT-RKP-08 | 🔒 | PETUGAS tidak akses Rekap | Login PETUGAS | 1. Coba buka `/rekap`. | Akses diblok; menu tak tampil. | |

---

## 8. Documents (`DOC`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-DOC-01 | 🟢 | Unggah dokumen ke registry | Login ADMIN | 1. Operations → Documents → Upload. 2. Pilih file + metadata (tipe, aset terkait). 3. Simpan. | Dokumen tersimpan; metadata terindeks; muncul di daftar. | |
| UAT-DOC-02 | 🟢 | Unduh / preview dokumen | Dokumen ada | 1. Buka dokumen → Download/Preview. | File terunduh utuh / preview tampil benar. | |
| UAT-DOC-03 | 🟢 | Generate laporan PDF (Report Generator) | Data sumber tersedia | 1. Pilih sumber → Generate PDF/Excel. | File ber-branding & versioned dihasilkan; tercatat di Download History. | |
| UAT-DOC-04 | 🟢 | Versioning / riwayat unduh | Dokumen pernah di-generate | 1. Buka Download Center. | Riwayat & versi tampil; bisa unduh versi sebelumnya. | |
| UAT-DOC-05 | 🔴 | Tipe file tidak diizinkan / oversize | — | 1. Unggah tipe terlarang atau melebihi batas. | Ditolak dgn pesan; tidak tersimpan. | |
| UAT-DOC-06 | 🔴 | Generate PDF saat sumber data hilang | Sumber kosong/rusak | 1. Generate dgn sumber kosong. | Error ditangani anggun; pesan jelas; tidak menghasilkan file rusak. | |
| UAT-DOC-07 | 🔒 | PETUGAS read-only / scope dokumen | Login PETUGAS | 1. Coba upload/hapus dokumen. | Aksi tulis diblok sesuai matrix; API `403`; hanya boleh lihat sesuai scope. | |
| UAT-DOC-08 | 🔒 | Isolasi dokumen antar-RTUPP | Dokumen RTUPP lain | 1. Login ADMIN RTUPP A → akses dokumen RTUPP B. | Diblok `403`; isolasi terjaga. | |

---

## 9. Import (`IMP`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-IMP-01 | 🟢 | Import data Gardu/Asset/Performance valid | Login ADMIN, file template benar | 1. Reports/Import → pilih jenis. 2. Unggah file template valid. 3. Jalankan import. | Baris ter-import; ringkasan sukses/jumlah tampil; data muncul di modul terkait. | |
| UAT-IMP-02 | 🟢 | Pratinjau & validasi sebelum commit | File terunggah | 1. Unggah file. 2. Lihat preview/validasi. | Preview menampilkan baris valid/invalid sebelum commit; pengguna bisa batal. | |
| UAT-IMP-03 | 🟢 | Unduh template import | — | 1. Klik unduh template. | Template Excel sesuai skema terunduh. | |
| UAT-IMP-04 | 🔴 | File format/kolom salah | File rusak/kolom kurang | 1. Unggah file salah skema. 2. Jalankan. | Import ditolak; laporan error per baris/kolom; tidak ada data parsial korup. | |
| UAT-IMP-05 | 🔴 | Baris duplikat / referensi tak ada | File berisi duplikat / FK invalid | 1. Import file tersebut. | Baris bermasalah dilaporkan & dilewati/ditolak; baris valid tetap terjaga sesuai aturan; tidak terjadi duplikasi. | |
| UAT-IMP-06 | 🔒 | PETUGAS tidak boleh import | Login PETUGAS | 1. Coba akses Import / API import. | Menu tak tampil; API `403`. | |
| UAT-IMP-07 | 🔒 | Import ADMIN ter-scope RTUPP | Login ADMIN RTUPP A | 1. Import data bertanda RTUPP B. | Ditolak/ter-filter ke RTUPP sendiri; tidak menulis lintas-RTUPP. | |

---

## 10. Dashboard (`DASH`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-DASH-01 | 🟢 | Dashboard PETUGAS | Login PETUGAS, ada laporan | 1. Buka dashboard. | Menampilkan ringkasan laporan sendiri (tren 14 hari, status, recent) — hanya data sendiri. | |
| UAT-DASH-02 | 🟢 | Dashboard ADMIN role-aware | Login ADMIN | 1. Buka dashboard. | KPI & chart untuk RTUPP sendiri; pie status, tren, recent akurat. | |
| UAT-DASH-03 | 🟢 | Dashboard SUPERADMIN global | Login SUPERADMIN | 1. Buka dashboard. | KPI agregat semua RTUPP; bisa drill per RTUPP. | |
| UAT-DASH-04 | 🟢 | Chart & angka konsisten dgn data | Data diketahui | 1. Bandingkan angka KPI dgn jumlah di list/rekap. | Angka cocok dgn sumber; tren 14 hari benar. | |
| UAT-DASH-05 | 🔴 | Dashboard saat data kosong | RTUPP/role baru tanpa data | 1. Buka dashboard. | Empty-state ditampilkan; tidak error/NaN. | |
| UAT-DASH-06 | 🔒 | KPI ADMIN hanya RTUPP sendiri (UAT-012) | Login ADMIN RTUPP A | 1. Lihat KPI. 2. Coba paksa parameter RTUPP B. | Hanya data RTUPP A; permintaan RTUPP B → `403`/ter-filter. | |

---

## 11. Notifications (`NOTIF`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-NOTIF-01 | 🟢 | Notifikasi saat laporan disubmit | PETUGAS submit LA/LK | 1. PETUGAS submit laporan. 2. Cek inbox ADMIN. | ADMIN menerima notifikasi event submit di NotificationCenter. | |
| UAT-NOTIF-02 | 🟢 | Notifikasi hasil validasi ke PETUGAS | ADMIN approve/reject/revisi | 1. ADMIN proses laporan. 2. Cek inbox PETUGAS. | PETUGAS menerima notifikasi hasil; tautan ke laporan benar. | |
| UAT-NOTIF-03 | 🟢 | Tandai dibaca & riwayat | Ada notifikasi belum dibaca | 1. Buka drawer. 2. Tandai dibaca. | Badge unread berkurang; status tersimpan; riwayat tetap tersedia. | |
| UAT-NOTIF-04 | 🟢 | Push notification (mobile/PWA) | Device terdaftar push | 1. Picu event. | Push diterima di device; tap membuka konteks yang benar. | |
| UAT-NOTIF-05 | 🔴 | Dedup / retry queue | Event terkirim berulang | 1. Picu event sama cepat berturut. | Tidak ada notifikasi ganda (dedup); retry queue tidak menggandakan. | |
| UAT-NOTIF-06 | 🔒 | Pengguna hanya lihat notifikasi sendiri | ≥2 pengguna | 1. Login pengguna A. 2. Buka inbox. | Hanya notifikasi yang ditujukan untuk A; tidak ada milik orang lain. | |

---

## 12. Offline Sync (`SYNC`) — PETUGAS inti

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-SYNC-01 | 🟢 | Banner & mode offline | PWA/app terbuka | 1. Aktifkan airplane mode. | Banner offline muncul; aplikasi tetap dapat dipakai untuk input. | |
| UAT-SYNC-02 | 🟢 | Buat Laporan Awal offline | Offline | 1. Buat & isi LA saat offline. 2. Simpan. | Masuk antrian lokal; badge "menunggu sync" tampil; data persist. | |
| UAT-SYNC-03 | 🟢 | Foto offline ikut antrian | Offline | 1. Tambah foto pada laporan offline. | Foto tersimpan lokal & masuk antrian sync. | |
| UAT-SYNC-04 | 🟢 | Sync otomatis saat online | Ada antrian offline | 1. Matikan airplane mode. 2. Tunggu sync. | Antrian terkirim ke server; laporan & foto muncul; badge antrian hilang; nomor laporan ter-assign. | |
| UAT-SYNC-05 | 🟢 | Data bertahan setelah app ditutup | Ada antrian, app ditutup | 1. Tutup app saat masih offline. 2. Buka lagi. | Antrian offline pulih utuh; tidak ada data hilang. | |
| UAT-SYNC-06 | 🔴 | Konflik / kegagalan sync | Server menolak salah satu item | 1. Buat kondisi item gagal (mis. validasi server). | Item gagal ditandai & dipertahankan untuk retry; item lain tetap tersync; tidak ada data hilang diam-diam. | |
| UAT-SYNC-07 | 🔴 | Sync terputus di tengah | Koneksi putus saat upload | 1. Mulai sync. 2. Putuskan koneksi. 3. Sambungkan lagi. | Sync resume tanpa duplikasi; idempoten; integritas terjaga. | |

---

## 13. Executive Portal (`EXEC`)

| Test ID | Path | Objective | Preconditions | Steps | Expected Result | Pass/Fail |
|---------|:----:|-----------|---------------|-------|-----------------|:---------:|
| UAT-EXEC-01 | 🟢 | Akses portal eksekutif (read-only) | Login role manajemen/SUPERADMIN | 1. Buka `/executive`. | Dashboard manajemen read-only tampil; KPI agregat dari API V2 (kpi/workflow/asset/gis/performance). | |
| UAT-EXEC-02 | 🟢 | Scope & audience dari `kpi.scope.level` | Pengguna dgn scope tertentu | 1. Buka portal. | Cakupan data sesuai level scope pengguna; label audience benar. | |
| UAT-EXEC-03 | 🟢 | KPI konsisten dgn sumber operasional | Data diketahui | 1. Bandingkan KPI eksekutif vs dashboard operasional. | Angka konsisten (tidak ada logika duplikat menyimpang). | |
| UAT-EXEC-04 | 🔴 | Portal saat sebagian API gagal | Salah satu API V2 down | 1. Buka portal. | Bagian gagal menampilkan error/empty-state anggun; bagian lain tetap tampil. | |
| UAT-EXEC-05 | 🔒 | Portal benar-benar read-only | Login di portal | 1. Cari aksi tulis/edit. | Tidak ada aksi mutasi; portal hanya konsumsi (view). | |
| UAT-EXEC-06 | 🔒 | PETUGAS/ADMIN biasa tak akses portal | Login PETUGAS / ADMIN non-manajemen | 1. Coba buka `/executive`. | Akses diblok sesuai audience; menu tak tampil. | |

---

## 14. Ringkasan Cakupan

| Area | Happy 🟢 | Failure 🔴 | Permission 🔒 | Total |
|------|:---:|:---:|:---:|:---:|
| Authentication | 4 | 3 | 1 | 8 |
| User Management | 4 | 2 | 3 | 9 |
| Team Management | 3 | 2 | 2 | 7 |
| Laporan Awal | 6 | 2 | 3 | 11 |
| Laporan Akhir | 4 | 2 | 2 | 8 |
| Rekap | 5 | 1 | 2 | 8 |
| Documents | 4 | 2 | 2 | 8 |
| Import | 3 | 2 | 2 | 7 |
| Dashboard | 4 | 1 | 1 | 6 |
| Notifications | 4 | 1 | 1 | 6 |
| Offline Sync | 5 | 2 | 0 | 7 |
| Executive Portal | 3 | 1 | 2 | 6 |
| **TOTAL** | **49** | **21** | **21** | **91** |

> Setiap area mencakup minimal satu **happy**, satu **failure**, dan satu **permission** path (kecuali Offline Sync yang sifatnya tunggal-pengguna PETUGAS — RBAC diuji pada area lain).

## 15. Sign-off Eksekusi

| Peran | Nama | Tanda tangan | Tanggal |
|-------|------|--------------|---------|
| Fasilitator UAT (Dev) | | | |
| Perwakilan PLN (Bisnis) | | | |
| Perwakilan PLN (IT) | | | |

**Keputusan:** ☐ DITERIMA  ☐ DITERIMA DENGAN CATATAN  ☐ DITOLAK
