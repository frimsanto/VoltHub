# VoltHub — UAT Plan (User Acceptance Testing)

> **Status:** UAT Preparation Phase. Tidak ada fitur baru, tidak ada refactor RBAC, tidak ada penghapusan V1.
> **Tanggal disusun:** 2026-06-04
> **Produk:** VoltHub — Telecommunication Asset Management System (evolusi VoltReport).
> **Milestone:** Feature Complete (Backend V2, Frontend V2 Master Data + Operations + Reports/Import/AI/Administration, Dashboard PLN role-aware).

Dokumen pendamping:
- [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) — skenario per role (yang dicentang).
- [SEED_DATA_PLAN.md](./SEED_DATA_PLAN.md) — data dummy untuk UAT.
- [GO_LIVE_GAP_ANALYSIS.md](./GO_LIVE_GAP_ANALYSIS.md) — known issues, risiko go-live, persiapan OOP/INSCANE.

---

## 1. Tujuan UAT

Memastikan VoltHub siap operasional untuk PLN dengan memvalidasi:
1. **Fungsional** — setiap modul bekerja sesuai kebutuhan tiap role (SUPERADMIN, ADMIN, PETUGAS).
2. **Alur kerja end-to-end** — registry aset → inspeksi → HAR → dokumen → laporan PDF; serta alur pelaporan lapangan PETUGAS (Laporan Awal/Akhir) yang **dipertahankan** (lift-and-shift, belum di-rewrite).
3. **RBAC UI** — pengguna hanya melihat/menjalankan aksi yang diizinkan; backend tetap enforcer.
4. **Non-fungsional** — keamanan akses, offline-first PETUGAS, PWA, performa dasar, Bahasa Indonesia.
5. **Kesiapan dashboard operasional** termasuk struktur Device Status (RTU/Rectifier/Battery/Comm Media) yang menunggu integrasi OOP/INSCANE.

## 2. Ruang Lingkup

### 2.1 In-Scope
| Area | Modul | Catatan |
|---|---|---|
| VoltHub `/v2` | Dashboard (role-aware), Master Data (Locations, Feeders, Assets+SIM, Communication Media), Operations (Inspection, HAR, Documents), Reports, Import, AI Search, Administration (Users, Teams, RTUPP, Password Reset) | Fitur baru hasil Phase 1–3 + Dashboard PLN |
| V1 Reporting `/_app` | Laporan Awal, Laporan Akhir, Riwayat, Validasi, Monitoring, Rekap, Export | **Dipertahankan** — PETUGAS experience inti |
| Lintas | Login/sesi, refresh-token rotation, force-update, offline sync, push, PWA/Android | Non-fungsional |

### 2.2 Out-of-Scope (UAT ini)
- **Profil VoltHub** (`/v2/profile`) — **ditunda** (dead-link; gunakan `/profile` V1).
- **Device Status real-time** (Normal/Warning/Down per perangkat) — placeholder; menunggu **integrasi OOP/INSCANE** (lihat GO_LIVE_GAP_ANALYSIS §6–7).
- **Penghapusan / migrasi V1** ke `/` (strangler-fig) — fase setelah UAT.
- Refactor RBAC / penyatuan role `ADMIN` vs `ADMIN_RTUPP` — lihat Known Issue KI-01.

## 3. Environment UAT

| Item | Nilai |
|---|---|
| Mode | **STAGING** (bukan produksi), DB & uploads terisolasi |
| Web/PWA | `https://staging.volthub.pln.co.id` (atau host staging yang ditetapkan) |
| Backend | Express + Prisma + MySQL, `:3001`, Swagger `/api/docs` |
| Android | Build Internal testing (lihat [ANDROID_RELEASE.md](./ANDROID_RELEASE.md)) |
| Data | Hasil seeding sesuai [SEED_DATA_PLAN.md](./SEED_DATA_PLAN.md) |
| Observability | Sentry aktif (env staging) |

> Backend V2 = FROZEN. Jika UAT menemukan cacat backend, catat sebagai defect — perbaikan melalui change-control, bukan ad-hoc.

## 4. User Testing yang Diperlukan (Peserta & Akun)

### 4.1 Peserta (PLN)
| Peran bisnis | Jumlah | Fokus uji |
|---|---|---|
| Operator lapangan (Petugas) | ≥ 2 | Laporan Awal/Akhir, offline, foto, GPS, inspeksi/HAR entry |
| Admin aset / Fasop | ≥ 2 | Master data, inspeksi, HAR, dokumen, reports, import, AI search, dashboard ADMIN |
| Super Admin / IT PLN | 1 | User/Team/RTUPP management, password reset, monitoring, audit |
| Fasilitator UAT (tim dev) | 1 | Pendamping, pencatat defect |

