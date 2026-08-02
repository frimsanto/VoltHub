# VoltHub — Seed Data Plan (UAT)

> **Tujuan:** mendefinisikan data dummy minimum agar seluruh skenario [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) dan dashboard role-aware dapat diuji bermakna di **STAGING**.
> **Prinsip:** idempotent (`upsert`), label jelas (prefix `UAT-`), mudah dibersihkan, **tanpa menyentuh data produksi**.
> **Tanggal:** 2026-06-04

## 1. Kondisi saat ini (baseline) — [BE/prisma/seed.ts](../BE/prisma/seed.ts)
Seed eksisting hanya membuat:
- 1 RTUPP (`JAKSEL` — UP3 Jakarta Selatan), 1 Team (`TEAM-A`).
- 3 user: `superadmin@voltreport.com`, `admin@voltreport.com`, `petugas@voltreport.com` (password `password123`).
- 5 Master Personil.

**Belum ada** data domain V2 (Locations, Feeders, Assets, SIM, Communication Media, Inspection, HAR, Documents, Generated Reports, Import Jobs). Akibatnya seluruh modul VoltHub & dashboard ADMIN/SUPERADMIN tampil kosong → **UAT tidak bermakna tanpa seeding tambahan.**

## 2. Data dummy yang diperlukan

### 2.1 Users (4 role untuk UAT)
Tambahkan akun ber-email `*.uat@pln.co.id` agar terpisah dari akun demo lama. `mustChangePassword` di-set sesuai skenario A1.4.

| Email | Role | RTUPP | Team | Catatan |
|---|---|---|---|---|
| `super.uat@pln.co.id` | SUPERADMIN | — | — | akses penuh |
| `admin.uat@pln.co.id` | ADMIN | UAT-RTUPP-1 | — | power asset (VoltHub) |
| `adminrtupp.uat@pln.co.id` | ADMIN_RTUPP | UAT-RTUPP-1 | — | verifikasi role legacy (KI-01) |
| `petugas.uat@pln.co.id` | PETUGAS | UAT-RTUPP-1 | UAT-TEAM-1 | pelaporan lapangan |
| `petugas2.uat@pln.co.id` | PETUGAS | UAT-RTUPP-2 | UAT-TEAM-2 | uji scope antar-RTUPP |
| `newuser.uat@pln.co.id` | PETUGAS | UAT-RTUPP-1 | UAT-TEAM-1 | `mustChangePassword=true` (uji A1.4) |

### 2.2 Organisasi
- **RTUPP:** `UAT-RTUPP-1` (UP3 Jakarta Selatan UAT), `UAT-RTUPP-2` (UP3 Jakarta Timur UAT) — uji scope & filter.
- **Team:** `UAT-TEAM-1` (di RTUPP-1), `UAT-TEAM-2` (di RTUPP-2).
- **Personil:** ≥ 5 per RTUPP (untuk snapshot personil Laporan Awal).

### 2.3 Master Data Aset (V2) — minimum agar dashboard & filter bermakna
| Entitas | Jumlah min. | Variasi penting |
|---|---|---|
| **Locations** | 4 | tipe GI / GH / GARDU; tersebar di 2 RTUPP; ada lat/long |
| **Feeders** | 4 | ≥ 2 lokasi punya feeder |
| **Assets** | 12+ | wajib mencakup tiap `assetType`: **RTU, FDI, RECTIFIER, BATTERY_BANK, ROUTER, MODEM, RADIO** |
| Asset status | — | sebar status: **ACTIVE, WARNING, DAMAGED, RETIRED** (≥1 WARNING & ≥1 DAMAGED untuk **Critical Assets**) |
| Asset hierarki | — | ≥ 1 parent→child (uji "Child Assets") |
| **AssetSimCard** | 3+ | pada aset RTU/MODEM, slot 1 & 2 |
| **Communication Media** | 4+ | variasi mediaType: GSM_4G, FO, ICON_IPVPN, RADIO_DATA |

> Catatan: agar **Device Status panel** menampilkan angka, cukup pastikan ada aset bertipe RTU, RECTIFIER, BATTERY_BANK + beberapa Communication Media (status real-time tetap placeholder — OOP/INSCANE).

