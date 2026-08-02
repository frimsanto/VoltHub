# VoltHub — UAT Checklist (User Acceptance Testing)

> Skenario penerimaan untuk tim PLN sebelum go-live. Jalankan di **STAGING** dengan data uji ([SEED_DATA_PLAN.md](./SEED_DATA_PLAN.md)), **bukan** produksi.
> **Versi:** VoltHub Feature-Complete (menggantikan checklist V1-only sebelumnya; skenario reporting V1 yang masih valid dipertahankan di Bagian A).
> Rencana & kriteria lulus: [UAT_PLAN.md](./UAT_PLAN.md). Risiko & known issues: [GO_LIVE_GAP_ANALYSIS.md](./GO_LIVE_GAP_ANALYSIS.md).

**Legenda Hasil:** ☐ belum · ✅ lulus · ❌ gagal · ⚠️ catatan

**Akun uji** (lihat SEED_DATA_PLAN §2.1):

| Role backend | Label UI | Email | Dashboard |
|---|---|---|---|
| SUPERADMIN | Super Admin | `super.uat@pln.co.id` | SUPERADMIN |
| ADMIN | Admin | `admin.uat@pln.co.id` | ADMIN |
| ADMIN_RTUPP | Admin RTUPP | `adminrtupp.uat@pln.co.id` | ADMIN (treated admin-tier) |
| PETUGAS | Petugas | `petugas.uat@pln.co.id` | PETUGAS |

> **KI-01:** Semantik `ADMIN` vs `ADMIN_RTUPP` belum diselaraskan (V1 pernah ditukar). UAT mencatat perilaku **aktual**; rekonsiliasi RBAC di luar scope. RBAC UI mengikuti matrix `FE/src/lib/v2/rbac.ts`; backend tetap enforcer.

---

## A. PETUGAS — Pelaporan Lapangan (V1, dipertahankan)

### A1. Login & Sesi
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A1.1 | Login valid | Masuk; landing sesuai role | ☐ |
| A1.2 | Login salah | Pesan "email/password salah" | ☐ |
| A1.3 | Lockout 5× gagal | Terkunci 15 mnt (429) | ☐ |
| A1.4 | First-login (`mustChangePassword`) | Dipaksa ganti password | ☐ |
| A1.5 | Sesi bertahan (tutup/buka app) | Tetap login | ☐ |
| A1.6 | Token refresh otomatis | Tidak ter-logout paksa (rotation) | ☐ |
| A1.7 | Logout | Sesi dicabut server | ☐ |

### A2. Offline → Online (PETUGAS inti)
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A2.1 | Banner offline | Muncul saat airplane mode | ☐ |
| A2.2 | Buat Laporan Awal offline | Masuk antrian lokal + badge | ☐ |
| A2.3 | Foto offline | Tersimpan, ikut antrian | ☐ |
| A2.4 | Sinkron otomatis saat online | Laporan + foto terkirim, badge hilang | ☐ |
| A2.5 | Tanpa duplikat saat sinyal naik-turun | Terkirim tepat sekali | ☐ |
| A2.6 | Anti data hilang (tutup app) | Antrian tetap ada | ☐ |

### A3. Laporan Awal (online)
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A3.1 | Isi field wajib (SPJ, UP3, pekerjaan, lokasi, WP) | Tersimpan/valid | ☐ |
| A3.2 | Kosongkan field wajib | Validasi muncul, submit ditolak | ☐ |
| A3.3 | Safety checklist K3 | Tersimpan benar | ☐ |
| A3.4 | Snapshot personil (multi-select master) | Jumlah & snapshot tercatat | ☐ |
| A3.5 | Autosave draft (localStorage) | Badge "Tersimpan", restore saat buka ulang | ☐ |
| A3.6 | Template WhatsApp | Preview, Salin, Share `wa.me` | ☐ |

