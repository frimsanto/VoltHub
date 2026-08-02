# WORK ORDER — Desain Data (ERD)

> **DESAIN — belum migration, belum tabel.** Tujuan: model **minimum** untuk Work Order,
> additive di atas schema yang ada. Mohon review §2 (pilihan A vs B) sebelum implementasi.

---

## 1. Konteks entitas yang sudah ada (tidak diubah)
```
RTUPP ──< Team ──< User(PETUGAS/ADMIN)
RTUPP ──< Location(rtuppId)          [tenant boundary]
Location(GI) ──< Feeder(penyulang)
Location(GI) ──< Asset(RTU/…)        (Asset.feederId → Feeder)
Location ──< InspeksiGiReport         (preventif)
Location ──< HarGiReport              (korektif)
Location ──< Ticket                   ← dilabeli "Work Order" di nav, kini generic
ScadaRtuSnapshot ──< ScadaRtuPoint    (DI MASTER + RC, per bay)
audit_logs                            (jejak transisi)
```

---

## 2. Dua opsi realisasi (pilih satu)

### ✅ Opsi A — **Perluas tabel `tickets`** menjadi Work Order (REKOMENDASI)
**Alasan:** `tickets` sudah ada, sudah di-nav sebagai "Work Order", sudah punya `locationId`
(→ tenant via `rtuppId`), `ticketNumber`, `priority`, `status`, `assignedTo`, `notes`,
`openedAt/closedAt`. Reuse maksimum, satu tabel manajemen kerja (berlaku juga untuk GH/MP nanti).
Risiko: tabel generic menampung kolom GI-workflow (mitigasi: nullable + `type`).

**Kolom ADDITIVE pada `tickets` (semua nullable / default — backward compatible):**
| Kolom | Tipe | Guna |
|---|---|---|
| `type` | `WorkOrderType?` (enum) | PREVENTIVE / CORRECTIVE |
| `teamId` | `VarChar(36)?` FK→Team | tim pelaksana |
| `feederId` | `VarChar(36)?` FK→Feeder | penyulang target (opsional) |
| `assetId` | `VarChar(36)?` FK→Asset | aset target, mis. RTU (opsional) |
| `dueDate` | `Date?` | jatuh tempo |
| `completedAt` | `DateTime?` | saat laporan tervalidasi / WO selesai (closedAt sudah ada utk CLOSE) |
| `createdBy` | sudah lazim dipakai modul lain (tambah bila belum) | penerbit WO |

**Enum status:** perluas `TicketStatus` additive →
`OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED` **+** `SUBMITTED, APPROVED, REJECTED`.
(Kanonik WO memakai OPEN/IN_PROGRESS/SUBMITTED/APPROVED/REJECTED/CLOSED; ASSIGNED/RESOLVED
dibiarkan demi kompatibilitas data lama.)

### Opsi B — Tabel baru `work_orders` (alternatif, pemisahan tegas)
Buat tabel `work_orders` khusus (field seperti sketsa user). Lebih bersih untuk GI tapi
menduplikasi konsep manajemen kerja dengan `tickets`, dan nav "Work Order" sudah menunjuk `/tickets`.
Dipakai bila stakeholder ingin WO benar-benar terpisah dari tiket generik.

> **Rekomendasi:** **Opsi A**. Sisa dokumen ini memakai Opsi A; field-nya identik bila memilih B
> (tinggal pindah ke tabel sendiri).

---

## 3. Model Work Order (PROPOSAL — Opsi A, notasi Prisma)

```prisma
// ADDITIVE pada model Ticket yang sudah ada (bukan tabel baru):
enum WorkOrderType {
  PREVENTIVE   // → menghasilkan Inspeksi GI
  CORRECTIVE   // → menghasilkan HAR GI
}

// TicketStatus diperluas (additive, aman di MySQL):
enum TicketStatus {
  OPEN
  ASSIGNED       // (legacy, dipertahankan)
  IN_PROGRESS
  SUBMITTED      // + baru: laporan dikirim
  APPROVED       // + baru: laporan tervalidasi
  REJECTED       // + baru: laporan ditolak
  RESOLVED       // (legacy, dipertahankan)
  CLOSED
}

model Ticket {                 // = Work Order
  // --- existing (tidak diubah) ---
  id           String         @id
  locationId   String                       // Lokasi GI (tenant via location.rtuppId)
  ticketNumber String         @unique        // nomor WO, auto-generate "WO-GI-YYYYMM-####"
  priority     TicketPriority @default(MEDIUM)
  status       TicketStatus   @default(OPEN)
  assignedTo   String?                       // PETUGAS pelaksana (User)
  notes        String?
  openedAt     DateTime?
  closedAt     DateTime?                      // saat CLOSE
  // --- ADDITIVE (baru, nullable/default) ---
  type        WorkOrderType?                  // PREVENTIVE / CORRECTIVE
  teamId      String?                         // Team pelaksana
  feederId    String?                         // Penyulang target (opsional)
  assetId     String?                         // Aset target, mis. RTU (opsional)
  dueDate     DateTime?      @db.Date         // jatuh tempo
  completedAt DateTime?                        // saat APPROVED/selesai
  // relasi baru
  team   Team?    @relation(fields: [teamId], references: [id])
  feeder Feeder?  @relation(fields: [feederId], references: [id])
  asset  Asset?   @relation(fields: [assetId], references: [id])
}
```

