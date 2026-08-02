# Laporan GI (Inspeksi + HAR) — PETUGAS RTUPP1 + Pembanding SCADA

Status: implemented 2026-06-20. Additive, discope via `Location.rtuppId`.

## Latar belakang
Arahan atasan (catatan `catatan/` 2026-06-20): laporan lapangan untuk **Gardu Induk (GI)**
di **RTUPP1** (unit GIS) harus berorientasi **SCADA tele-control**, bukan laporan generik.
Dua jenis laporan nyata vendor (sumber kolom = file Excel di `catatan/`):

- **Inspeksi GI** (`LAPORAN INSPEKSI GI`, 129 kolom) — jalur **PREVENTIF** (terencana).
  Per Gardu+Penyulang, dikelompokkan per perangkat: Rectifier → Baterai → Serial Device →
  RTU Concentrator → RTU IED → **Kubikel** → Relay Proteksi → Media. Blok Kubikel = catatan
  "Relay→IED": `STATUS PMT`, `STATUS L/R`, `RELAY AUX OPEN/CLOSE/LOCAL/REMOTE/ES/RACK/MSF/PSF/CSF`,
  tiap titik punya pasangan **"…DI MASTER"** (pembanding lapangan vs SCADA).
- **HAR GI** (`HAR GI`, 77 kolom) — jalur **KOREKTIF** (gangguan→perbaikan): kondisi perangkat +
  `TEST`, `PENYEBAB GANGGUAN`, `ANALISA`, `LANGKAH`, `HASIL`, `STATUS GARDU SEBELUM/SESUDAH`,
  `STATUS PEKERJAAN`.
- **Export SCADA IFS RTU** (`csd_IFS-IFS_RTU_Data.xlsx`) — daftar titik IEC-104 per RTU/bay.
  Element: `CB`(Status+Command), `LR`(remote/local), `ES`, `RACK`, `I1/I2/I3`, `AMF`, `MSF/PSF/CSF`.
  Dipakai untuk auto-fill "DI MASTER" + hitung **Berhasil RC**.

## Aturan "Berhasil RC" (catatan ke-4 atasan)
Sebuah penyulang **BERHASIL RC** bila perangkat dapat di-remote dari Master Station, syarat:

```
rcSuccess = (LR == REMOTE) && (ES == OPEN)
```

(Status CB hanya posisi PMT saat ini, bukan syarat keberhasilan.) Lihat
`BE/src/modules/scada-gi/compare.ts` + tes `compare.test.ts`.

## Alur peran (workflow) — pemisahan PETUGAS vs ADMIN (best practice)
`DRAFT → SUBMITTED → VALIDATED | REJECTED`.
- **PETUGAS (tim lapangan)** = satu-satunya yang **buat/isi/edit/submit** laporan, dan hanya
  miliknya sendiri (`authorize(ROLES.PETUGAS)` + owner-check `inspectorId`). List PETUGAS =
  laporannya sendiri saja.
- **ADMIN (per RTUPP)** = **tidak boleh mengisi** (tidak ada tombol "Buat"); hanya **lihat
  seluruh laporan di RTUPP-nya** + **ACC/Reject**. `validate` = ADMIN/MASTER.
- Form GI hanya tampil untuk user RTUPP1 (atau MASTER).

### Prinsip dropdown vs ketik
Dropdown hanya untuk nilai pasti/terbatas (PMT CLOSE/OPEN, L/R LOCAL/REMOTE, Relay Aux ON/OFF,
Kesimpulan, Lokasi GI, Penyulang, RTU SCADA). Nilai tak pasti (Merk, Type, Serial, Kondisi,
Hasil Ukur, Pelaksana) = **ketik bebas** oleh tim lapangan.

### Seed master GI RTUPP-1
`npx tsx prisma/seed-gi-rtupp1.ts` → buat GI + Penyulang RTUPP-1 dari `catatan/Laporan Inspeksi GI`
+ impor snapshot IFS, supaya dropdown terisi (tenant RTUPP-1 sebelumnya kosong).

