/**
 * One-shot historical import: 3 Excel files -> laporan_har_gi / laporan_har_gh /
 * laporan_har_mp (+ placeholder WorkOrders + Asset RTU updates). Inspeksi Gardu
 * Hubung new.xlsx is intentionally excluded (byte-identical duplicate of
 * Laporan Har Gardu Hubung.xlsx). See conversation / Fase 1 report for the
 * full decision log behind these rules.
 *
 * Usage: DRY_RUN=1 npx tsx scripts/import-laporan-historis/run-import.ts   (no commit, logs plan)
 *        npx tsx scripts/import-laporan-historis/run-import.ts             (real import)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "fs";
import crypto from "crypto";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";
const IMPORT_DATE = "2026-07-20";

const extractedPath =
  "C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json";

// Laporan Inspeksi Gardu Hubung new.xlsx SENGAJA tidak diimport — 100% identik
// dengan Laporan Har Gardu Hubung.xlsx (duplikat file, keputusan user 2026-07-20).
const SOURCE_FILES: Record<string, string> = {
  har_gi: "Laporan Har GI.xlsx",
  har_gh: "Laporan Har Gardu Hubung.xlsx",
  har_mp: "Laporan Har Gardu.xlsx",
};

type RowMap = Record<string, unknown>;
type Dataset = { headers: Record<string, string>; rows: RowMap[] };

function clean(v: unknown): string | null {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" || s === "-" ? null : s;
}
function cleanNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildColMap(headers: Record<string, string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [colStr, name] of Object.entries(headers)) {
    if (typeof name === "string") m.set(name.trim(), Number(colStr));
  }
  return m;
}

function mk(row: RowMap, cols: Map<string, number>) {
  return (headerName: string): unknown => {
    const c = cols.get(headerName.trim());
    if (c === undefined) throw new Error(`Header not found: '${headerName}'`);
    return row[String(c)];
  };
}

function shortHex(len = 6) {
  return crypto.randomBytes(len).toString("hex").toUpperCase().slice(0, len);
}

function ymd(iso: string) {
  return iso.slice(0, 10).replace(/-/g, "");
}

function conditionToAssetStatus(v: string | null): "ACTIVE" | "WARNING" | "DAMAGED" | null {
  if (!v) return null;
  const s = v.toUpperCase();
  if (s.includes("RUSAK")) return "DAMAGED";
  if (s === "BAIK") return "ACTIVE";
  if (s.includes("PERLU")) return "WARNING";
  return null;
}

// Asset.serialNumber is globally UNIQUE. Several rows in this dataset carry the
// same serial across genuinely different gardu (same RTU brand/model batch —
// confirmed not a data bug). Overwriting would crash on uq_asset_serial, so we
// keep the first writer and leave later collisions untouched.
async function safeSerialNumber(
  tx: Prisma.TransactionClient,
  assetId: string,
  currentSerial: string | null,
  newSerial: string | null,
  onConflict: () => void
): Promise<string | null> {
  if (!newSerial || newSerial === currentSerial) return currentSerial;
  const conflict = await tx.asset.findFirst({
    where: { serialNumber: newSerial, id: { not: assetId }, deletedAt: null },
    select: { id: true },
  });
  if (conflict) {
    onConflict();
    return currentSerial;
  }
  return newSerial;
}

async function main() {
  const raw = fs.readFileSync(extractedPath, "utf-8");
  const data: Record<string, Dataset> = JSON.parse(raw);

  const master = await prisma.user.findFirst({ where: { role: "MASTER" }, orderBy: { createdAt: "asc" } });
  if (!master) throw new Error("No MASTER user found");
  const MASTER_ID = master.id;

  const stats = {
    har_gi: { inserted: 0, skipped: [] as string[] },
    har_gh: { inserted: 0, skipped: [] as string[] },
    har_mp: { inserted: 0, skipped: [] as string[] },
    assetRtuUpdated: 0,
    serialConflictsSkipped: [] as string[],
    woCreated: 0,
  };

  const run = async (tx: Prisma.TransactionClient) => {
    // ================= HAR GI =================
    {
      const ds = data.har_gi;
      const cols = buildColMap(ds.headers);
      for (const row of ds.rows) {
        const g = mk(row, cols);
        const garduVal = String(g("GARDU INDUK") ?? "").trim();
        const tglIso = String(g("TGL. PEKERJAAN"));

        if (garduVal === "CAWANG LAMA") {
          stats.har_gi.skipped.push(`row${row._row}: GI CAWANG LAMA belum ada di master Location — skip`);
          continue;
        }

        const loc = await tx.location.findFirst({
          where: { name: { contains: garduVal }, locationType: "GI", deletedAt: null },
        });
        if (!loc) {
          stats.har_gi.skipped.push(`row${row._row}: lokasi '${garduVal}' tidak ketemu`);
          continue;
        }

        // Feeder best-effort match by penyulang name under this GI
        const penyulangName = clean(g("PENYULANG"));
        let feederId: string | null = null;
        if (penyulangName) {
          const feeder = await tx.feeder.findFirst({
            where: { locationId: loc.id, feederName: { contains: penyulangName } },
          });
          feederId = feeder?.id ?? null;
        }

        // Asset RTU (I/O) target: deterministic naming ASET-<code>
        const assetCode = `ASET-${loc.code}`;
        const asset = await tx.asset.findFirst({ where: { assetCode, deletedAt: null } });
        const ioMerk = clean(g("MERK I/O"));
        const ioType = clean(g("TYPE I/O"));
        const ioSn = clean(g("SN. I/O"));
        const ioKondisi = clean(g("KONDISI I/O"));
        if (asset && (ioMerk || ioType || ioSn)) {
          const newStatus = conditionToAssetStatus(ioKondisi);
          const serialNumber = await safeSerialNumber(tx, asset.id, asset.serialNumber, ioSn, () =>
            stats.serialConflictsSkipped.push(`har_gi row${row._row} [${asset.assetCode}]: SN '${ioSn}' sudah dipakai asset lain, dilewati`)
          );
          await tx.asset.update({
            where: { id: asset.id },
            data: {
              brand: ioMerk ?? asset.brand,
              model: ioType ?? asset.model,
              serialNumber,
              status: newStatus ?? asset.status,
              updatedBy: MASTER_ID,
            },
          });
          stats.assetRtuUpdated++;
        }

        const penyebab = clean(g("PENYEBAB GANGGUAN"));
        const catatanLain = clean(g("CATATAN LAIN"));
        const historisTag = `[Data historis import Excel ${SOURCE_FILES.har_gi} ${IMPORT_DATE}]`;

        const wo = await tx.workOrder.create({
          data: {
            woNumber: `WO-HIST-${loc.code}-${ymd(tglIso)}-${shortHex()}`,
            type: "CORRECTIVE",
            status: "CLOSED",
            title: `[HISTORIS] HAR GI ${loc.name} ${tglIso.slice(0, 10)}`,
            locationId: loc.id,
            feederId,
            createdById: MASTER_ID,
            approvedById: MASTER_ID,
            approvedAt: new Date(tglIso),
            closedAt: new Date(tglIso),
            requiredReports: ["HAR"],
          },
        });
        stats.woCreated++;

        await tx.laporanHarGi.create({
          data: {
            workOrderId: wo.id,
            locationId: loc.id,
            feederId,
            assetId: asset?.id ?? null,
            up3: loc.up3,
            reportDate: new Date(tglIso),
            ketKunjungan: clean(g("KET. KUNJUNGAN")),
            pelaksana: clean(g("PELAKSANA")),
            pengawas: clean(g("PENGAWAS")),
            inspectorId: null,
            status: "VALIDATED",
            statusGarduSebelum: clean(g("STATUS GARDU SEBELUM")),
            statusGarduSesudah: clean(g("STATUS GARDU SESUDAH")),
            statusPekerjaan: clean(g("STATUS PEKERJAAN")),
            penyebabGangguan: penyebab ? [penyebab] : Prisma.JsonNull,
            io: { merk: ioMerk, type: ioType, sn: ioSn, kondisi: ioKondisi, catatan: clean(g("CATATAN I/O")) },
            relay: {
              merk: clean(g("MERK RELAY")),
              type: clean(g("TYPE RELAY")),
              sn: clean(g("SN. RELAY")),
              kondisi: clean(g("KONDISI RELAY")),
              catatan: clean(g("CATATAN RELAY")),
            },
            rectifier: {
              merk: clean(g("MERK RECTIFIER")),
              type: clean(g("TYPE RECTIFIER")),
              sn: clean(g("SN. RECTIFIER")),
              kondisi: clean(g("KONDISI RECTIFIER")),
              catatan: clean(g("CATATAN RECTIFIER")),
            },
            baterai: {
              jenis: clean(g("JENIS BATERAI")),
              merk: clean(g("MERK BATERAI")),
              type: clean(g("TYPE BATERAI")),
              kondisi: clean(g("KONDISI BATERAI")),
              catatan: clean(g("CATATAN BATERAI")),
            },
            serialDevice: {
              jumlah: clean(g("JUMLAH SERIAL DEVICE")),
              utama: {
                merk: clean(g("MERK SERIAL DEVICE UTAMA")),
                type: clean(g("TYPE SERIAL DEVICE UTAMA")),
                kondisi: clean(g("KONDISI SERIAL DEVICE UTAMA")),
                jumlahPort: cleanNum(g("JUMLAH SERIAL PORT DEVICE UTAMA")),
                portTerpakai: cleanNum(g("JUMLAH SERIAL PORT YANG TERPAKAI (DEVICE UTAMA)")),
                blinking: cleanNum(g("JUMLAH BLINKING SERIAL PORT YANG TERPAKAI (DEVICE UTAMA)")),
                keterangan: clean(g("KETERANGAN SERIAL DEVICE UTAMA")),
                kesimpulan: clean(g("KESIMPULAN KODISI SERIAL DEVICE UTAMA")),
              },
              device2: {
                merk: clean(g("MERK SERIAL DEVICE KE-2")),
                type: clean(g("TYPE SERIAL DEVICE KE-2")),
                kondisi: clean(g("KONDISI SERIAL DEVICE KE-2")),
                jumlahPort: cleanNum(g("JUMLAH SERIAL PORT DEVICE KE-2")),
                portTerpakai: cleanNum(g("JUMLAH SERIAL PORT YANG TERPAKAI (DEVICE KE-2)")),
                blinking: cleanNum(g("JUMLAH BLINKING SERIAL PORT YANG TERPAKAI (DEVICE KE-2)")),
                keterangan: clean(g("KETERANGAN SERIAL DEVICE KE-2")),
                kesimpulan: clean(g("KESIMPULAN KODISI SERIAL DEVICE KE-2")),
              },
            },
            cctv: {
              bullet: {
                merk: clean(g("MERK CCTV BULLET")),
                jumlah: cleanNum(g("JUMLAH CCTV BULLET")),
                kondisi: clean(g("KONDISI CCTV BULLET")),
                pengukuran: clean(g("PENGUKURAN TENGANGGAN CCTV BULLET")),
                catatan: clean(g("CATATAN CCTV BULLET")),
              },
              ptz: {
                merk: clean(g("MERK CCTV PTZ")),
                jumlah: cleanNum(g("JUMLAH CCTV PTZ")),
                kondisi: clean(g("KONDISI CCTV PTZ")),
                pengukuran: clean(g("PENGUKURAN TENGANGGAN CCTV PTZ")),
                catatan: clean(g("CATATAN CCTV PTZ")),
              },
              nvr: {
                merk: clean(g("MERK NVR")),
                type: clean(g("TYPE NVR")),
                kondisi: clean(g("KONDISI NVR")),
                catatan: clean(g("CATATAN NVR")),
              },
              switchPoe: {
                merk: clean(g("MERK SWITCH PoE")),
                kondisi: clean(g("KONDISI SWITCH PoE")),
                catatan: clean(g("CATATAN SWITCH PoE")),
                jumlahPort: cleanNum(g("JUMLAH SEMUA PORT SWITCH PoE")),
                portTerpakai: cleanNum(g("JUMLAH PORT SWITCH PoE TERPAKAI")),
                blinking: clean(g("BLINKING PORT SWITCH PoE TERPAKAI")),
                pengukuran: clean(g("PENGUKURAN TEGANGAN PoE")),
                catatanBlinking: clean(g("CATATAN BLINKING PORT SWITCH PoE TERPAKAI")),
              },
            },
            penanganan: {
              analisa: clean(g("ANALISA PENYEBAB")),
              langkah: clean(g("LANGKAH PEKERJAAN")),
              hasil: clean(g("HASIL PEKERJAAN")),
              tambahan: clean(g("TAMBAHAN")),
              catatanLain: [catatanLain, historisTag].filter(Boolean).join(" | "),
            },
            submittedAt: new Date(tglIso),
            validatedAt: new Date(tglIso),
            validatedBy: MASTER_ID,
            createdBy: MASTER_ID,
            updatedBy: MASTER_ID,
          },
        });
        stats.har_gi.inserted++;
      }
    }

    // ================= HAR GH =================
    {
      const ds = data.har_gh;
      const cols = buildColMap(ds.headers);

      for (const row of ds.rows) {
        const g = mk(row, cols);

        const garduVal = String(g("GARDU HUBUNG") ?? "").trim();
        const tglIso = String(g("TANGGAL PEKERJAAN"));

        const loc = await tx.location.findFirst({ where: { code: garduVal, deletedAt: null } });
        if (!loc) {
          stats.har_gh.skipped.push(`row${row._row}: lokasi '${garduVal}' tidak ketemu`);
          continue;
        }

        const penyulangName = clean(g("NAMA PENYULANG"));
        let feederId: string | null = null;
        if (penyulangName) {
          const feeder = await tx.feeder.findFirst({
            where: { locationId: loc.id, feederName: { contains: penyulangName } },
          });
          feederId = feeder?.id ?? null;
        }

        const rtuMerk = clean(g("MERK RTU"));
        const rtuType = clean(g("TYPE RTU"));
        const rtuSn = clean(g("SERIAL NUMBER RTU"));
        const rtuKesimpulan = clean(g("KESIMPULAN KODISI RTU"));
        const rtuOperState = clean(g("KONDISI RTU")); // ON/OFF power state, not condition
        const rtuAsset = await tx.asset.findFirst({
          where: { assetCode: loc.code, assetType: "RTU", deletedAt: null },
        });
        if (rtuAsset && (rtuMerk || rtuType || rtuSn)) {
          const newStatus = conditionToAssetStatus(rtuKesimpulan);
          const serialNumber = await safeSerialNumber(tx, rtuAsset.id, rtuAsset.serialNumber, rtuSn, () =>
            stats.serialConflictsSkipped.push(`har_gh row${row._row} [${rtuAsset.assetCode}]: SN '${rtuSn}' sudah dipakai asset lain, dilewati`)
          );
          await tx.asset.update({
            where: { id: rtuAsset.id },
            data: {
              brand: rtuMerk ?? rtuAsset.brand,
              model: rtuType ?? rtuAsset.model,
              serialNumber,
              status: newStatus ?? rtuAsset.status,
              operState: rtuOperState ?? rtuAsset.operState,
              updatedBy: MASTER_ID,
            },
          });
          stats.assetRtuUpdated++;
        }

        const buildKubikel = (g: ReturnType<typeof mk>) => [
          {
            namaPenyulang: clean(g("NAMA PENYULANG")),
            merekCubicle: clean(g("MEREK CUBICLE")),
            tipeRcCubicle: clean(g("TIPE RC CUBICLE")),
            statusCubicle: clean(g("STATUS CUBICLE ")),
            statusCubicleMaster: clean(g("STATUS CUBICLE MASTER")),
            statusLr: clean(g("STATUS L/R CUBICLE")),
            statusLrMaster: clean(g("STATUS L/R MASTER")),
            statusMfs: clean(g("STATUS MFS CUBICLE")),
            statusMfsMaster: clean(g("STATUS MSF MASTER")),
            statusHfd: clean(g("STATUS HFD CUBICLE")),
            statusHfdMaster: clean(g("STATUS HFD MASTER")),
            testRcDummy: clean(g("TEST RC/DUMMY")),
            statusRc: clean(g("STATUS RC")),
            catatan: clean(g("CATATAN CUBICLE")),
          },
        ];

        const historisTag = `[Data historis import Excel ${SOURCE_FILES.har_gh} ${IMPORT_DATE}]`;
        const payload = {
          supplyTr: {
            sumber220v: clean(g("SUMBER 220V")),
            supplyTr: clean(g("SUPPLY TR")),
            mcbSumberRectifier: clean(g("MCB SUMBER RECTIFIER")),
          },
          rectifier: {
            merk: clean(g("MERK RECTIFIER")),
            type: clean(g("TYPE RECTIFIER")),
            sn: clean(g("SERIAL NUMBER RECTIFIER")),
            kondisi: clean(g("KONDISI RECTIFIER")),
            keterangan: clean(g("KETERANGAN RECTIFIER")),
            kesimpulan: clean(g("KESIMPULAN KODISI RECTIFIER")),
            kategori: clean(g("KATEGORI RECTIFIER")),
          },
          baterai: {
            jenis: clean(g("JENIS BATERAI")),
            merk: clean(g("MERK BATTERY")),
            type: clean(g("TYPE BATTERY")),
            jumlahCell: cleanNum(g("JUMLAH BATTERY  (Cell)")),
            levelAir: clean(g("LEVEL AIR BATTERY")),
            keterangan: clean(g("KETERANGAN BATTERY")),
            kesimpulan: clean(g("KESIMPULAN KODISI BATTERY")),
            kategori: clean(g("KATEGORI BATERAI")),
          },
          rtu: {
            merk: clean(g("MERK RTU")),
            type: clean(g("TYPE RTU")),
            sn: clean(g("SERIAL NUMBER RTU")),
            operState: clean(g("KONDISI RTU")),
            kesimpulan: clean(g("KESIMPULAN KODISI RTU")),
            kategori: clean(g("KATEGORI RTU")),
            keterangan: clean(g("KETERANGAN RTU")),
          },
          media1: {
            merkMedia: clean(g("MERK MEDIA")),
            typeMedia: clean(g("TYPE MEDIA")),
            snMedia: clean(g("SERIAL NUMBER MEDIA")),
            kondisiMedia: clean(g("KONDISI MEDIA")),
            pairChannel: clean(g("PAIR CHANNEL")),
            asdu: clean(g("ASDU")),
            kesimpulan: clean(g("KESIMPULAN KODISI MEDIA")),
          },
          media2: {
            merk: clean(g("MERK MEDIA -2")),
            type: clean(g("TYPE MEDIA -2")),
            sn: clean(g("SERIAL NUMBER MEDIA -2")),
            kondisi: clean(g("KONDISI MEDIA -2")),
            kesimpulan: clean(g("KESIMPULAN KODISI MEDIA -2")),
          },
          kubikel: buildKubikel(g),
          fdiRelay: {
            ada: clean(g("ADA FDI/RELAY PROTEKSI? (BUKAN PB/TRAFO)")),
            jumlah: cleanNum(g("JUMLAH FDI/RELAY PROTEKSI (BUKAN PB/TRAFO)")),
            listData: clean(g("LIST DATA PENYULANG/ARAH DAN MERK FDI/RELAY PROTEKSI")),
          },
          aco: {
            ada: clean(g("ADA ACO?")),
            jumlah: cleanNum(g("JUMLAH ACO")),
          },
          catatan: clean(g("CATATAN")),
          notes: `${clean(g("CATATAN")) ?? ""} ${historisTag}`.trim(),
        };

        const wo = await tx.workOrder.create({
          data: {
            woNumber: `WO-HIST-${loc.code}-${ymd(tglIso)}-${shortHex()}`,
            type: "CORRECTIVE",
            status: "CLOSED",
            title: `[HISTORIS] HAR GH ${loc.code} ${tglIso.slice(0, 10)}`,
            locationId: loc.id,
            feederId,
            createdById: MASTER_ID,
            approvedById: MASTER_ID,
            approvedAt: new Date(tglIso),
            closedAt: new Date(tglIso),
            requiredReports: ["HAR_GH"],
          },
        });
        stats.woCreated++;

        await tx.laporanHarGh.create({
          data: {
            workOrderId: wo.id,
            locationId: loc.id,
            feederId,
            up3: loc.up3,
            reportDate: new Date(tglIso),
            pelaksana: clean(g("PELAKSANA")),
            inspectorId: null,
            status: "VALIDATED",
            statusRc: payload.kubikel[0].statusRc,
            statusCubicle: payload.kubikel[0].statusCubicle,
            statusCubicleMaster: payload.kubikel[0].statusCubicleMaster,
            statusLr: payload.kubikel[0].statusLr,
            statusLrMaster: payload.kubikel[0].statusLrMaster,
            supplyTr: payload.supplyTr,
            rectifier: payload.rectifier,
            baterai: payload.baterai,
            rtu: payload.rtu,
            media1: payload.media1,
            media2: payload.media2,
            kubikel: payload.kubikel,
            fdiRelay: payload.fdiRelay,
            aco: payload.aco,
            notes: payload.notes,
            catatan: payload.catatan,
            submittedAt: new Date(tglIso),
            validatedAt: new Date(tglIso),
            validatedBy: MASTER_ID,
            createdBy: MASTER_ID,
            updatedBy: MASTER_ID,
          },
        });
        stats.har_gh.inserted++;
      }
    }

    // ================= HAR MP =================
    {
      const ds = data.har_mp;
      const cols = buildColMap(ds.headers);
      for (const row of ds.rows) {
        const g = mk(row, cols);
        const garduVal = String(g("GARDU") ?? "").trim();
        const tglIso = String(g("TANGGAL PEKERJAAN"));

        const loc = await tx.location.findFirst({ where: { code: garduVal, deletedAt: null } });
        if (!loc) {
          stats.har_mp.skipped.push(`row${row._row}: lokasi '${garduVal}' tidak ketemu`);
          continue;
        }

        const feederId = loc.supplyFeederId ?? null;

        const rtuMerk = clean(g("MERK RTU"));
        const rtuType = clean(g("TYPE RTU"));
        const rtuSn = clean(g("SERIAL NUMBER RTU"));
        const rtuKesimpulan = clean(g("KESIMPULAN KODISI RTU"));
        const rtuOperState = clean(g("KONDISI RTU"));
        const rtuAsset = await tx.asset.findFirst({
          where: { assetCode: loc.code, assetType: "RTU", deletedAt: null },
        });
        if (rtuAsset && (rtuMerk || rtuType || rtuSn)) {
          const newStatus = conditionToAssetStatus(rtuKesimpulan);
          const serialNumber = await safeSerialNumber(tx, rtuAsset.id, rtuAsset.serialNumber, rtuSn, () =>
            stats.serialConflictsSkipped.push(`har_mp row${row._row} [${rtuAsset.assetCode}]: SN '${rtuSn}' sudah dipakai asset lain, dilewati`)
          );
          await tx.asset.update({
            where: { id: rtuAsset.id },
            data: {
              brand: rtuMerk ?? rtuAsset.brand,
              model: rtuType ?? rtuAsset.model,
              serialNumber,
              status: newStatus ?? rtuAsset.status,
              operState: rtuOperState ?? rtuAsset.operState,
              updatedBy: MASTER_ID,
            },
          });
          stats.assetRtuUpdated++;
        }

        const kubikel = [
          {
            namaGardu: clean(g("NAMA GARDU")),
            merekCubicle: clean(g("MEREK CUBICLE")),
            arahRc: clean(g("ARAH RC ")),
            tipeGardu: clean(g("TIPE GARDU")),
            tipeGarduMaster: clean(g("TIPE GARDU MASTER")),
            statusCubicle: clean(g("STATUS CUBICLE ")),
            statusCubicleMaster: clean(g("STATUS CUBICLE MASTER")),
            statusLr: clean(g("STATUS L/R CUBICLE")),
            statusLrMaster: clean(g("STATUS L/R MASTER")),
            testRcDummy: clean(g("TEST RC/DUMMY")),
            statusRc: clean(g("STATUS RC")),
            catatan: clean(g("CATATAN CUBICLE")),
          },
        ];

        const catatan = clean(g("CATATAN"));
        const historisTag = `[Data historis import Excel ${SOURCE_FILES.har_mp} ${IMPORT_DATE}]`;

        const wo = await tx.workOrder.create({
          data: {
            woNumber: `WO-HIST-${loc.code}-${ymd(tglIso)}-${shortHex()}`,
            type: "CORRECTIVE",
            status: "CLOSED",
            title: `[HISTORIS] HAR MP ${loc.code} ${tglIso.slice(0, 10)}`,
            locationId: loc.id,
            feederId,
            createdById: MASTER_ID,
            approvedById: MASTER_ID,
            approvedAt: new Date(tglIso),
            closedAt: new Date(tglIso),
            requiredReports: ["HAR_MP"],
          },
        });
        stats.woCreated++;

        await tx.laporanHarMp.create({
          data: {
            workOrderId: wo.id,
            locationId: loc.id,
            feederId,
            up3: loc.up3,
            reportDate: new Date(tglIso),
            pelaksana: clean(g("PELAKSANA")),
            inspectorId: null,
            status: "VALIDATED",
            statusRc: kubikel[0].statusRc,
            statusCubicle: kubikel[0].statusCubicle,
            statusCubicleMaster: kubikel[0].statusCubicleMaster,
            statusLr: kubikel[0].statusLr,
            statusLrMaster: kubikel[0].statusLrMaster,
            supplyTr: {
              sumber220v: clean(g("SUMBER 220V")),
              supplyTr: clean(g("SUPPLY TR")),
              mcbSumberRectifier: clean(g("MCB SUMBER RECTIFIER")),
            },
            rectifier: {
              merk: clean(g("MERK RECTIFIER")),
              type: clean(g("TYPE RECTIFIER")),
              sn: clean(g("SERIAL NUMBER RECTIFIER")),
              kondisi: clean(g("KONDISI RECTIFIER")),
              keterangan: clean(g("KETERANGAN RECTIFIER")),
              kesimpulan: clean(g("KESIMPULAN KODISI RECTIFIER")),
              kategori: clean(g("KATEGORI RECTIFIER")),
            },
            baterai: {
              jenis: clean(g("JENIS BATERAI")),
              merk: clean(g("MERK BATTERY")),
              type: clean(g("TYPE BATTERY")),
              jumlahCell: cleanNum(g("JUMLAH BATTERY  (Cell)")),
              levelAir: clean(g("LEVEL AIR BATTERY")),
              keterangan: clean(g("KETERANGAN BATTERY")),
              kesimpulan: clean(g("KESIMPULAN KODISI BATTERY")),
              kategori: clean(g("KATEGORI BATERAI")),
            },
            rtu: {
              merk: rtuMerk,
              type: rtuType,
              sn: rtuSn,
              operState: rtuOperState,
              kesimpulan: rtuKesimpulan,
              kategori: clean(g("KATEGORI RTU")),
              keterangan: clean(g("KETERANGAN RTU")),
            },
            media1: {
              merkMedia: clean(g("MERK MEDIA")),
              typeMedia: clean(g("TYPE MEDIA")),
              snMedia: clean(g("SERIAL NUMBER MEDIA")),
              kondisiMedia: clean(g("KONDISI MEDIA")),
              pairChannel: clean(g("PAIR CHANNEL")),
              asdu: clean(g("ASDU")),
              kesimpulan: clean(g("KESIMPULAN KODISI MEDIA")),
            },
            media2: {
              merk: clean(g("MERK MEDIA -2")),
              type: clean(g("TYPE MEDIA -2")),
              sn: clean(g("SERIAL NUMBER MEDIA -2")),
              kondisi: clean(g("KONDISI MEDIA -2")),
              kesimpulan: clean(g("KESIMPULAN KODISI MEDIA -2")),
            },
            kubikel,
            fdiRelay: {
              ada: clean(g("ADA FDI/RELAY PROTEKSI? (BUKAN PB/TRAFO)")),
              jumlah: cleanNum(g("JUMLAH FDI/RELAY PROTEKSI (BUKAN PB/TRAFO)")),
              listData: clean(g("LIST DATA PENYULANG/ARAH DAN MERK FDI/RELAY PROTEKSI")),
            },
            aco: {
              ada: clean(g("ADA ACO?")),
              jumlah: cleanNum(g("JUMLAH ACO")),
            },
            catatan,
            notes: `${catatan ?? ""} ${historisTag}`.trim(),
            submittedAt: new Date(tglIso),
            validatedAt: new Date(tglIso),
            validatedBy: MASTER_ID,
            createdBy: MASTER_ID,
            updatedBy: MASTER_ID,
          },
        });
        stats.har_mp.inserted++;
      }
    }

    return stats;
  };

  if (DRY_RUN) {
    try {
      await prisma.$transaction(async (tx) => {
        const s = await run(tx);
        console.log("\n=== DRY RUN RESULT (rolled back, nothing committed) ===");
        console.log(JSON.stringify(s, null, 2));
        throw new Error("__DRY_RUN_ROLLBACK__");
      });
    } catch (e: any) {
      if (e.message !== "__DRY_RUN_ROLLBACK__") throw e;
    }
  } else {
    const s = await prisma.$transaction(
      async (tx) => run(tx),
      { timeout: 120000 }
    );
    console.log("\n=== IMPORT COMMITTED ===");
    console.log(JSON.stringify(s, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
