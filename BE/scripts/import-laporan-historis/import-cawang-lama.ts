/**
 * Follow-up to run-import.ts: creates the missing Location "GI CAWANG LAMA"
 * and imports the one HAR GI row that was skipped for it (row14, source
 * "Laporan Har GI.xlsx"). Same mapping rules as run-import.ts's HAR GI block;
 * status VALIDATED (GiReportStatus has no APPROVED value), historis tag goes
 * into penanganan.catatanLain (laporan_har_gi has no notes/catatan column).
 */
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "fs";
import crypto from "crypto";

const prisma = new PrismaClient();
const IMPORT_DATE = "2026-07-20";
const SOURCE_FILE = "Laporan Har GI.xlsx";
const RTUPP1_ID = "ff154092-9dc3-49ff-b8a3-88b5180110e9";

const extractedPath =
  "C:/Users/Pongo/AppData/Local/Temp/claude/d--VoltReport/a95ab475-a0fa-427d-bec8-5e0bd7d0208d/scratchpad/extracted.json";

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

async function main() {
  const raw = fs.readFileSync(extractedPath, "utf-8");
  const data: Record<string, Dataset> = JSON.parse(raw);
  const ds = data.har_gi;
  const cols = buildColMap(ds.headers);
  const row = ds.rows.find((r) => {
    const g = mk(r, cols);
    return String(g("GARDU INDUK") ?? "").trim() === "CAWANG LAMA";
  });
  if (!row) throw new Error("Row 'CAWANG LAMA' not found in extracted.json — nothing to import");

  const master = await prisma.user.findFirst({ where: { role: "MASTER" }, orderBy: { createdAt: "asc" } });
  if (!master) throw new Error("No MASTER user found");
  const MASTER_ID = master.id;

  await prisma.$transaction(async (tx) => {
    // STEP 1 — create the missing Location
    const existing = await tx.location.findUnique({ where: { code: "GI-CAWANG-LAMA" } });
    const loc =
      existing ??
      (await tx.location.create({
        data: {
          code: "GI-CAWANG-LAMA",
          name: "GI CAWANG LAMA",
          locationType: "GI",
          status: true,
          rtuppId: RTUPP1_ID,
          up3: "UPT CAWANG",
          deletedAt: null,
          createdBy: MASTER_ID,
          updatedBy: MASTER_ID,
        },
      }));
    console.log("Location:", existing ? "already existed" : "created", loc.code, loc.id);

    // STEP 2 — import the row (mirrors run-import.ts HAR GI block)
    const g = mk(row, cols);
    const tglIso = String(g("TGL. PEKERJAAN"));

    const penyulangName = clean(g("PENYULANG"));
    let feederId: string | null = null;
    if (penyulangName) {
      const feeder = await tx.feeder.findFirst({
        where: { locationId: loc.id, feederName: { contains: penyulangName } },
      });
      feederId = feeder?.id ?? null;
    }

    // Deterministic Asset naming convention (ASET-<code>) — brand new location,
    // no Asset registered yet, so this naturally resolves to null (consistent
    // with GROGOL BARU/BINTARO BARU/ULUJAMI handling in the main import: no
    // create, I/O data still preserved in the io{} JSON payload).
    const assetCode = `ASET-${loc.code}`;
    const asset = await tx.asset.findFirst({ where: { assetCode, deletedAt: null } });
    const ioMerk = clean(g("MERK I/O"));
    const ioType = clean(g("TYPE I/O"));
    const ioSn = clean(g("SN. I/O"));
    const ioKondisi = clean(g("KONDISI I/O"));

    const penyebab = clean(g("PENYEBAB GANGGUAN"));
    const catatanLain = clean(g("CATATAN LAIN"));
    const historisTag = `[Data historis import Excel ${SOURCE_FILE} ${IMPORT_DATE}]`;

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

    console.log("Inserted laporan_har_gi for GI CAWANG LAMA, WO:", wo.woNumber);
  });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
