# VOLTHUB MIGRATION AUDIT

> **Status dokumen:** Audit & Rekomendasi (read-only). Tidak ada kode yang diubah, tidak ada file yang dihapus.
> **Tanggal:** 2026-06-04
> **Ruang lingkup:** Frontend existing (`FE/`) — V1 reporting (legacy) + V2 Asset Management (in-progress), dalam rangka konsolidasi menjadi **VoltHub** sebagai aplikasi utama di route `/`.
> **Keputusan arsitektur (final):** VoltReport V1 tidak pernah go-live operasional. VoltHub adalah evolusi resmi. Target akhir: `/` = VoltHub (bukan `/v2` permanen). Audit ini mendahului migrasi/penghapusan apa pun.

---

## 0. Ringkasan Eksekutif (TL;DR)

| Aspek | Temuan |
|---|---|
| **Dua aplikasi hidup berdampingan** | `/_app/*` = VoltReport V1 (reporting lapangan), `/v2/*` = VoltHub (Asset Management). Keduanya share satu router, satu auth store, satu design system. |
| **VoltHub belum lengkap** | Hanya **Master Data** (Locations, Feeders, Assets, Communication Media) + Dashboard yang punya route nyata. Inspection, HAR, Documents, Reports, Import, AI Search, Administration, Profile **masih dead-link di sidebar V2** (route belum dibuat) — padahal backend-nya **sudah 100% ada** (11 modul `/api/v1`). |
| **Backend siap, frontend tertinggal** | Backend V2 (Sprints 1–6) DONE & teraudit. Gap utama bukan di server — gap ada di FE V2. |
| **PETUGAS experience adalah aset paling berharga & paling berisiko** | Form Laporan Awal/Akhir sangat matang: offline-first queue, autosave draft, GPS, kamera native, multi-foto, WhatsApp template generator, personil snapshot. **Tidak boleh hilang** saat migrasi. |
| **Role mismatch perlu diselesaikan** | V1 punya 4 role (`petugas/admin/admin_rtupp/superadmin`); target final 3 role (`SUPERADMIN/ADMIN/PETUGAS`). `ADMIN_RTUPP` harus dipetakan ulang. |
| **Rekomendasi utama** | **Migrasi bertahap, bukan big-bang.** Jadikan VoltHub shell tunggal yang memuat *modul* PETUGAS (reporting) + modul ADMIN (asset) + modul SUPERADMIN (admin), bukan dua aplikasi terpisah. |

---

## 1. Struktur Route Saat Ini

Router: **TanStack Router (file-based)** di `FE/src/routes/`. Dua namespace utama: layout `_app` (V1) dan namespace `v2` (VoltHub).

### 1.1 Route Publik / Auth
| Route | File | Fungsi |
|---|---|---|
| `/` | [index.tsx](../FE/src/routes/index.tsx) | Redirect → `/dashboard` (authed) atau `/login` |
| `/login` | [login.tsx](../FE/src/routes/login.tsx) | Login |
| `/change-password` | [change-password.tsx](../FE/src/routes/change-password.tsx) | Wajib ganti password first-login |
| `/unauthorized` | [unauthorized.tsx](../FE/src/routes/unauthorized.tsx) | 403 |
| `/404` | [404.tsx](../FE/src/routes/404.tsx) | Not found |

### 1.2 Route V1 (`_app` layout — [_app.tsx](../FE/src/routes/_app.tsx))
Guard: `requireAuth()` + redirect ke `/change-password` jika `mustChangePassword`. Layout = Sidebar V1 + Topbar.