### 2.4 Operations
| Entitas | Jumlah min. | Variasi |
|---|---|---|
| **Inspection** | 4+ | tanggal tersebar 14 hari terakhir (untuk **Inspection Trend**); di ≥ 2 lokasi |
| **InspectionFinding** | per inspeksi 1–3 | status **NORMAL / WARNING / CRITICAL** |
| **InspectionPhoto** | ≥ 2 | uji thumbnail & buka foto |
| **HarReport** | 4+ | tanggal tersebar 14 hari (untuk **HAR Trend**) |
| **HarDetail** | per HAR 1–3 | status **NORMAL / WARNING / CRITICAL / OFFLINE** |
| **Document** | 5+ | variasi documentType (PHOTO, BERITA_ACARA, SERTIFIKAT, …), sebagian terkait location, sebagian asset |
| **GeneratedReport** | 2+ | hasil generate dari 1 inspeksi + 1 HAR (uji history + download) |
| **ImportJob** | 2 | 1 SUCCESS, 1 dengan FAILED rows (uji Validation Summary + Errors) |

### 2.5 V1 Reporting (PETUGAS) — agar dashboard PETUGAS & `/dashboard/stats` bermakna
| Entitas | Jumlah min. | Variasi |
|---|---|---|
| **Laporan Awal** | 4+ | status DRAFT, PENDING, APPROVED, REVISED; tersebar 14 hari (trend) |
| **Laporan Akhir** | 3+ | field SCADA terisi (RTU/Media/Rectifier/Baterai, IP, ASDU) |
| **Attachment/Foto** | beberapa | uji lampiran |
| **ActivityLog** | otomatis | dari aksi di atas → mengisi "Recent Activity" / "Riwayat Aktivitas" |

### 2.6 Sampel file untuk Import
- `UAT-asset-import-OK.xlsx` — semua baris valid (kolom: locationCode, feederCode, assetType, assetCode, assetName, brand, model, serialNumber, tahunOperasi, status, notes).
- `UAT-asset-import-MIXED.xlsx` — campur valid + invalid (mis. `assetType` salah, `locationCode` tak dikenal) → menghasilkan **Import Errors** untuk uji Validation Summary.

## 3. Pendekatan Seeding

### 3.1 Rekomendasi: extend `BE/prisma/seed.ts` (idempotent)
- Tambah fungsi `seedUat()` terpisah, dipanggil hanya bila `SEED_UAT=true` (env guard) agar **tidak mencemari demo/produksi**.
- Gunakan `upsert` dengan key natural (`code`/`email`) → aman dijalankan ulang.
- Tanggal inspeksi/HAR/laporan dihitung relatif (`now - n hari`) agar trend 14-hari selalu terisi.
- Jalankan: `SEED_UAT=true npm run prisma:seed` (script `seed` sudah ada).

### 3.2 Alternatif: seeding via UI (sebagian)
Master data & operations dapat diisi lewat VoltHub oleh akun ADMIN saat smoke test — berguna sekaligus sebagai uji "create". Namun untuk **trend & volume** disarankan tetap via script agar konsisten.

### 3.3 Aturan kebersihan
- Semua kode ber-prefix `UAT-` (locations/feeders/assets/rtupp/team) dan email `*.uat@pln.co.id`.
- Sediakan skrip pembersih opsional (`cleanupUat()`) yang menghapus berdasarkan prefix → memudahkan reset antar-siklus UAT.
- **Jangan** mengubah/menghapus akun produksi atau data live.

## 4. Verifikasi pasca-seed (checklist cepat)
- [ ] Login keempat role berhasil.
- [ ] Dashboard SUPERADMIN: semua angka > 0 (Users/Assets/Inspection/HAR/Documents/Reports), Import Statistics terisi, Recent Activity ada.
- [ ] Dashboard ADMIN: Asset Status donut, Documents-by-Type bar, Critical Assets ≥ 1, Inspection/HAR Trend tampil, Recent lists terisi.
- [ ] Dashboard PETUGAS: Laporan Hari Ini/Pending/Approved terisi, Tren Laporan & Status donut tampil.
- [ ] Device Status panel menampilkan jumlah RTU/Rectifier/Battery/Comm Media (status = placeholder).
- [ ] Import: minimal 1 job SUCCESS + 1 job dengan errors.

## 5. Keterkaitan
Pemenuhan plan ini adalah **Entry Criteria** UAT (lihat [UAT_PLAN.md](./UAT_PLAN.md) §6). Kekurangan data tertentu dicatat di [GO_LIVE_GAP_ANALYSIS.md](./GO_LIVE_GAP_ANALYSIS.md).