**Link laporan → WO (ADDITIVE, nullable — kunci ketertelusuran):**
```prisma
model InspeksiGiReport {
  // ...existing...
  workOrderId String?  @db.VarChar(36)   // FK → Ticket.id (WO PREVENTIVE)
  workOrder   Ticket?  @relation("InspeksiWorkOrder", fields: [workOrderId], references: [id])
  @@index([workOrderId])
}
model HarGiReport {
  // ...existing...
  workOrderId String?  @db.VarChar(36)   // FK → Ticket.id (WO CORRECTIVE)
  workOrder   Ticket?  @relation("HarWorkOrder", fields: [workOrderId], references: [id])
  @@index([workOrderId])
}
```

> **Kardinalitas (sprint ini):** 1 WO ↔ 0..1 laporan (Inspeksi **atau** HAR sesuai `type`).
> `workOrderId` unik-lemah via logika service (boleh ditegakkan dengan unique index di fase lanjut).

---

## 4. Pemetaan field sketsa user → desain (Opsi A)
| Sketsa user | Realisasi |
|---|---|
| `id`, `number`, `status` | `Ticket.id`, `Ticket.ticketNumber`, `Ticket.status` |
| `type` | `Ticket.type` (WorkOrderType) **baru** |
| `rtuppId` | **diturunkan** dari `location.rtuppId` (tidak duplikasi kolom) |
| `teamId`, `assignedTo` | `Ticket.teamId` **baru**, `Ticket.assignedTo` existing |
| `locationId` | `Ticket.locationId` existing |
| `createdBy` | `Ticket.createdBy` (tambah bila belum ada) |
| `dueDate`, `completedAt` | `Ticket.dueDate`, `Ticket.completedAt` **baru** (CLOSE → `closedAt`) |
| `notes` | `Ticket.notes` existing |

---

## 5. Sumber dropdown (form WO) — reuse data yang sudah benar
| Field | Sumber (endpoint/lookup existing) |
|---|---|
| Lokasi GI | `GET /locations?type=GI` → `useLocationOptions("GI")` |
| Penyulang | `GET /feeders?locationId=` → `useFeederOptions(locationId)` |
| Aset (RTU dll) | `GET /assets?locationId=` → `useAssetOptions({locationId})` |
| Petugas | `GET /users` → `useUserOptions` |
| Tim | `GET /teams` (di RTUPP) |

> Tidak ada master data baru. WO menumpang data GI/aset/penyulang yang sudah ada & benar.

---

## 6. Indeks & integritas (proposal)
- Index baru: `tickets(type)`, `tickets(teamId)`, `tickets(dueDate)`; `*_gi_reports(workOrderId)`.
- FK `onUpdate: Restrict` (pola schema ini), report.workOrderId `onDelete: SetNull` (WO boleh dihapus tanpa membunuh laporan historis).
- Nomor WO: generator `WO-GI-{YYYYMM}-{seq}` (pola serupa ticketNumber yang sudah ada).

## 7. Dampak migrasi (saat nanti diimplementasi — BUKAN sekarang)
- 1 enum baru (`WorkOrderType`), 3 nilai enum tambahan (`TicketStatus`).
- ~6 kolom additive di `tickets`, 1 kolom additive di masing-masing `inspeksi_gi_reports` & `har_gi_reports`.
- Semua nullable/berdefault → **tidak** memecah data lama. Tidak ada drop/rename.

> **Belum dieksekusi.** Migration hanya dibuat setelah desain ini disetujui (lihat ROADMAP Sprint 1).