### 4.2 Akun uji (lihat SEED_DATA_PLAN §2)
Semua 4 role backend disediakan agar mapping VoltHub **dan** perilaku V1 dapat diverifikasi:

| Role backend | Label UI VoltHub | Email uji | Dipakai untuk |
|---|---|---|---|
| SUPERADMIN | Super Admin | `super.uat@pln.co.id` | Administration, dashboard SUPERADMIN, semua akses |
| ADMIN | Admin | `admin.uat@pln.co.id` | Asset/Operations/Reports/Import/AI, dashboard ADMIN |
| ADMIN_RTUPP | Admin RTUPP | `adminrtupp.uat@pln.co.id` | Verifikasi perilaku role legacy + scope (lihat KI-01) |
| PETUGAS (USER) | Petugas | `petugas.uat@pln.co.id` | Laporan Awal/Akhir, dashboard PETUGAS |

> **KI-01 (Known Issue):** semantik `ADMIN` vs `ADMIN_RTUPP` berbeda antara V1 (pernah ditukar — ADMIN_RTUPP powerful) dan target VoltHub 3-role (ADMIN = power asset). UAT **mendokumentasikan** perilaku aktual per role; rekonsiliasi RBAC menyusul (di luar scope, lihat GO_LIVE_GAP_ANALYSIS).

## 5. Pendekatan & Jadwal

1. **Smoke test** (Hari 1) — login semua role, dashboard tampil, 1 alur happy-path tiap modul.
2. **Skenario lengkap per role** (Hari 2–4) — jalankan [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) Bagian A–E.
3. **Lintas-role & non-fungsional** (Hari 5) — RBAC negatif, offline, force-update, push, performa.
4. **Triage defect harian** — fasilitator + dev; perbaikan masuk re-test.
5. **Sign-off** — keputusan UAT berdasarkan Exit Criteria (§7).

## 6. Entry Criteria (boleh mulai UAT bila)
- [ ] Build staging ter-deploy; `npm run build` + `npm run typecheck` FE hijau; BE `npm run build` hijau.
- [ ] Seed data UAT ter-load (SEED_DATA_PLAN) — termasuk hirarki aset, inspeksi, HAR, dokumen, sampel import.
- [ ] 4 akun uji aktif; kredensial dibagikan aman.
- [ ] Swagger `/api/docs` dapat diakses untuk verifikasi kontrak.
- [ ] Sentry staging menerima event.

## 7. Exit Criteria (UAT dinyatakan lulus bila)
- [ ] **100% Critical Path** ([UAT_CHECKLIST.md](./UAT_CHECKLIST.md) Bagian E) ✅.
- [ ] Tidak ada defect **Critical** atau **High** yang terbuka.
- [ ] Defect **Medium/Low** terdokumentasi dengan rencana (boleh diterima dengan catatan).
- [ ] Semua role menyelesaikan skenario utamanya.
- [ ] Known Issues (KI-xx) ditinjau & diterima stakeholder PLN.
- [ ] Berita Acara UAT ditandatangani.

## 8. Klasifikasi Defect (Severity)
| Severity | Definisi | Contoh | Blok go-live? |
|---|---|---|---|
| **Critical** | Data hilang/rusak, tidak bisa login, alur inti mati | Laporan offline hilang; approve gagal total | Ya |
| **High** | Fungsi penting gagal tanpa workaround | Generate PDF error; RBAC bocor (aksi terlarang berhasil) | Ya |
| **Medium** | Fungsi gagal tapi ada workaround | Filter list tidak akurat | Tidak (dengan catatan) |
| **Low** | Kosmetik / minor | Label typo, spacing | Tidak |

## 9. Risiko Pelaksanaan UAT
- Data uji aset tidak cukup variatif → skenario kritis (Critical Assets, trend) kurang teruji → mitigasi: SEED_DATA_PLAN menetapkan minimum.
- Device Status masih placeholder → ekspektasi penguji perlu diluruskan (bukan defect; lihat GO_LIVE_GAP_ANALYSIS §6–7).
- Kebingungan role ADMIN/ADMIN_RTUPP (KI-01) → fasilitator menjelaskan di awal.

## 10. Sign-off
| Peran | Nama | Tanda tangan | Tanggal |
|---|---|---|---|
| Fasilitator UAT (Dev) | | | |
| Perwakilan PLN (Bisnis) | | | |
| Perwakilan PLN (IT) | | | |

**Keputusan UAT:** ☐ DITERIMA  ☐ DITERIMA DENGAN CATATAN  ☐ DITOLAK
