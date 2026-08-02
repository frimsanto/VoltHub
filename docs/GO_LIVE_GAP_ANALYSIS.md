# VoltHub — Go-Live Gap Analysis

> **Tujuan:** memetakan kesenjangan antara kondisi Feature-Complete saat ini dan kesiapan operasional (go-live), termasuk known issues, risiko, dan persiapan integrasi **OOP** & **INSCANE**.
> **Tanggal:** 2026-06-04 · **Scope:** analisa & rekomendasi — tidak ada fitur baru, tidak ada refactor RBAC, tidak ada penghapusan V1.
> Pendamping: [UAT_PLAN.md](./UAT_PLAN.md) · [UAT_CHECKLIST.md](./UAT_CHECKLIST.md) · [SEED_DATA_PLAN.md](./SEED_DATA_PLAN.md) · operasional: [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md), [BACKUP.md](./BACKUP.md), [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md), [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

---

## 1. Status Ringkas

| Lapisan | Status | Catatan |
|---|---|---|
| Backend V2 (`/api/v1`) | ✅ Selesai (Sprints 1–6), 11 modul, Swagger 29 path | FROZEN |
| Frontend VoltHub (`/v2`) | ✅ Master Data + Operations + Reports/Import/AI/Administration + Dashboard role-aware | Profile ditunda |
| V1 Reporting (`/_app`) | ✅ Dipertahankan (PETUGAS inti) | Belum dimigrasi ke `/` |
| Dashboard operasional | ✅ Role-aware | Device Status = placeholder (OOP/INSCANE) |
| Production hardening | ✅ Sebagian (Sentry, backup/DR, security, CI/CD docs ada) | Verifikasi di staging |

---

## 2. Known Issues (Point 4)

| ID | Isu | Dampak | Severity | Rekomendasi |
|---|---|---|---|---|
| **KI-01** | Semantik `ADMIN` vs `ADMIN_RTUPP` belum selaras (V1 pernah ditukar; target VoltHub 3-role ADMIN=power) | Kebingungan hak akses; salah ekspektasi | High | Putuskan mapping resmi **sebelum** swap root. Tidak di-refactor sekarang (guardrail). UAT catat perilaku aktual (D5–D7). |
| **KI-02** | Scope per-RTUPP **tidak di-enforce** pada model V2 (tak ada `rtuppId` FK di assets/inspection/HAR/dll.) | `ADMIN_RTUPP` melihat **semua** aset lintas-RTUPP, bukan hanya wilayahnya | High (keamanan data bila multi-RTUPP) | Keputusan freeze: tambah scoping (perubahan backend ber-change-control) atau batasi go-live ke 1 RTUPP. |
| **KI-03** | `/v2/profile` belum dibuat (dead-link) | Menu Profile VoltHub 404 | Low | Ditunda (sesuai instruksi); sementara arahkan ke `/profile` V1. |
| **KI-04** | Nav VoltHub menampilkan Operations (Inspection/HAR/Documents) ke semua role (capability `*.create` = any-auth) | PETUGAS bisa membuat inspeksi/HAR/dokumen via VoltHub | Medium | Keputusan bisnis: apakah PETUGAS boleh entry Operations? Bila tidak, gate nav (UI saja). |
| **KI-05** | Dua aplikasi berdampingan; root `/` masih → dashboard V1 | Pengguna bisa salah masuk shell; cross-link antar-shell | Medium | Swap root ke VoltHub = fase pasca-UAT (strangler-fig, lihat VOLTHUB_MIGRATION_AUDIT). |
| **KI-06** | Device Status real-time (Normal/Warning/Down per perangkat) = placeholder | Dashboard monitoring belum lengkap | Medium | Integrasi OOP/INSCANE (§6–7). Jumlah perangkat sudah real. |
| **KI-07** | `npm audit` melaporkan kerentanan dependency | Risiko keamanan | Medium | Jalankan `npm audit fix` + review sebelum go-live. |
| **KI-08** | Dashboard menghitung total via banyak request `limit=1`; trend digrup dari 100 baris terbaru (bukan seluruh histori) | Beban request; trend tidak mencakup data > 100 baris | Low | Cukup untuk skala awal; pertimbangkan endpoint agregat khusus bila volume besar. |
| **KI-09** | Modal Generate Report hanya melistkan 100 inspeksi/HAR terbaru sebagai sumber | Sumber lama tak terpilih dari modal | Low | Generate dari halaman detail tetap tersedia (tanpa batas). |
| **KI-10** | Seed default belum berisi data domain V2 | UAT kosong tanpa seeding | — | Diselesaikan oleh [SEED_DATA_PLAN.md](./SEED_DATA_PLAN.md). |

> Semua KI ditinjau saat sign-off UAT (Exit Criteria). KI High wajib ada keputusan/penerimaan tertulis.

---

## 3. Risiko Go-Live (Point 5)

| ID | Risiko | Dampak | Prob. | Mitigasi |
|---|---|---|---|---|
| R1 | **Migrasi data aset nyata** belum dilakukan (registry kosong) | Aplikasi tak berguna tanpa data PLN | Tinggi | Gunakan Import Engine (sudah teruji) dengan **format xlsx final PLN**; siapkan dry-run di staging. |
| R2 | **Kebocoran visibilitas lintas-RTUPP** (KI-02) | Data RTUPP lain terlihat | Sedang | Batasi go-live awal ke 1 RTUPP, atau scoping backend via change-control. |
| R3 | **Ekspektasi monitoring real-time** (Device Status) tak terpenuhi | Stakeholder mengira status RTU live | Sedang | Komunikasikan placeholder + roadmap OOP/INSCANE (§6–7). |
| R4 | **Pengguna mendarat di shell V1** (KI-05) | Kebingungan, fitur ganda | Sedang | Pelatihan + URL jelas; rencanakan swap root pasca-UAT. |
| R5 | **Performa pada volume nyata** belum diuji | Lambat saat data besar | Sedang | Uji k6/load di staging dengan data mendekati produksi. |
| R6 | **RBAC ambiguitas** (KI-01) → salah pemberian akses | Hak akses keliru | Sedang | Selesaikan mapping role + uji D-series sebelum go-live. |
| R7 | **Backup/DR belum diverifikasi di staging** | Kehilangan data saat insiden | Rendah-Sedang | Jalankan UAT D-series backup/restore (lihat BACKUP.md/DISASTER_RECOVERY.md). |
| R8 | **Dependency rentan** (KI-07) | Eksploitasi | Rendah | `npm audit fix` + re-test. |

---

## 4. Kesenjangan Fungsional (Gaps)

| Area | Gap | Status |
|---|---|---|
| Profile VoltHub | Belum ada (`/v2/profile`) | Ditunda |
| Device Status real-time | Sumber OOP/INSCANE belum tersambung | §6–7 |
| Per-RTUPP scoping V2 | Tidak ada di model | Keputusan freeze (KI-02) |
| Root `/` = VoltHub | Masih V1 | Pasca-UAT |
| Notifikasi VoltHub (Operations) | Push hanya untuk reporting V1 | Belum (tidak diminta) |

---

## 5. Persiapan Integrasi OOP (Point 6)

**Konteks:** "OOP" muncul sebagai salah satu status operasional gardu pada Laporan Akhir V1 (`statusSebelum/statusSesudah` ∈ `APPDISK | GAGAL_RC | OOP | INSCAN | LAIN_LAIN`). Untuk dashboard operasional, OOP diharapkan menjadi salah satu **sumber status perangkat** (RTU/Rectifier/Battery/Comm Media: Normal/Warning/Down). **Format file/feed final dari PLN belum tersedia** → integrasi ditunda (keputusan project).

**Kesiapan frontend (sudah ada):**
- `DeviceStatusPanel` ([FE/src/features/v2/dashboard/widgets.tsx](../FE/src/features/v2/dashboard/widgets.tsx)) sudah menerima prop `status: DeviceLiveStatus { normal, warning, down }`; saat `null` → render placeholder "menunggu integrasi OOP/INSCANE". **Tinggal mengisi `status` saat data tersedia — tanpa refactor UI.**
- Jumlah perangkat per kategori sudah real (dari registry aset).

**Langkah integrasi (saat format tersedia):**
1. **Dapatkan kontrak data** dari PLN: format file (xlsx/CSV) atau API OOP, frekuensi update, identitas perangkat (kode aset / RTU ID) untuk pemetaan ke `assets`.
2. **Definisikan mapping** status OOP → `DeviceLiveStatus` (mis. OOP/GAGAL_RC → Down/Warning, APPDISK normal, dst.).
3. **Backend (change-control, additive):** tambah endpoint mis. `GET /api/v1/dashboard/device-status` yang mengembalikan agregat `{ rtu, rectifier, battery, commMedia: DeviceLiveStatus }`, atau importer feed OOP.
4. **Frontend:** buat hook `useDeviceLiveStatus()` dan teruskan ke `DeviceStatusPanel.status` (placeholder digantikan otomatis).
5. **Uji** kecocokan identitas perangkat & ambang status; tambahkan ke UAT siklus integrasi.

**Prasyarat (blocker):** format file/feed OOP final dari PLN.

---

## 6. Persiapan Integrasi INSCANE (Point 7)

**Konteks:** "INSCAN/INSCANE" juga merupakan nilai status operasional pada Laporan Akhir V1 dan diharapkan menjadi sumber data status/inventaris perangkat untuk monitoring. Seperti OOP, **format file final belum tersedia** → ditunda.

**Kesiapan & langkah:** identik kerangkanya dengan OOP (§5) — keduanya mengisi struktur `DeviceLiveStatus` yang sama dan/atau memperkaya **Critical Assets**:
1. Dapatkan **format file INSCANE** + kamus field (identitas perangkat, status, timestamp).
2. Mapping status INSCANE → `DeviceLiveStatus` dan/atau penanda aset kritis.
3. Backend additive: importer/endpoint feed INSCANE (boleh berbagi endpoint device-status dengan OOP bila kompatibel).
4. Frontend: feed ke `DeviceStatusPanel` + (opsional) sumber tambahan untuk widget **Critical Assets**.
5. UAT integrasi terpisah.

**Catatan penyatuan:** disarankan **satu kontrak `DeviceLiveStatus` + satu endpoint device-status** yang dapat menerima sumber OOP maupun INSCANE, sehingga panel dashboard tidak perlu diubah dua kali. Tetapkan prioritas/aturan rekonsiliasi bila kedua sumber melaporkan perangkat yang sama.

**Prasyarat (blocker):** format file/feed INSCANE final dari PLN.

---

## 7. Rekomendasi Urutan Menuju Go-Live

1. **Seed staging** (SEED_DATA_PLAN) → jalankan **UAT** (UAT_PLAN + UAT_CHECKLIST).
2. **Putuskan KI-01 & KI-02** (role mapping + scoping) — keputusan tertulis stakeholder.
3. **`npm audit fix`** (KI-07) + re-test; verifikasi **backup/restore** di staging (R7).
4. **Uji performa** dengan data mendekati produksi (R5).
5. **Migrasi data aset** via Import Engine memakai **format xlsx final PLN** (R1) — dry-run dulu.
6. **Komunikasikan** status placeholder Device Status + roadmap OOP/INSCANE (R3).
7. **Go/No-Go** mengacu Exit Criteria UAT + penerimaan Known Issues.
8. **Pasca-go-live:** integrasi OOP/INSCANE (§5–6), Profile VoltHub, dan swap root `/`→VoltHub (strangler-fig, KI-05).

---

## 8. Keputusan Go-Live
| Item | Keputusan | Penanggung jawab | Tanggal |
|---|---|---|---|
| Mapping role (KI-01) | | | |
| Scoping RTUPP (KI-02) | | | |
| Lingkup go-live (1 RTUPP / multi) | | | |
| Go / No-Go | ☐ GO ☐ GO-with-notes ☐ NO-GO | | |
