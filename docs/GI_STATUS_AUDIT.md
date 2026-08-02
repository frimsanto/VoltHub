# GI MODULE STATUS

> Sprint: **GI FIRST** (RTUPP1 = Gardu Induk). Audit kode aktif `BE/` + `FE/`, tanggal **2026-06-20**.
> Tujuan: pastikan alur PETUGAS RTUPP1 → Inspeksi GI → SCADA Compare → RC Evaluation → HAR GI → Submit → ADMIN RTUPP1 → Validasi **siap UAT lapangan**.
> Prinsip sprint: **tidak ada fitur/schema/route baru** — hanya pematangan alur GI yang sudah ada.
> AI / WhatsApp / GH / MP / dashboard baru: **OUT OF SCOPE** (tidak disentuh).

Ringkasan: fondasi GI **sudah ada dan tersambung end-to-end** (3 modul BE + FE multi-tab + workflow + compare engine teruji). Yang menahan UAT bukan barang yang hilang, tapi **3 lubang operasional**: (1) tidak ada UI untuk meng-import data SCADA IFS — tanpa itu kolom "DI MASTER" & RC kosong; (2) RC/compare dievaluasi di level RTU, belum per-penyulang/bay; (3) compare hanya menutup 2 dari ~9 titik relay yang dijanjikan dokumen. Tidak ditemukan `TODO`/`FIXME`/`mock`/hardcode di dalam modul GI.

---

## Inspeksi GI

**Status:** SELESAI (fungsional) — perlu pematangan cakupan compare.

**Progress:** ~85%

**Files:**
- BE: [inspeksi-gi.service.ts](../BE/src/modules/inspeksi-gi/inspeksi-gi.service.ts), [.controller.ts](../BE/src/modules/inspeksi-gi/inspeksi-gi.controller.ts), [.routes.ts](../BE/src/modules/inspeksi-gi/inspeksi-gi.routes.ts), `.repository.ts`, `.validation.ts`
- FE: [_app.inspeksi-gi.tsx](../FE/src/routes/_app.inspeksi-gi.tsx), [_app.inspeksi-gi.$id.tsx](../FE/src/routes/_app.inspeksi-gi.$id.tsx), [InspeksiGiForm.tsx](../FE/src/features/v2/inspeksi-gi/InspeksiGiForm.tsx), `resource.ts`
- Schema: `InspeksiGiReport` (schema.prisma:1572)

**Gap:**
- `buildComparison()` hanya membandingkan **2 titik**: `pmt` (CB) + `lr` (L/R). Dokumen GI_REPORTS menjanjikan blok Kubikel lengkap: `ES / RACK / MSF / PSF / CSF / AUX OPEN/CLOSE/LOCAL/REMOTE` — semua punya pasangan "DI MASTER". Master SCADA **sudah menyediakan** `es/rack/msf/psf/csf` ([scada-gi.service.ts:71](../BE/src/modules/scada-gi/scada-gi.service.ts)) tetapi tidak dipakai di rollup. Akibat: laporan bisa "SESUAI" padahal titik lain menyimpang.
- Auto-fill "DI MASTER" bergantung pada adanya snapshot SCADA. Bila belum di-import → `BELUM_DIBANDING` (silent). Lihat gap SCADA GI.
- Tidak ada unit test level service (hanya compare engine yang teruji).

**Recommendation:**
- (P2) Perluas `buildComparison` agar mencakup ES/RACK/MSF/PSF/CSF (data master sudah tersedia — additive, bukan fitur baru).
- (P3) Tambah test service untuk workflow create→submit→validate.

---

## HAR GI

**Status:** SELESAI (fungsional).

**Progress:** ~85%

**Files:**
- BE: [har-gi.service.ts](../BE/src/modules/har-gi/har-gi.service.ts), `.controller.ts`, `.routes.ts`, `.repository.ts`, `.validation.ts`
- FE: [_app.har-gi.tsx](../FE/src/routes/_app.har-gi.tsx), `_app.har-gi.$id.tsx`, [HarGiForm.tsx](../FE/src/features/v2/har-gi/HarGiForm.tsx), `resource.ts`
- Schema: `HarGiReport` (schema.prisma:1627)

**Gap:**
- `resolveRc()` mengambil RC dari snapshot **seluruh RTU** ([har-gi.service.ts:38](../BE/src/modules/har-gi/har-gi.service.ts)) — bukan per-penyulang yang diperbaiki. Sama dengan gap RC di bawah.
- Field korektif (`penyebabGangguan`, `analisa`, `langkah`, `hasil`, `statusGardu sebelum/sesudah`) tersimpan sebagai teks bebas — sesuai desain, tidak ada validasi/kelengkapan saat submit.
- Tidak ada export PDF laporan HAR/Inspeksi GI (Report Generator V2 belum mencakup entitas GI).

