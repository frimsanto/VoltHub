# Analisis Dataset SCADA → Pemetaan ke Schema (Live Monitoring)

Status: analisis sumber data (fase pra-desain). Tujuan: memetakan isi `dataset_scada/`
ke schema Prisma yang ada, mengidentifikasi gap, sebelum membangun ingestion.

Konteks keputusan:
- Ingestion = **upload manual berkala** (reuse modul `imports`), bukan socket SCADA langsung.
- Sumber live = **export periodik dari Master Station SCADA (sistem IFS, protokol IEC-104)**
  yang saat ini diolah manual di Excel.

---

## 1. Inventaris sumber data

| File | Peran | Sifat |
|---|---|---|
| `csd_IFS-IFS_RTUs*.xlsx` | Registry RTU + **status operasi live** (export master station) | Snapshot (per-export) |
| `csd_IFS-IFS_Lines*.xlsx` | Registry channel/link + **status operasi live** | Snapshot (per-export) |
| `Laporan Harian OOP 2026.xlsx` | Monitoring availability/downtime **manual** | Event log + rollup harian/bulanan |
| `PEKERJAAN INSPEKSI.xlsx` | Laporan inspeksi lapangan + master aset (sheet DATABASE) | Data lapangan (manual) |
| `PEKERJAAN HAR.xlsx` | Laporan HAR (pemeliharaan/perbaikan) lapangan | Data lapangan (manual) |
| `TELEKOMUNIKASI SCADA 2026 V2 (3).xlsx` | Master workbook 32 sheet (gardu/penyulang/aset) | Master data |

Dua kelas jelas terpisah:
- **Live / mesin** → `csd_IFS_*` (snapshot status) + `Status Ins Oop` (event up/down).
- **Lapangan / manusia** → INSPEKSI, HAR (kondisi fisik, hasil ukur, foto).

---

## 2. Sumber LIVE — detail kolom

### 2.1 `csd_IFS-IFS_RTUs` (≈4.816 RTU)
Kolom: `RTU Name`, `PairNr`, `Channel Primary`, `Server (CId)` (gbr11ifs/gbr12ifs =
primary/backup), `RTU Text`, `Protocol` (=IEC104), `Address`, `Orig Addr`, `ASDU`,
`Admin State` (ON/OFF), **`Oper State` (UP/DOWN)**, `Backup Channel Id`, `RTU OiT State`.

→ Ini adalah **status komunikasi RTU saat export**. `Oper State` = sinyal live utama.

### 2.2 `csd_IFS-IFS_Lines` (≈15.557 channel)
Kolom: `Pair Id`, `Channel Id`, `IFS Server (CId)`, `Channel Name`, `Channel Text`,
`Admin State`, **`Oper State` (UP/DOWN)**, `Asgd` (ASG/UNASG), `Data Xfr` (ON/OFF),
`Config Type` (P2P), `Mode`, `Device Type` (IP), `IP Addr`, `Secure Mode`,
`Port` (=2404, port standar IEC-104), `Backup Channel Id`.

→ Setiap channel muncul **dua baris** (server 11 & 12) — redundansi primary/backup.
Status link per server.

### 2.3 `Laporan Harian OOP 2026.xlsx`
Workbook ini = pekerjaan monitoring manual yang ingin diotomasi. Sheet penting:

- **`Status Ins Oop`** (≈4.446 baris) — **event log telemetry mentah**:
  `Point Number` (kunci SCADA), `Jenis Point` (RTU MP / RTU GFD / RTU GI),
  `B1 (Lokasi)`, `B2 (Tegangan)`, `B3 (Bay)`, `Element` (LKFT/RTUF), `Info` (Status),
  `Value` (0/1), `Tanggal` (waktu event), `Status` (up/down), `Durasi`,
  `Kesimpulan` (VALID/INVALID), `HARI/JAM/MENIT/TOTAL MENIT`.
- **`ASET MP 2026`** / **`Aset GI`** / **`Aset GH`** / **`New Aset MP`** / **`INOUT GH`**
  — matriks availability harian: baris = gardu, kolom = tanggal (1 Jan…31 Des),
  nilai = 1 (up) / 0 (down). Kolom `%AVA YTD` per gardu.
- **`Mounthly Recap`** — `Downtime (Jam)` per remote station per bulan (SUM dari harian).
- **`Input MP`** — snapshot `RTU Name` → `Oper State` + kondisi gardu (CBO/LBS).
- **`Dashboard` / `RTUPP*`** — pivot ringkasan (🟢 up / 🔴 down per UP3).

→ `Status Ins Oop` = sumber event. Matriks ASET = rollup harian. Mounthly = rollup bulanan.
Semua bisa **diturunkan otomatis** dari event + status snapshot.

---

## 3. Sumber LAPANGAN — detail

### 3.1 `PEKERJAAN INSPEKSI.xlsx`
- `LAPORAN INSPEKSI MP/GH/GI` — per kunjungan: `TANGGAL`, `USER` (email petugas),
  `UP3`, `GARDU`, `PENYULANG`, lalu puluhan kolom hasil ukur rectifier (MCB 220/48/24/12 V,
  hasil ukur tegangan), baterai (jenis/merk/level air/backup), RTU (merk/type/SN/kondisi).
  Tiap blok punya nilai + `KESIMPULAN` + `KATEGORI` + Health Index.
- `DATABASE` (≈15.380 baris) — **master konfigurasi aset per gardu**: merk/type RTU,
  rectifier, media, baterai, type gardu, ACO, RC, relay, status (OOP/INSCAN/INVALID), dst.