| Route | File | Modul | Konsumen utama |
|---|---|---|---|
| `/dashboard` | [_app.dashboard.tsx](../FE/src/routes/_app.dashboard.tsx) | Dashboard reporting | semua role |
| `/laporan/create` | [_app.laporan.create.tsx](../FE/src/routes/_app.laporan.create.tsx) | Pemilih jenis laporan | PETUGAS |
| `/laporan-awal` | [_app.laporan-awal.tsx](../FE/src/routes/_app.laporan-awal.tsx) | **Form Laporan Awal** | PETUGAS |
| `/laporan-akhir` | [_app.laporan-akhir.tsx](../FE/src/routes/_app.laporan-akhir.tsx) | **Form Laporan Akhir** | PETUGAS |
| `/laporan-awal/$id` | [_app.laporan-awal.$id.tsx](../FE/src/routes/_app.laporan-awal.$id.tsx) | Detail Laporan Awal | semua |
| `/laporan-akhir/$id` | [_app.laporan-akhir.$id.tsx](../FE/src/routes/_app.laporan-akhir.$id.tsx) | Detail Laporan Akhir | semua |
| `/history` | [_app.history.tsx](../FE/src/routes/_app.history.tsx) | Riwayat + filter + pagination | semua |
| `/monitoring` | [_app.monitoring.tsx](../FE/src/routes/_app.monitoring.tsx) | Monitoring laporan | admin_rtupp/superadmin |
| `/validasi` | [_app.validasi.tsx](../FE/src/routes/_app.validasi.tsx) | Approve/Reject laporan | admin_rtupp/superadmin |
| `/rekap` | [_app.rekap.tsx](../FE/src/routes/_app.rekap.tsx) | Rekap Awal (grid spreadsheet) | admin tier |
| `/rekap-akhir` | [_app.rekap-akhir.tsx](../FE/src/routes/_app.rekap-akhir.tsx) | Rekap Akhir (grid spreadsheet) | admin tier |
| `/export` | [_app.export.tsx](../FE/src/routes/_app.export.tsx) | Export XLSX/ZIP | admin_rtupp/superadmin |
| `/users` | [_app.users.tsx](../FE/src/routes/_app.users.tsx) | User management | admin_rtupp/superadmin |
| `/team` | [_app.team.tsx](../FE/src/routes/_app.team.tsx) | Team management | superadmin |
| `/rtupp` | [_app.rtupp.tsx](../FE/src/routes/_app.rtupp.tsx) | RTUPP management | superadmin |
| `/profile` | [_app.profile.tsx](../FE/src/routes/_app.profile.tsx) | Profil + ganti password | semua |

### 1.3 Route V2 / VoltHub (`v2` namespace — [v2.tsx](../FE/src/routes/v2.tsx))
Guard: `requireV2Auth()`. Layout = `V2AppLayout` + `V2Sidebar`.

| Route | File | Status |
|---|---|---|
| `/v2` | [v2.index.tsx](../FE/src/routes/v2.index.tsx) | ✅ Dashboard (4 stat card) |
| `/v2/locations` (+`/$id`) | [v2.locations.tsx](../FE/src/routes/v2.locations.tsx) | ✅ List/CRUD/Detail |
| `/v2/feeders` (+`/$id`) | [v2.feeders.tsx](../FE/src/routes/v2.feeders.tsx) | ✅ List/CRUD/Detail |
| `/v2/assets` (+`/$id`) | [v2.assets.tsx](../FE/src/routes/v2.assets.tsx) | ✅ List/CRUD/Detail (+SIM cards) |
| `/v2/communication-media` (+`/$id`) | [v2.communication-media.tsx](../FE/src/routes/v2.communication-media.tsx) | ✅ List/CRUD/Detail |

> ⚠️ **TEMUAN KRITIS — Dead links di V2 Sidebar.** [nav.ts](../FE/src/lib/v2/nav.ts) mendeklarasikan menu untuk `/v2/inspections`, `/v2/har`, `/v2/documents`, `/v2/reports`, `/v2/imports`, `/v2/ai-search`, `/v2/users`, `/v2/teams`, `/v2/rtupp`, `/v2/profile` — **tidak satu pun punya file route**. [V2Sidebar.tsx](../FE/src/components/v2/V2Sidebar.tsx) sengaja me-relax tipe `to` (`item.to as never`) sehingga link dirender tanpa error tipe, tetapi klik akan jatuh ke 404. Backend untuk semua modul ini **sudah ada** (lihat §1.4).

### 1.4 Backend V2 (referensi — sudah lengkap, FROZEN)
`BE/src/modules/`: `locations`, `feeders`, `assets`, `asset-sim-cards`, `communication-media`, `inspections`, `har`, `documents`, `reports`, `imports`, `ai` — 11 modul, mounted di `/api/v1`, **29 Swagger paths** di `/api/docs`. **Kesimpulan: jurang ada di frontend V2, bukan backend.**

---

## 2. Struktur Menu Saat Ini

### 2.1 Menu V1 — per role ([Sidebar.tsx](../FE/src/components/Sidebar.tsx))
Menu disusun per role, item yang route-nya tidak diizinkan tidak dimunculkan (no orphan).

- **petugas:** Dashboard · Laporan {Buat Laporan, Riwayat Saya} · Profile
- **admin_rtupp** (admin global "kuat"): Dashboard · Laporan {Monitoring, Validasi, Riwayat} · Analitik {Rekap Awal, Rekap Akhir} · Manajemen {User} · Export · Profile
- **admin** (RTUPP-scoped, read-only): Dashboard · Laporan {Riwayat} · Analitik {Rekap Awal, Rekap Akhir} · Profile
- **superadmin:** Dashboard · Laporan {Monitoring, Validasi, Riwayat} · Analitik {Rekap Awal, Rekap Akhir} · Manajemen {User, Team, RTUPP} · Export · Profile