### A4. Foto & GPS
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A4.1 | Kamera native (Android) | Kamera terbuka, foto terlampir | ☐ |
| A4.2 | Multi-file (foto+video) | Terlampir, thumbnail tampil | ☐ |
| A4.3 | Batas ukuran / jenis file | File invalid ditolak (pesan jelas) | ☐ |
| A4.4 | Ambil GPS di Lokasi Gardu | Koordinat `[GPS: ...]` ditambahkan | ☐ |
| A4.5 | Izin GPS ditolak | Ditangani rapi, tidak crash | ☐ |

### A5. Submit & Laporan Akhir
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A5.1 | Submit Laporan Awal | Status PENDING | ☐ |
| A5.2 | Laporan Akhir — field SCADA (RTU/Media/Rectifier/Baterai, IP, ASDU) | Validasi IP/ASDU jalan; tersimpan | ☐ |
| A5.3 | Submit Laporan Akhir + dokumentasi | PENDING + lampiran terkirim | ☐ |
| A5.4 | Notifikasi hasil approve/reject | Push diterima + status terbaru | ☐ |
| A5.5 | Alur revisi (REVISED → submit ulang) | Kembali PENDING | ☐ |

### A6. Dashboard PETUGAS (VoltHub `/v2`)
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A6.1 | Login PETUGAS → `/v2` | Tampil dashboard PETUGAS | ☐ |
| A6.2 | Kartu Laporan Hari Ini / Pending / Approved | Angka akurat (`/dashboard/stats`) | ☐ |
| A6.3 | Tren Laporan (Awal/Akhir) + Status donut | Chart tampil | ☐ |
| A6.4 | Quick Action → Laporan Awal / Akhir | Membuka form V1 | ☐ |
| A6.5 | Riwayat Aktivitas | Daftar aktivitas terbaru tampil | ☐ |

### A7. Riwayat
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| A7.1 | `/history` filter + pagination | Hanya laporan milik sendiri | ☐ |
| A7.2 | Buka detail laporan | Data + foto tampil | ☐ |

---

## B. ADMIN — Asset Management (VoltHub `/v2`)

### B1. Dashboard ADMIN
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B1.1 | Login ADMIN → `/v2` | Dashboard ADMIN tampil | ☐ |
| B1.2 | Overview cards (Asset/Inspection/HAR/Documents) | Angka akurat (meta.total) | ☐ |
| B1.3 | Asset Status donut + Documents-by-Type bar | Tampil & proporsional | ☐ |
| B1.4 | Critical Assets | Daftar aset WARNING/DAMAGED tampil | ☐ |
| B1.5 | Inspection Trend & HAR Trend | Area chart 14-hari tampil | ☐ |
| B1.6 | Recent Inspection/HAR/Imports | List + link ke detail | ☐ |
| B1.7 | Device Status panel | Jumlah RTU/Rectifier/Battery/Comm Media tampil; status = placeholder OOP/INSCANE | ☐ |

### B2. Master Data — Locations & Feeders
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B2.1 | Locations: list + filter + pagination | Data tampil | ☐ |
| B2.2 | Create/Edit/Detail/Delete Location | CRUD jalan (soft delete) | ☐ |
| B2.3 | Feeders CRUD (scoped lokasi) | Jalan | ☐ |

### B3. Master Data — Assets & Communication Media
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B3.1 | Assets: filter (type/status/lokasi) + search | Akurat | ☐ |
| B3.2 | Create/Edit (load full detail) Asset | Jalan; PUT replace utuh | ☐ |
| B3.3 | Hierarki parent→child di detail | Child Assets tampil | ☐ |
| B3.4 | SIM Cards CRUD (nested) | Jalan | ☐ |
| B3.5 | Communication Media CRUD | Jalan | ☐ |
| B3.6 | Delete asset punya child | Ditolak/diblokir sesuai aturan | ☐ |

### B4. Operations — Inspection
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B4.1 | Buat Inspeksi (lokasi + tanggal) | Tersimpan, redirect detail | ☐ |
| B4.2 | Tambah Temuan (aset scoped lokasi, status) | Tersimpan; badge status | ☐ |
| B4.3 | Upload foto temuan | Thumbnail tampil; buka foto | ☐ |
| B4.4 | List + filter lokasi; `_count` temuan | Akurat | ☐ |