### Dashboard GI
- `GET /gi/dashboard` (MASTER/MANAGER/ADMIN) — ADMIN discope RTUPP-nya; ringkasan status,
  %Berhasil RC, %Sesuai master, **breakdown per Tim** (dari `user.teamId` petugas), recent.
- `GET /gi/dashboard/leaderboard` (MASTER/MANAGER) — peringkat **petugas terbaik** lintas RTUPP
  by laporan tervalidasi → %Berhasil RC. FE: `/gi-dashboard` (menu "Dashboard GI", rtupp1Only).

## Data model (Prisma — additive)
Migration `20260620120000_gi_reports_scada_compare_additive`:
- `InspeksiGiReport` — header + 8 seksi JSON + kolom promosi (`pmtKubikel/pmtDiMaster`,
  `lrKubikel/lrDiMaster`, `mpufDiMaster`, `comparisonResult`, `scadaSnapshotId`) + workflow.
- `HarGiReport` — header + 8 seksi JSON + detail korektif + `rcSuccess`, `comparisonResult`, workflow.
- `ScadaRtuSnapshot` + `ScadaRtuPoint` — snapshot point-level hasil import IFS.
- Enum `GiReportStatus`, `GiComparisonResult`.

Tiap blok perangkat disimpan sebagai **JSON tervalidasi Zod** (longgar/parsial untuk DRAFT);
kolom kunci dipromosikan jadi kolom asli untuk query dashboard.

## Endpoint (`/api/v1`)
| Method | Path | Roles | Catatan |
|---|---|---|---|
| POST | `/gi/scada/import` | MASTER, ADMIN | upload IFS RTU `.xlsx` |
| GET | `/gi/scada/rtus` | semua | daftar RTU tersedia |
| GET | `/gi/scada/points?rtu=` | semua | master + Berhasil RC |
| GET/POST | `/gi/inspeksi` | list semua / create MASTER+ADMIN+PETUGAS | |
| GET/PUT | `/gi/inspeksi/:id` | scoped | PUT selama belum VALIDATED |
| POST | `/gi/inspeksi/:id/submit` | report-write | DRAFT→SUBMITTED |
| POST | `/gi/inspeksi/:id/validate` | MASTER, ADMIN | VALIDATED/REJECTED |
| … | `/gi/har`, `/gi/har/:id`, `/gi/har/:id/{submit,validate}` | sama | |

Semua read discope `viaLocationScopeWhere` (PETUGAS/ADMIN terkunci RTUPP-nya; MASTER/MANAGER global).
Create memakai idempotency middleware (replay offline aman).

## Frontend
- Routes: `/inspeksi-gi`, `/inspeksi-gi/$id`, `/har-gi`, `/har-gi/$id` — guard PETUGAS/ADMIN/MASTER
  + `isRtupp1User` (atau MASTER).
- Form multi-tab per perangkat (`InspeksiGiForm`/`HarGiForm`), kolom "DI MASTER" read-only auto-fill
  dari `/gi/scada/points`, panel **Berhasil RC**.
- Nav: item "Inspeksi GI" & "HAR GI" (flag `rtupp1Only`) di grup Pelaporan Lapangan (PETUGAS) &
  Operasional Lapangan (ADMIN).
- Offline: `createGiReportOrQueue` (kind `inspeksi-gi`/`har-gi`) + flush handler.

## Verifikasi
- BE: `cd BE && npx vitest run src/modules/scada-gi/compare.test.ts` (tabel kebenaran Berhasil RC).
- Import nyata: `POST /gi/scada/import` file `catatan/csd_IFS-IFS_RTU_Data.xlsx` → `GET /gi/scada/points?rtu=ANGKE_97`
  → CB=close, LR=remote, ES=open, berhasilRc=true.
- FE: `cd FE && npm run build` lalu jalankan; login PETUGAS RTUPP1 → isi Inspeksi GI → submit →
  login ADMIN → validasi.