> ⚠️ **Catatan penting tentang `admin` vs `admin_rtupp`:** komentar di kode menyatakan **`ADMIN_RTUPP` adalah admin global yang kuat** (write, validate, monitoring, user-mgmt, export), sedangkan **`ADMIN` adalah role RTUPP-scoped read-only.** Ini **kebalikan** dari intuisi penamaan dan **bertentangan** dengan rencana role final (di mana ADMIN = power user asset). Konflik ini WAJIB diselesaikan sebelum migrasi (lihat §9 Role Structure).

### 2.2 Menu V2 / VoltHub ([nav.ts](../FE/src/lib/v2/nav.ts))
Gating via capability matrix [rbac.ts](../FE/src/lib/v2/rbac.ts).
- Dashboard · Master Data {Locations, Feeders, Assets, Communication Media} · Operations {Inspection, HAR, Documents} · Reports · Import (`imports.run`) · AI Search · Administration (`admin.access`) {Users, Teams, RTUPP} · Profile

Hanya Dashboard + Master Data yang fungsional; sisanya dead-link.

---

## 3. Komponen Reusable yang Masih Layak Dipakai

### 3.1 Design System / Primitives — **PERTAHANKAN PENUH**
shadcn/ui lengkap (47 komponen) di [FE/src/components/ui/](../FE/src/components/ui/): button, card, dialog, sheet, select, table, tabs, form, calendar, chart, sidebar, dll. Stack: Tailwind v4 + Radix + CVA. **Fondasi UI VoltHub tetap pakai ini — zero rewrite.**

### 3.2 Komponen V2 / VoltHub — **INTI MASA DEPAN** ([components/v2/](../FE/src/components/v2/))
| Komponen | Peran |
|---|---|
| `V2AppLayout`, `V2Sidebar` | Shell + navigasi VoltHub |
| `DataTable` | Tabel berbasis TanStack Table — tulang punggung semua list modul |
| `PageHeader`, `ListToolbar`, `RowActions`, `InfoGrid` | Pola halaman list/detail standar |
| `EntityFormModal`, `ConfirmDeleteDialog`, `fields.tsx` | CRUD modal + field RHF/Zod (TextField, SelectField, NumberField, SwitchField, TextareaField) |
| `RoleGate`, `StatusBadge` | Gating UI + badge status |
| `createResource.ts` ([features/v2/](../FE/src/features/v2/)) | Factory query/mutation generik (List/Get/Create/Update/Delete) + integrasi types generated |

**Ini adalah kerangka yang akan dipakai untuk membangun modul VoltHub yang belum ada (Inspection/HAR/Documents/Reports/Import/AI).**

### 3.3 Infrastruktur Lintas-Versi — **PERTAHANKAN**
| Aset | Lokasi | Catatan |
|---|---|---|
| Auth store (zustand + secure storage + refresh-token rotation) | [stores/auth.ts](../FE/src/stores/auth.ts) | Satu-satunya sumber sesi; dipakai V1 & V2 |
| Axios client (interceptor refresh) | [lib/api/client.ts](../FE/src/lib/api/client.ts) | V2 reuse client yang sama dengan prefix `/v1` |
| Generated API types | [lib/api/v2/types.gen.ts](../FE/src/lib/api/v2/) | `npm run gen:api` dari `docs/openapi.yaml` |
| Native (Capacitor) | [lib/native/](../FE/src/lib/native/) | geolocation, camera, push — **dipakai PETUGAS** |
| Offline sync queue | [lib/offline/](../FE/src/lib/offline/) | `createLaporanAwalOrQueue` dll — **kritis untuk PETUGAS** |
| PWA (vite-plugin-pwa) | `OfflineIndicator`, `PWAUpdatePrompt`, `ForceUpdateGate` | Multi-platform |
| Sentry, ErrorBoundary | [lib/sentry.ts](../FE/src/lib/sentry.ts) | Observability |

### 3.4 Komponen Form PETUGAS — **PERTAHANKAN & MIGRASIKAN** ([FormParts.tsx](../FE/src/components/FormParts.tsx))
`Section`, `Field`, **`UploadZone`** (drag-drop multi-file foto+video, thumbnail, progress, kamera native), `FormToolbar`. Ini engine UX form lapangan — lihat §8.

---

## 4. Komponen yang Harus Dipensiunkan (kandidat — tunda eksekusi)

> Semua "pensiun" di bawah adalah **kandidat**, bukan perintah hapus. Eksekusi hanya setelah fungsi setara tersedia di VoltHub dan UAT lulus.