**Recommendation:**
- (P2) Perbaiki granularitas RC ke level penyulang (lihat RC Evaluation).
- (P3) Hook GI ke Report Generator untuk lampiran PDF saat UAT, jika diminta lapangan.

---

## SCADA GI

**Status:** SETENGAH JADI — engine import lengkap & teruji, **tetapi tidak ada pintu masuk operasional (UI)**.

**Progress:** ~70% (BE 95%, FE 20%)

**Files:**
- BE: [ifs.parser.ts](../BE/src/modules/scada-gi/ifs.parser.ts), [scada-gi.service.ts](../BE/src/modules/scada-gi/scada-gi.service.ts), `.controller.ts`, `.routes.ts`, `.repository.ts`
- FE: [scada-gi/resource.ts](../FE/src/features/v2/scada-gi/resource.ts) — **hanya hook baca** (`useScadaRtuNames`, `useScadaMaster`)
- Schema: `ScadaRtuSnapshot` + `ScadaRtuPoint` (schema.prisma:1692/1709)

**Gap (kritis untuk UAT):**
- Endpoint `POST /gi/scada/import` (MASTER/ADMIN) ada dan berfungsi, **tapi tidak ada UI/mutation di FE** untuk meng-upload file IFS RTU. Saat ini import hanya bisa lewat API langsung atau seed (`seed-gi-rtupp1.ts`). **Tanpa import, seluruh kolom "DI MASTER" + RC = kosong** → alur SCADA Compare praktis mati di lapangan.
- `garduName` snapshot dipilih heuristik "bay paling sering muncul" ([ifs.parser.ts:111](../BE/src/modules/scada-gi/ifs.parser.ts)) — informatif saja, tidak dipakai sebagai kunci join. Aman, tapi perlu dicatat.
- Penyimpanan snapshot level-RTU (semua bay digabung); tidak ada index/akses per-bay untuk compare per-penyulang.

**Recommendation:**
- **(P1)** Tambah UI import IFS untuk ADMIN/MASTER RTUPP1 (panel kecil di halaman SCADA/Import yang memanggil endpoint yang **sudah ada** — bukan endpoint baru). Ini blocker UAT nomor satu.
- (P2) Simpan/index `bay` agar `getMasterForRtu` bisa difilter per-penyulang.

---

## RC Evaluation

**Status:** SELESAI sebagai engine murni & teruji — **granularitas belum sesuai bisnis**.

**Progress:** ~80%

**Files:**
- BE: [compare.ts](../BE/src/modules/scada-gi/compare.ts) + test [compare.test.ts](../BE/src/modules/scada-gi/compare.test.ts)
- Dipakai: `inspeksi-gi.service` (compare DI MASTER) & `har-gi.service` (rcSuccess)

**Progress detail:** Aturan benar dan terkunci test — `rcSuccess = (LR==REMOTE) && (ES==OPEN)` (`evaluateBerhasilRc`), plus normalisasi sinonim (close/closed, open/opened, dst) dan `compareField`/`rollupComparison`. Logika murni tanpa DB, mudah diaudit.

**Gap:**
- `evaluateBerhasilRc` mengambil **titik LR/ES pertama** dari seluruh snapshot RTU (`pickElement` first-match). Untuk RTU multi-bay/multi-penyulang, ini menilai **satu penyulang acak**, bukan penyulang yang dilaporkan. Bisnis menghitung "Berhasil RC" **per-penyulang** → hasil bisa salah untuk GI dengan banyak penyulang.
- RC HAR/Inspeksi tidak mengikat `feederId` laporan ke `bay` snapshot SCADA.

**Recommendation:**
- **(P1/P2)** Saat resolve master, filter titik berdasarkan penyulang/bay laporan (`feederId` → `bay`) sebelum `evaluateBerhasilRc`. Engine sudah siap (`points[]` punya `bay`); cukup tambahkan filter di service layer. Engine murni tidak perlu diubah.

---

## Approval Workflow

**Status:** SELESAI.

**Progress:** ~95%

