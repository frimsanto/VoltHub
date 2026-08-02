# MP (Metering Point / Gardu Distribusi) — Verification Checklist

Modul Laporan Inspeksi MP & Laporan HAR MP dimodelkan 1:1 dari modul GH (Gardu Hubung).
Checklist ini merangkum hasil audit menyeluruh (BE + FE + integrasi Work Order).

## Backend API

- [x] `POST /api/v1/mp/inspeksi` — create Laporan Inspeksi MP (workOrderId wajib)
- [x] `GET /api/v1/mp/inspeksi` — list dengan scope RTUPP + filter (status/locationId/workOrderId/mine/date range)
- [x] `GET /api/v1/mp/inspeksi/:id` — detail (403 jika bukan milik petugas / luar RTUPP)
- [x] `PUT /api/v1/mp/inspeksi/:id` — update (hanya status DRAFT/REJECTED)
- [x] `POST /api/v1/mp/inspeksi/:id/submit` — submit dengan assertSubmittable ARRAY-AWARE kubikel
- [x] `POST /api/v1/mp/inspeksi/:id/decide` — validasi (hanya laporan TANPA WorkOrder tertaut)
- [x] `POST /api/v1/mp/har` — create Laporan HAR MP (workOrderId wajib)
- [x] `GET /api/v1/mp/har` — list dengan scope RTUPP + filter
- [x] `GET /api/v1/mp/har/:id` — detail (403 jika bukan milik petugas / luar RTUPP)
- [x] `PUT /api/v1/mp/har/:id` — update (hanya status DRAFT/REJECTED)
- [x] `POST /api/v1/mp/har/:id/submit` — submit dengan assertSubmittable (termasuk section `penanganan`)
- [x] `POST /api/v1/mp/har/:id/decide` — validasi (hanya laporan TANPA WorkOrder tertaut)
- [x] Routes ter-mount di `BE/src/routes/index.ts` (`/mp/inspeksi`, `/mp/har`) — urutan konsisten dengan mount GH
- [x] Validation schema (`laporan-har-mp.validation.ts`) menyertakan seluruh 9 section + `penanganan` (looseSection)
- [x] `assertKubikelSubmittableMp` — array-aware, min 1 gardu, wajib namaGardu+statusCubicle+statusRc per entri
- [x] WorkOrder gate: `assertLaporanAwalSubmitted`, `assertWoNotRejected` dipanggil identik pola GH
- [x] tenantScope: `viaLocationScopeWhere` generik lintas locationType (GI/GH/GARDU)
- [x] `mp-attachment.service.ts` — relasi Prisma `include` diperbaiki memakai field relasi asli `laporan` (bukan `laporanInspeksiMp`/`laporanHarMp`) agar tidak gagal di runtime
- [x] Video compressor queue (`createGhVideoCompressorQueue`) — signature & delegate cocok (real Prisma delegate, `as never` aman)

## Frontend

- [x] Routes `_app.inspeksi-mp.tsx` + `_app.inspeksi-mp.$id.tsx` — guard role `["PETUGAS","ADMIN","MASTER"]` (identik GH, MANAGER memang tidak diberi akses form lapangan di GH maupun MP)
- [x] Routes `_app.har-mp.tsx` + `_app.har-mp.$id.tsx` — guard role sama
- [x] `editable` logic (`isOwner || role === "PETUGAS"`) — identik pola GH, bukan regresi keamanan MP-spesifik
- [x] `MpReportDetail` tidak me-render `MpAttachments` secara internal — tidak ada double render (attachments dirender sekali di level route)
- [x] `mpSections.ts` — 9 section (supplyTr, rectifier, baterai, rtu, media1, media2, kubikel, fdiRelay, aco)
- [x] `KUBIKEL_STATUS_OPTIONS.statusRc` = `["SIAP RC", "TIDAK SIAP RC"]` — cocok string literal BE (`syncScalars`/mapping hasilRC)
- [x] `validateKubikelForSubmit` — mirror BE `assertKubikelSubmittableMp` (min 1 gardu + namaGardu+statusCubicle+statusRc wajib)
- [x] Sidebar nav (`lib/v2/nav.ts`) — entry "Inspeksi MP" (`/inspeksi-mp`, `mpOnly:true`) & "Laporan HAR MP" (`/har-mp`, `mpOnly:true`) ada di grup OPS_VIEW dan FIELD_ONLY
- [x] `penyebabGangguan` — accepted gap: HAR GH juga tidak punya UI input khusus (hanya dipertahankan dari initial data); MP konsisten dengan GH, tidak diubah

## WO Integration

- [x] `workOrderId` WAJIB saat create Inspeksi MP & HAR MP — identitas (locationId/feederId/up3/pelaksana) diambil server-side dari WO (anti-spoof)
- [x] Resolusi identitas menolak WO di luar RTUPP scope (403) dan WO tidak ditemukan (404)
- [x] Resolusi identitas menolak WO berlokasi selain `GARDU` (BusinessRuleError)
- [x] Gate Laporan Awal (`assertLaporanAwalSubmitted`) diperiksa sebelum create, sesuai `requiredReports` WO
- [x] Submit ditolak jika WO tertaut berstatus REJECTED ("Tidak Sesuai") — `assertWoNotRejected`
- [x] Inspeksi MP submit → `workOrderService.onLinkedReportSubmitted` dengan `resultMapping.hasilRC` (SIAP RC → BERHASIL, TIDAK SIAP RC → GAGAL, mapping type-compatible dengan enum `WorkResult`)
- [x] HAR MP submit → `workOrderService.onLinkedReportSubmitted` TANPA resultMapping (korektif, tidak menyentuh hasilRC WO) — identik pola HAR GH
- [x] `decide()` menolak approval langsung jika laporan tertaut WorkOrder (approval harus lewat WO)
- [x] Test suite BE (34 test: laporan-inspeksi-mp, laporan-har-mp, mp-shared) — semua PASS