| Komponen / artefak | Alasan | Prasyarat sebelum dipensiunkan |
|---|---|---|
| `index.tsx` redirect ke `/dashboard` (V1) | Target `/` = VoltHub | VoltHub shell siap sebagai root |
| Namespace route `/v2` | Sementara; target `/` | Setelah swap root (§10) |
| `Sidebar.tsx` (V1) | Digantikan navigasi VoltHub terpadu | Menu PETUGAS/ADMIN/SUPERADMIN VoltHub final |
| Branding "VoltReport / Monitoring System" di V1 Sidebar | Sudah ada `brand.ts` (VoltHub) | Konsolidasi shell |
| `mockData.ts` | Data dummy | Verifikasi tak ada import produktif |
| Dashboard V2 saat ini (`v2.index.tsx`) | Hanya 4 count card; tidak operasional | Diganti dashboard operasional PLN (§11) |

**Belum boleh disentuh (masih dibutuhkan):** seluruh form & flow PETUGAS, history, validasi, monitoring, rekap, export, users/team/rtupp — sampai fungsinya tersedia di dalam VoltHub.

---

## 5. Dependency yang Masih Diperlukan
Dari [package.json](../FE/package.json):

- **Core:** react 19, react-dom, @tanstack/react-router, @tanstack/react-query, @tanstack/react-table, vite 7, typescript
- **UI:** seluruh `@radix-ui/*`, tailwindcss v4 + @tailwindcss/vite, class-variance-authority, clsx, tailwind-merge, tw-animate-css, lucide-react, sonner, vaul, cmdk, embla-carousel, input-otp, react-resizable-panels
- **Form/validasi:** react-hook-form, @hookform/resolvers, zod
- **Data viz:** recharts (dashboard) — **akan makin penting** untuk dashboard operasional
- **HTTP/state:** axios, zustand, date-fns
- **Native/PWA:** seluruh `@capacitor/*` (app, camera, geolocation, network, preferences, push-notifications), vite-plugin-pwa
- **Observability:** @sentry/react, @sentry/vite-plugin
- **Dialog UX:** sweetalert2 (dipakai berat di form PETUGAS)
- **Dev/contract:** openapi-typescript (`gen:api`), @playwright/test, eslint/prettier toolchain

## 6. Dependency yang Tidak Diperlukan (kandidat tinjau)
Tidak ditemukan dependency yang jelas-jelas yatim dari package.json. Kandidat **tinjau** (bukan hapus otomatis):

| Paket | Catatan |
|---|---|
| `sweetalert2` | Tumpang tindih dengan `sonner` (toast) + `alert-dialog`. Dipakai intens di form PETUGAS → **jangan hapus** sampai UX dialog VoltHub seragam. Kandidat konsolidasi jangka panjang. |
| `embla-carousel-react`, `react-resizable-panels`, `input-otp`, `vaul` | Bagian paket shadcn standar; verifikasi pemakaian aktual sebelum prune. |
| `mockData` (bukan dep, file) | Lihat §4. |

> Rekomendasi: jalankan analisis tree-shaking/`knip`/`depcheck` sebagai langkah terpisah sebelum prune apa pun. **Audit ini tidak menghapus dependency.**

---

## 7. Risk Analysis

| # | Risiko | Dampak | Prob. | Mitigasi |
|---|---|---|---|---|
| R1 | **Kehilangan fitur PETUGAS** (offline queue, autosave, GPS, kamera, WA template, personil snapshot) saat migrasi | 🔴 Kritis — petugas lapangan tak bisa kerja/sinkron | Sedang | Migrasi modul PETUGAS *as-is* ke shell VoltHub TANPA menulis ulang logic; hanya bungkus layout. Lihat §8. |
| R2 | **Dead-link V2 menyesatkan** (menu ada, route tidak) | 🟠 Tinggi — pengguna klik → 404, persepsi "rusak" | Tinggi (sekarang) | Sembunyikan menu yang belum ada route-nya (feature flag per modul) ATAU prioritaskan pembangunan route. |
| R3 | **Konflik semantik role** `admin` vs `admin_rtupp` (V1 terbalik dari intuisi) + target 3-role | 🔴 Kritis — salah mapping = bocor hak akses | Sedang | Definisikan tabel mapping eksplisit (§9) + uji RBAC sebelum potong role lama. Backend RBAC tetap enforcer. |
| R4 | **Dua sumber kebenaran navigasi** (`Sidebar.tsx` vs `nav.ts`) | 🟡 Sedang — drift menu | Tinggi | Satukan jadi satu model nav VoltHub berbasis role+capability. |
| R5 | **Data Laporan Awal/Akhir vs domain Asset** belum terhubung | 🟠 Tinggi — laporan PETUGAS tidak nyambung ke aset (RTU/Rectifier/Battery) di VoltHub | Sedang | Petakan field SCADA Laporan Akhir → entitas Asset/CommMedia/Inspection (lihat §8.4). Keputusan domain (jangan ubah BE frozen tanpa approval). |
| R6 | **Big-bang swap `/` ke VoltHub** mematahkan deep-link & PWA cache lama | 🟠 Tinggi | Sedang | Swap bertahap + redirect kompatibilitas + bump versi PWA (`ForceUpdateGate`). |
| R7 | **ADMIN_RTUPP scope tidak di-enforce di model V2** (tidak ada `rtuppId` FK) | 🟡 Sedang | — (warning eksisting) | Keputusan freeze backend; sampai itu, batasi di UI + dokumentasikan. |
| R8 | **Mismatch role set FE** (`rbac.ts` V2 punya 4 role termasuk ADMIN_RTUPP/USER) vs target 3-role | 🟡 Sedang | Tinggi | Selaraskan `toV2Role` + capability matrix ke 3 role final. |