- `HISTORI` — snapshot kesimpulan kondisi per bulan.
- `LIBRARY` / `DATA` — referensi kode keterangan + kategori prioritas (P0/P1…).

### 3.2 `PEKERJAAN HAR.xlsx`
- `HAR MP` (≈4.558 baris) — per kunjungan HAR: `TGL`, `USER`, `KET. KUNJUNGAN`, `UP3`,
  `GARDU`, `PENYULANG`, `TYPE MP`, kondisi + **catatan** RTU/rectifier/baterai/media-1/media-2,
  ACO. Fokus pada perbaikan (mis. "TEG BATTERAI DROP", "Modem rusak").

---

## 4. Pemetaan ke schema Prisma

| Sumber | Tabel target | Kecocokan | Catatan |
|---|---|---|---|
| `csd RTUs` (identitas) | `Asset` (assetType=RTU) | **Tinggi** | Field `protocol/asdu/linkAddress/pairChannel/masterIp1/masterIp2` sudah ada |
| `csd RTUs` (Oper/Admin State) | — | **GAP** | Belum ada kolom status operasi pada Asset |
| `csd Lines` (channel) | `CommunicationMedia` | **Rendah** | CommMedia tak punya channelId/IP/port/operState/redundansi |
| `Status Ins Oop` (event) | `TelemetryPoint` + `TelemetryValue` | **Tinggi** | point=Point Number, value=0/1, recordedAt=Tanggal, quality=Status |
| `ASET MP / Aset GH/GI` (matriks harian) | `PerformanceDaily` | **Tinggi** | (locationId, performanceDate, performanceStatus, score=%AVA) |
| `Mounthly Recap` (downtime) | rollup turunan | n/a | Dihitung dari PerformanceDaily/event |
| `INSPEKSI MP/GH/GI` | `Inspection` + `InspectionFinding` | Sedang | Banyak kolom hasil ukur → finding terstruktur |
| `INSPEKSI DATABASE` | `Asset` + `CommunicationMedia` (master) | Sedang | Enrichment konfigurasi aset |
| `HAR MP` | `HarReport` + `HarDetail` | Sedang | Catatan perbaikan per komponen |
| `B1 (Lokasi)` | `Location.code` | Perlu mapping | Kode gardu (mis. B168) → locations |

---

## 5. Gap yang harus ditutup (sebelum/saat membangun)

1. **Status operasi RTU belum ada tempat (snapshot live).**
   Tambah pada `Asset` (atau tabel snapshot terpisah): `operState`, `adminState`,
   `lastStateAt`, `lastSeenAt`. Inilah yang dibaca dashboard "berapa RTU DOWN sekarang".

2. **Entity Channel/Link belum ada.**
   `csd Lines` lebih granular dari `CommunicationMedia`: butuh `channelId`, `ipAddress`,
   `port`, `operState`, `serverCid`, `backupChannelId`, plus konsep redundansi primary/backup.
   Opsi: model `CommunicationChannel` baru, atau perluas `CommunicationMedia`.

3. **Tabel telemetry kosong + belum ada parser.**
   `TelemetryPoint/Value` masih "Reserved". Butuh parser format `Status Ins Oop`
   (Point Number + B1/B2/B3 + event up/down) di modul `imports`. Perlu field
   `pointNumber` (kunci SCADA native) — saat ini `TelemetryPoint.pointCode` bisa dipakai.

4. **`PerformanceDaily` kosong + belum ada mesin availability.**
   Inilah yang menggantikan kerja manual Excel: dari event/snapshot → hitung status
   harian (1/0) + %AVA + downtime (jam) → isi `PerformanceDaily`. Mounthly Recap
   = agregasi bulanan dari sini.

5. **Resolusi `B1 (Lokasi)` → `Location`.**
   Event SCADA mengacu kode gardu (B168, BC202…). Perlu lookup ke `locations.code`;
   siapkan penanganan kode yang belum terdaftar (quarantine/unmatched).

6. **Identitas RTU lintas-sumber.**
   `RTU Name` (csd), `Point Number` (OOP), dan `Asset.assetCode` harus bisa
   direkonsiliasi. Perlu kunci/peta korelasi yang disepakati.

---

## 6. Alur target (ringkas)

```
Upload export IFS (RTUs/Lines)        Upload "Status Ins Oop"
        │                                      │
        ▼                                      ▼
  [imports parser]                      [imports parser]
        │                                      │
        ▼                                      ▼
  Asset (identitas) + snapshot          TelemetryPoint + TelemetryValue
  operState/lastSeenAt                  (event up/down mentah)
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
            [Availability engine]
                       ▼
              PerformanceDaily  (status harian, %AVA, downtime)
                       │
        ┌──────────────┼───────────────────┐
        ▼              ▼                    ▼
 Live dashboard   Rollup bulanan    Threshold → Ticket/Notification
 (baca snapshot)  (≈Mounthly Recap)  (RTU DOWN > ambang)
```

Data lapangan (INSPEKSI/HAR) masuk via `Inspection`/`HarReport` sebagai ground-truth,
melengkapi — bukan menggantikan — status live.

---

## 7. Pertanyaan terbuka (perlu dikonfirmasi sebelum desain final)

- Kunci korelasi RTU: apakah `RTU Name` (csd) == `assetCode`, atau ada peta terpisah?
- Definisi availability: 1 hari = "down" bila down berapa lama? (ambang menit/jam)
- `%AVA YTD` dihitung dari downtime menit atau dari jumlah hari up/down?
- Frekuensi export realistis: harian? beberapa kali sehari? (menentukan granularitas snapshot)
- Apakah channel (Lines) perlu di-monitor sendiri, atau cukup status RTU agregat?