### B5. Operations — HAR
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B5.1 | Buat HAR (lokasi + tanggal) | Tersimpan, redirect detail | ☐ |
| B5.2 | Tambah Detail (aset, status incl OFFLINE) | Tersimpan | ☐ |
| B5.3 | Edit Detail (aset terkunci) | Status/analisa/notes ter-update | ☐ |
| B5.4 | Hapus Detail | Terhapus | ☐ |

### B6. Operations — Documents
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B6.1 | Upload dokumen (file + tipe + lokasi/aset) | Tersimpan; minimal salah satu lokasi/aset wajib | ☐ |
| B6.2 | List + filter tipe + search | Akurat | ☐ |
| B6.3 | Download dokumen | File terbuka/terunduh | ☐ |
| B6.4 | Hapus dokumen (soft delete) | Hilang dari list | ☐ |

### B7. Reports
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B7.1 | Generate PDF dari detail Inspeksi | PDF ter-generate & terunduh (`%PDF`) | ☐ |
| B7.2 | Generate PDF dari detail HAR | Idem | ☐ |
| B7.3 | Reports: history list + filter jenis/lokasi | Akurat | ☐ |
| B7.4 | Generate via modal Reports (pilih sumber) | Jalan + masuk history | ☐ |
| B7.5 | Download dari history | PDF terunduh | ☐ |

### B8. Import
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B8.1 | Upload `UAT-asset-import-OK.xlsx` | Job SUCCESS; aset bertambah | ☐ |
| B8.2 | Upload `UAT-asset-import-MIXED.xlsx` | total/ok/fail benar | ☐ |
| B8.3 | Import Detail — Validation Summary | Total/Berhasil/Gagal/Error akurat | ☐ |
| B8.4 | Import Errors (baris invalid) | rowNumber + pesan tampil | ☐ |
| B8.5 | Filter status job | Jalan | ☐ |

### B9. AI Search
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| B9.1 | Cari kode/nama lokasi | Result cards tampil | ☐ |
| B9.2 | Asset Summary + Comm Media | Daftar aset & media tampil | ☐ |
| B9.3 | Last Inspection & Last HAR | Ringkasan + status tampil | ☐ |
| B9.4 | Query tidak match | Pesan "tidak ada lokasi cocok" rapi | ☐ |

---

## C. SUPERADMIN — Administration & Oversight

### C1. Dashboard SUPERADMIN
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| C1.1 | Login → `/v2` | Dashboard SUPERADMIN tampil | ☐ |
| C1.2 | Total Users/Assets/Inspection/HAR/Documents/Reports | Akurat | ☐ |
| C1.3 | Asset Status donut + Import Statistics bar | Tampil | ☐ |
| C1.4 | Recent Activity | Tampil | ☐ |
| C1.5 | Device Status (registry) | Jumlah tampil; status placeholder | ☐ |

### C2. Users + Password Reset
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| C2.1 | List users + filter role + search | Akurat | ☐ |
| C2.2 | Create user (role, RTUPP, Team) | Dibuat; `mustChangePassword=true` | ☐ |
| C2.3 | Edit user (role, isActive) | Ter-update | ☐ |
| C2.4 | **Reset Password** | Password sementara di-set; user wajib ganti saat login | ☐ |
| C2.5 | Nonaktifkan user | Tidak bisa login | ☐ |
| C2.6 | Hapus user | Terhapus | ☐ |

### C3. Teams & RTUPP
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| C3.1 | Teams CRUD (pilih RTUPP) | Jalan | ☐ |
| C3.2 | RTUPP CRUD | Jalan | ☐ |
| C3.3 | Counts (_count members/teams/users) | Akurat | ☐ |

### C4. Oversight (V1)
| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| C4.1 | Monitoring laporan | Status real-time/terbaru | ☐ |
| C4.2 | Validasi (approve/reject/revisi) | Status & audit terisi | ☐ |
| C4.3 | Rekap Awal/Akhir + toggle kolom | Grid tampil | ☐ |
| C4.4 | Export XLSX | File sesuai grid; aksi tercatat | ☐ |
| C4.5 | Audit / Activity Log | Riwayat aksi tampil | ☐ |