**Files:**
- BE: `submit` + `validateReport` di [inspeksi-gi.service.ts](../BE/src/modules/inspeksi-gi/inspeksi-gi.service.ts) & [har-gi.service.ts](../BE/src/modules/har-gi/har-gi.service.ts); RBAC di `.routes.ts`
- FE: [_app.inspeksi-gi.$id.tsx](../FE/src/routes/_app.inspeksi-gi.$id.tsx) (tombol Submit / Validasi / Reject + catatan)
- Enum: `GiReportStatus` (DRAFT → SUBMITTED → VALIDATED | REJECTED)

**Progress detail:** Pemisahan peran benar dan sesuai arahan:
- PETUGAS = satu-satunya yang create/update/submit, **owner-check** `inspectorId` (tidak bisa edit milik orang lain), list hanya laporannya sendiri.
- ADMIN/MASTER = validate/reject saja, **tidak ada tombol Buat**, discope RTUPP via `viaLocationScopeWhere`.
- Guard `update`/`submit` menolak laporan `VALIDATED`; `validate` hanya menerima `SUBMITTED`. REJECTED bisa diedit & dikirim ulang. Create memakai idempotency (replay offline aman). Workflow ini **tidak** memakai engine generic ber-orphan (`/workflow`) — tepat, lebih sederhana.

**Gap:**
- Tidak ada audit-trail eksplisit untuk transisi GI (pakai kolom `validatedBy/validatedAt/validationNote` saja, bukan `audit_logs`). Cukup untuk UAT.
- FE `canSubmit` mengizinkan resubmit dari REJECTED (baik), tapi belum ada UI "alasan reject" yang menonjol di list (hanya di detail).

**Recommendation:**
- (P3) Surface `validationNote` (alasan reject) di list PETUGAS agar koreksi cepat.
- (P3) Catat transisi ke `audit_logs` jika UAT menuntut jejak audit.

---

# PRIORITAS IMPLEMENTASI (berdasarkan dampak bisnis)

> Catatan: semua item di bawah memakai endpoint/schema/route yang **sudah ada**. Tidak ada pembuatan fitur/schema/route baru.

## P1 — WAJIB selesai sebelum UAT
1. **UI Import SCADA IFS (RTUPP1, ADMIN/MASTER).** Tanpa import, "DI MASTER" & RC kosong → seluruh nilai jual alur GI hilang. Panggil `POST /gi/scada/import` yang sudah ada. *(SCADA GI)*
2. **RC/Compare per-penyulang.** Filter titik snapshot per `bay`/`feederId` sebelum evaluasi RC, agar "Berhasil RC" benar untuk GI multi-penyulang. *(RC Evaluation, HAR GI)*

## P2 — PENTING
3. **Perluas cakupan compare Inspeksi** ke ES/RACK/MSF/PSF/CSF (data master sudah ada, tinggal dipakai di rollup). *(Inspeksi GI)*
4. **Index/akses `bay` pada snapshot** untuk mendukung item P1#2 secara rapi. *(SCADA GI)*

## P3 — NICE TO HAVE
5. Test service workflow (create→submit→validate) Inspeksi & HAR GI.
6. Export PDF laporan GI (hook ke Report Generator).
7. Surface alasan reject di list PETUGAS + audit-trail transisi.

---

## Catatan audit teknis
- **Tidak ditemukan** `TODO` / `FIXME` / `mock` / `hardcode` / `temporary` di dalam modul GI (`inspeksi-gi`, `har-gi`, `scada-gi`, `gi-dashboard`) BE maupun FE.
- `isRtupp1User()` ([FE/src/lib/v2/rtupp.ts](../FE/src/lib/v2/rtupp.ts)) mendeteksi RTUPP1 via kode/nama `RTUPP1` **atau** nama mengandung `"GIS"`. Tergantung kebersihan data master RTUPP — verifikasi nama unit RTUPP1 di DB produksi agar nav `rtupp1Only` muncul. Bukan bug, tapi titik konfigurasi.
- `seed-gi-rtupp1.ts` adalah **seed-only** untuk mengisi dropdown GI + Penyulang RTUPP1 (tenant sebelumnya kosong). Untuk UAT dengan data nyata, master GI/Penyulang harus berasal dari import/registry, bukan seed.
- Migration `20260620120000_gi_reports_scada_compare_additive` ada & additive; per memory sudah terverifikasi end-to-end di live DB.
- Semua route GI ter-mount di [BE/src/routes/index.ts](../BE/src/routes/index.ts) (`/gi/scada`, `/gi/inspeksi`, `/gi/har`, `/gi/dashboard`). Tidak ada route/page/endpoint GI yang menggantung tanpa konsumen.