---

## 8. PETUGAS EXPERIENCE (PRIORITAS UTAMA)

Petugas lapangan adalah pengguna terbanyak & paling sensitif. Tujuan migrasi: **petugas merasa memakai aplikasi yang sama familiarnya**, meski arsitektur di belakang berubah jadi VoltHub.

### 8.1 Laporan Awal — audit detail ([_app.laporan-awal.tsx](../FE/src/routes/_app.laporan-awal.tsx))

**Field yang digunakan** (schema Zod `laporanAwalSchema`):
- *Informasi Pekerjaan:* `hari` (auto, readonly), `tanggal` (date), `nomorSPJ`*, `up3`*, `pekerjaan`* (min 5), `lokasiGardu`* (+ tombol **Ambil GPS**)
- *Informasi Tim* (auto dari login, readonly): RTUPP, Team
- *Tim Pelaksana:* `pengawasPekerjaan`, `pengawasManuver`, `pengawasK3`, `nomorWP`*
- *Personil Bertugas:* multi-select dari master personil (scoped RTUPP, active-only) → disimpan sebagai **`personilSnapshot[]`** (audit trail: personilId, nama, jabatan, rtuppId, rtuppName) + `jumlahPersonil`
- *Safety Checklist (K3):* `wpJsahirarcSop`, `kondisiPersonil` (SEHAT/KURANG_SEHAT/BUTUH_PERHATIAN), `potensiBahayaDijelaskan`, `apdLengkap`, `asuransiKetenagakerjaan`, `berdoaSebelumBekerja`
- *Keterangan Tambahan (legacy):* potensiBahaya, pengendalianRisiko, apd, rambuKerja, asuransiTK
- *Dokumentasi:* multi-file (foto+video)

**Workflow:** isi form → autosave draft (localStorage, debounce 3s, badge status) → submit (`status: PENDING`) → `createLaporanAwalOrQueue` (online: POST; offline: queue) → upload dokumentasi pakai `result.id` → invalidate `reports`+`dashboard` → redirect `/history`.

**Upload foto:** `UploadZone` → state `dokumentasiFiles` → diunggah **setelah** laporan dibuat via `uploadDocumentationAllInOne("laporan-awal", id, files)`. Offline: foto ikut ke queue.

**Validasi:** Zod resolver; `onInvalid` → SweetAlert "Form Belum Lengkap" dgn pesan error pertama.

**UX khusus:** badge draft status, GPS append `[GPS: lat,long]` ke lokasi, **WhatsApp template generator** (`formatWhatsAppMessage` → preview dialog → Salin / Share `wa.me`), kamera native (Capacitor), reset form pasca-submit.

### 8.2 Laporan Akhir — audit detail ([_app.laporan-akhir.tsx](../FE/src/routes/_app.laporan-akhir.tsx))

**Field** (schema `laporanAkhirSchema`, 8 section):
1. *Informasi Pekerjaan:* `tanggalSelesai`*, `jenisPekerjaan`*
2. *Lokasi:* `up3`*, `rtupp`, `gardu`*
3. *Informasi Perangkat (teknis):* `asdu` (1–10 digit), `ipModem/ipRTU/ipSIM1/ipSIM2/ipGTWIconPlus/ipWAN` (validasi regex IPv4)
4. *Aset SCADA:* `rtuNama/rtuType`*, `mediaNama/mediaType`*, `rectifierNama/rectifierType`*, `bateraiNama/bateraiType`*
5. *Detail Pekerjaan:* `langkahPekerjaan`* (min 10), `hasilPekerjaan`* (min 5)
6. *Catatan Perangkat:* `catatanRTU/Media/Rectifier` (NORMAL/RUSAK), `catatanBaterai` (NORMAL/HATI_HATI/RUSAK), `catatanLain`
7. *Status:* `statusSebelum/statusSesudah` (APPDISK/GAGAL_RC/OOP/INSCAN/LAIN_LAIN), `statusPekerjaan` (SELESAI/PARSIAL/GAGAL)
8. *Penutup:* `pengawas`*, `pelaksana`* + *Dokumentasi & Lampiran*