---

## D. RBAC & Role Legacy (lintas-role, negatif)

| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| D1 | PETUGAS akses `/v2/users` | Redirect `/unauthorized` (admin.access) | ☐ |
| D2 | PETUGAS akses `/v2/imports` | Redirect `/unauthorized` (imports.run) | ☐ |
| D3 | PETUGAS di Master Data | Tombol Create/Edit/Delete **tidak** muncul | ☐ |
| D4 | PETUGAS Reports | Tombol Generate **tidak** muncul (download saja) | ☐ |
| D5 | ADMIN_RTUPP di Locations/Feeders | Tidak boleh write (locations.write = SUPERADMIN/ADMIN saja) | ☐ |
| D6 | ADMIN_RTUPP di Assets/CommMedia | Boleh write (admin-tier) | ☐ |
| D7 | ADMIN_RTUPP akses Administration | **Saat ini diizinkan** (admin.access) — catat untuk KI-01/keputusan | ☐ |
| D8 | Endpoint backend tanpa token | 401 | ☐ |
| D9 | Aksi terlarang langsung ke API (mis. PETUGAS POST /assets) | Backend tolak 403 | ☐ |

---

## E. Non-Fungsional

| # | Skenario | Hasil diharapkan | Hasil |
|---|---|---|---|
| E1 | Force update (versi < min) | Layar "Perbarui Aplikasi" (426) | ☐ |
| E2 | Rate limit | Spam request dibatasi | ☐ |
| E3 | Error termonitor | Muncul di Sentry (staging) | ☐ |
| E4 | Responsif mobile (PWA & Android) | UI rapi di HP | ☐ |
| E5 | Push end-to-end + deep link | Notifikasi membuka laporan terkait | ☐ |
| E6 | Bahasa Indonesia konsisten | Seluruh UI/pesan benar | ☐ |
| E7 | Performa dasar list/dashboard | Muat < ~3 dtk pada data UAT | ☐ |
| E8 | Theme light/dark | Tampil benar di kedua mode | ☐ |

---

## F. Critical Path (WAJIB 100% lulus untuk go-live)

1. **A1.1** Login keempat role.
2. **A2.2 + A2.4** PETUGAS buat laporan offline → sinkron otomatis.
3. **A3.1 + A4.1 + A4.4 + A5.1** Laporan Awal lengkap + foto + GPS + submit.
4. **A5.4 / E5** PETUGAS terima notifikasi hasil validasi.
5. **B3.2** ADMIN create/edit Asset.
6. **B4.1–B4.3** Inspeksi + temuan + foto.
7. **B5.1–B5.2** HAR + detail.
8. **B7.1 + B7.5** Generate PDF + download dari history.
9. **B8.1 + B8.3 + B8.4** Import OK + Validation Summary + Errors.
10. **C2.2 + C2.4** SUPERADMIN buat user + reset password.
11. **D1 + D8 + D9** RBAC: PETUGAS ditolak admin area; tanpa token 401; aksi terlarang 403.
12. **C4.2** Validasi laporan (approve) end-to-end.

---

## Ringkasan UAT

| Bagian | ✅ | ❌ | ⚠️ |
|---|---|---|---|
| A. PETUGAS (reporting + dashboard) | | | |
| B. ADMIN (asset/operations/reports/import/AI) | | | |
| C. SUPERADMIN (administration + oversight) | | | |
| D. RBAC & role legacy | | | |
| E. Non-fungsional | | | |
| **Total** | | | |

**Kriteria lulus:** seluruh Critical Path (F) ✅ **dan** tidak ada defect Critical/High terbuka (lihat [UAT_PLAN.md](./UAT_PLAN.md) §7–8).

**Keputusan UAT:** ☐ DITERIMA  ☐ DITERIMA DENGAN CATATAN  ☐ DITOLAK
Disetujui (PLN): ____________________  Tanggal: __________