**Workflow/upload/validasi:** sama polanya dengan Laporan Awal — autosave draft, offline queue (`createLaporanAkhirOrQueue`), upload (`uploadLaporanAkhirDocumentation`), WA template (`formatWhatsAppMessageLaporanAkhir`, gaya "Yth. ASMAN FAS OP").

### 8.3 Insight kunci PETUGAS
- Form ini **sudah production-grade** untuk lapangan: offline-first, autosave, GPS, kamera, validasi domain PLN (IP, ASDU, enum kondisi), WA template, audit personil. **Mahal & berisiko ditulis ulang.**
- UX engine (`Section/Field/UploadZone/FormToolbar`) generik & reusable.

### 8.4 PETUGAS EXPERIENCE MIGRATION

**Prinsip:** *lift-and-shift, bukan rewrite.* Pindahkan modul reporting ke dalam shell VoltHub sebagai **modul "Laporan"** tanpa mengubah schema form, logic submit, offline queue, atau API V1.

**Strategi konkret:**
1. **Pertahankan API V1 reporting** (`/api/laporan-awal`, `/api/laporan-akhir`, upload, personil, history) selama modul PETUGAS hidup — JANGAN paksa ke `/api/v1` asset sebelum jembatan data dibuat.
2. **Bungkus, jangan tulis ulang:** render `LaporanAwal`/`LaporanAkhir`/`History` di dalam `V2AppLayout` (shell VoltHub) → familiar bagi petugas, branding VoltHub.
3. **Navigasi PETUGAS di VoltHub** (sesuai rekomendasi role): Dashboard · Laporan Awal · Laporan Akhir · Riwayat · Profile.
4. **Pertahankan utuh:** offline sync queue, autosave draft, GPS, kamera native, WA template, personil snapshot, UploadZone. Ini *non-negotiable*.
5. **Jembatan domain (fase lanjut, perlu keputusan):** field SCADA di Laporan Akhir (RTU/Media/Rectifier/Baterai + IP + ASDU + status) **secara konseptual = data Asset/CommMedia/Inspection** di VoltHub. Roadmap: petakan Laporan Akhir → auto-create/update `Inspection` atau `Asset` reading. **Jangan ubah backend frozen tanpa approval**; rancang dulu mapping-nya.
6. **PWA versi:** saat swap root, bump versi + `ForceUpdateGate` agar petugas dapat shell baru tanpa cache lama menyangkut.

**Acceptance (PETUGAS) sebelum V1 reporting dipensiunkan:**
- [ ] Buat Laporan Awal & Akhir end-to-end di shell VoltHub
- [ ] Submit offline → tersimpan di queue (termasuk foto) → auto-sync saat online
- [ ] Autosave draft & restore berfungsi
- [ ] GPS, kamera native, upload multi-foto berfungsi (PWA & Capacitor)
- [ ] WA template generate/salin/share
- [ ] Riwayat + detail laporan tampil

---

## 9. ROLE STRUCTURE (final: 3 role)

**Target final:** `SUPERADMIN` · `ADMIN` · `PETUGAS`.

### 9.1 Kondisi saat ini (4 role, dua sistem)
- V1 ([auth.ts](../FE/src/stores/auth.ts)): `petugas` / `admin` / `admin_rtupp` / `superadmin` — di mana **`admin_rtupp` justru power-admin** dan `admin` = read-only (lihat R3).
- V2 ([rbac.ts](../FE/src/lib/v2/rbac.ts)): `SUPERADMIN` / `ADMIN` / `ADMIN_RTUPP` / `USER` (USER = PETUGAS).

### 9.2 Mapping yang direkomendasikan
| Role lama (V1/V2) | Role final | Catatan |
|---|---|---|
| `superadmin` / `SUPERADMIN` | **SUPERADMIN** | langsung |
| `admin_rtupp` (power-admin V1) | **ADMIN** atau **SUPERADMIN** | ⚠️ Putuskan: kapabilitasnya luas (validate, user-mgmt, export). Petakan sesuai fungsi nyata. |
| `admin` (read-only V1) | **ADMIN** | langsung secara nama, tapi kapabilitas beda — selaraskan |
| `petugas` / `USER` | **PETUGAS** | langsung |

> **Aksi wajib:** buat tabel keputusan resmi `ADMIN_RTUPP → ?` sebelum kode RBAC dipotong. Backend tetap enforcer; FE hanya gating tampilan.

### 9.3 Fokus & menu per role final

**SUPERADMIN** — *User Management, Password Reset, Monitoring, Audit, System Administration*
- Menu VoltHub: Administration {Users, Teams, RTUPP} · Monitoring · Audit/Activity Log · Profile (+ akses penuh)

**ADMIN** — *Asset Management, Inspection, HAR, Documents, Reports, Import, AI Search*
- Menu VoltHub: Dashboard · Master Data {Locations, Feeders, Assets, Communication Media} · Operations {Inspection, HAR, Documents} · Reports · Import · AI Search · Profile

**PETUGAS** — *field reporting*
- Menu VoltHub (rekomendasi): **Dashboard · Laporan Awal · Laporan Akhir · Riwayat · Profile**

---

## 10. Migration Strategy

**Pendekatan: bertahap (strangler-fig), bukan big-bang.** VoltHub shell menjadi tunggal; modul lama di-*absorb* satu per satu.

### Fase A — Stabilkan & Hentikan Dead-link (cepat, rendah risiko)
- Sembunyikan menu V2 yang belum punya route (feature-flag per modul di `nav.ts`) → hilangkan 404 yang menyesatkan (R2).
- Satukan role set ke 3 role di `rbac.ts` + `toV2Role` (R8) — tanpa memotong logika V1 dulu.
- Dokumentasikan keputusan `ADMIN_RTUPP` (R3/§9.2).

### Fase B — Bangun Modul ADMIN VoltHub (backend sudah siap)
- Implementasi route + halaman untuk: Inspection, HAR, Documents, Reports, Import, AI Search memakai `createResource` + `DataTable` + `EntityFormModal` yang sudah ada. Backend `/api/v1` tinggal dikonsumsi.

### Fase C — Absorb Modul PETUGAS ke Shell VoltHub
- Render Laporan Awal/Akhir/Riwayat di `V2AppLayout` (lift-and-shift §8.4), API V1 reporting tetap.
- Navigasi PETUGAS final di VoltHub.

### Fase D — Bangun Modul SUPERADMIN
- Users/Teams/RTUPP + Monitoring + Audit di VoltHub (boleh reuse halaman V1 users/team/rtupp di dalam shell baru sebagai langkah antara).

### Fase E — Swap Root `/` → VoltHub
- Ubah [index.tsx](../FE/src/routes/index.tsx) agar `/` mengarah ke shell VoltHub (per role).
- Tambah redirect kompatibilitas dari route V1 lama → padanan VoltHub.
- Bump versi PWA + `ForceUpdateGate` (R6).

### Fase F — Pensiunkan V1 (hanya setelah UAT lulus)
- Hapus namespace `/v2` (jadi `/`), `Sidebar.tsx` V1, branding lama, `mockData`, route V1 yang sudah punya padanan.
- Jalankan `depcheck`/`knip` untuk prune dependency (§6).

**Gerbang antar fase:** tiap fase punya UAT; **PETUGAS acceptance (§8.4) adalah gerbang mutlak** sebelum Fase E/F.

---

## 11. DASHBOARD REVIEW & Rekomendasi Dashboard Operasional

### 11.1 Audit dashboard saat ini
**Dashboard V1** ([_app.dashboard.tsx](../FE/src/routes/_app.dashboard.tsx)) — matang untuk *reporting*: 6 KPI (Total/Pending/Approved/Rejected/Approval Rate/Today), tren 14 hari (area stacked Awal/Akhir), status distribution (pie), reports by jenis (bar), top pekerjaan, quick actions, laporan terkini, recent activity. Recharts. **Bagus untuk PETUGAS/validasi, tapi bukan dashboard aset.**

**Dashboard V2** ([v2.index.tsx](../FE/src/routes/v2.index.tsx)) — minimal: 4 count card (Locations/Feeders/Assets/CommMedia) + 1 catatan teks. **Tidak cukup untuk kebutuhan operasional PLN.**

**Kesimpulan:** Belum ada dashboard yang menampilkan kesehatan aset telekomunikasi PLN (status RTU/Rectifier/Battery/Comm Media, critical assets, tren inspeksi/HAR).

### 11.2 Rekomendasi Dashboard Operasional VoltHub
Bangun dashboard ADMIN yang menampilkan (data dari modul backend `assets`/`communication-media`/`inspections`/`har` yang sudah ada):

| Widget | Sumber data | Visual |
|---|---|---|
| **RTU Status** | assets (assetType=RTU) by status | donut/segmented (Normal/Warning/Down) |
| **Rectifier Status** | assets (Rectifier) | donut |
| **Battery Status** | assets (Battery) — incl. "Hati-hati"/degraded | donut + daftar kritis |
| **Communication Media Status** | communication-media by status/online-offline | donut + uptime |
| **Critical Assets** | assets dgn status rusak/down atau inspeksi terakhir negatif | tabel prioritas (lokasi, jenis, severity) |
| **Inspection Trend** | inspections per periode | line/area trend |
| **HAR Trend** | har-reports per periode (+ status incl. OFFLINE) | line/area + breakdown status |
| (pelengkap) Map lokasi | locations lat/long | peta marker by status |

Reuse `recharts` + `chart.tsx` (sudah ada). Dashboard berbeda per role (PETUGAS → ringkas reporting; ADMIN → operasional aset; SUPERADMIN → + sistem/audit).

---

## OUTPUT AKHIR — VOLTHUB MIGRATION AUDIT

### Temuan
1. Dua aplikasi hidup berdampingan dalam satu codebase: V1 reporting (`/_app`) & VoltHub asset (`/v2`), berbagi design system, auth, dan API client.
2. **Backend V2 lengkap (11 modul, 29 endpoint), tetapi frontend VoltHub baru Master Data + Dashboard.** Gap ada di FE.
3. **Sidebar V2 penuh dead-link** ke modul yang route-nya belum dibuat (Inspection/HAR/Documents/Reports/Import/AI/Admin/Profile).
4. **PETUGAS experience sangat matang** (offline-first, autosave, GPS, kamera, WA template, personil snapshot) — aset paling berharga, paling berisiko hilang.
5. **Konflik role:** `admin` vs `admin_rtupp` di V1 terbalik dari intuisi; FE punya 4 role sedangkan target 3 role.
6. Dashboard belum operasional untuk kebutuhan aset PLN.

### Risiko (ringkas)
R1 kehilangan fitur PETUGAS (🔴), R3 salah mapping role (🔴), R2 dead-link menyesatkan (🟠), R5 laporan belum nyambung ke domain aset (🟠), R6 big-bang swap root (🟠), plus R4/R7/R8 (🟡). Detail di §7.

### Komponen yang Dipertahankan
shadcn/ui penuh · komponen V2 (`V2AppLayout`, `DataTable`, `EntityFormModal`, `createResource`, dll) · auth store + axios client + generated types · native (geolocation/camera/push) · offline sync · PWA · Sentry · **seluruh engine form PETUGAS** (`Section/Field/UploadZone/FormToolbar`) + form Laporan Awal/Akhir + WA template.

### Komponen yang Dipensiunkan (bertahap, setelah ada padanan)
Redirect `/` V1 · namespace `/v2` (→ `/`) · `Sidebar.tsx` V1 · branding lama · dashboard V2 minimal · `mockData`. **Tak ada yang dihapus sekarang.**

### Strategi Migrasi
Strangler-fig 6 fase (A–F, §10): stabilkan & buang dead-link → bangun modul ADMIN → absorb modul PETUGAS (lift-and-shift) → bangun modul SUPERADMIN → swap root `/` → pensiunkan V1. PETUGAS acceptance adalah gerbang mutlak sebelum swap & pensiun.

### Rekomendasi Implementasi Berikutnya (urutan prioritas)
1. **Fase A** — sembunyikan menu V2 tanpa route (hentikan 404); selaraskan role set ke 3 role; putuskan & dokumentasikan mapping `ADMIN_RTUPP`.
2. **Bangun dashboard operasional VoltHub** (§11.2) — quick win bernilai tinggi, backend siap.
3. **Fase B** — bangun modul ADMIN (Inspection, HAR, Documents, Reports, Import, AI) di atas `createResource`/`DataTable` yang sudah ada.
4. **Fase C** — absorb modul PETUGAS ke shell VoltHub tanpa rewrite; jaga offline/GPS/kamera/WA/personil.
5. **Rancang jembatan domain** Laporan Akhir (SCADA) → Asset/CommMedia/Inspection (perlu keputusan; backend frozen).
6. **Fase D–F** — SUPERADMIN, swap root, pensiun V1 + prune dependency (`depcheck`/`knip`).

> **Catatan penutup:** Audit ini tidak mengubah atau menghapus kode/file apa pun. Semua tindakan "pensiun"/"hapus" di atas adalah rekomendasi bersyarat yang menunggu padanan fungsi di VoltHub + UAT lulus, dengan prioritas tertinggi menjaga PETUGAS experience tetap utuh.
