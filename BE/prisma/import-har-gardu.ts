/**
 * Bulk-import historical HAR (Pemeliharaan) equipment data from the field
 * team's external Google-Sheets-based logs into `HarGarduRecord` (additive
 * analytics table — see schema.prisma comment on the model). Mirrors
 * prisma/import-inspeksi-gardu.ts.
 *
 * Sources (158-166 columns each, header row 1 = a Google Sheets IMPORTRANGE
 * export, so header cells carry a cached formula `.result` rather than a plain
 * string — data rows are plain values):
 *   - "Laporan Har Gardu NEW1.xlsx"        -> sumberFile GARDU_MP
 *   - "Laporan Har Gardu Hubung NEW1.xlsx" -> sumberFile GARDU_HUBUNG
 *
 * Column-name quirks handled here (found by inspecting the actual files, not
 * assumed from the column list alone — the HAR sheets differ from inspeksi!):
 *   - The kode-gardu column is "GARDU" in the MP file but "GARDU HUBUNG" in GH.
 *   - MP has a top-level "PENYULANG"; GH only has per-cubicle "NAMA PENYULANG"
 *     (mapped from the FIRST cubicle block — empirically 100% empty in the
 *     current GH file, kept for parity with the inspeksi importer).
 *   - REVERSED vs the inspeksi files: here "KONDISI <X>" holds the clean
 *     BAIK / RUSAK / PERLU CEK LEBIH LANJUT verdict, while "KESIMPULAN KODISI
 *     <X>" holds a FREE-TEXT field note (up to ~158 chars — would overflow the
 *     VarChar(50) kesimpulan columns). So: kesimpulan* is filled from KONDISI
 *     (keeping "bermasalah" filters keyed on clean values, same semantic as
 *     inspeksi) and the free text goes to keterangan* (Text) — the dedicated
 *     "KETERANGAN <X>" columns are empirically empty in both files.
 *   - Baterai has no "KONDISI BATERAI" column. In the GH file the verdict
 *     lives in "KETERANGAN BATTERY" (BAIK/RUSAK/PERLU CEK LEBIH LANJUT,
 *     confirmed empirically); the MP file has no baterai verdict at all, so
 *     kesimpulanBaterai stays null there.
 *   - The HAR sheets have NO "STATUS SCADA" column. statusScada is derived
 *     from "STATUS GARDU SESUDAH" when its value is exactly INSCAN or OOP
 *     (covers ~78% of rows); anything else (BERHASIL RC, NORMAL, …) -> null.
 *   - ACO columns (ADA ACO / JUMLAH ACO / integrasi) exist in both headers but
 *     are 100% empty in the current files — mapped anyway for future re-runs.
 *
 * Modes (matches prisma/import-inspeksi-gardu.ts convention):
 *   (default)  DRY-RUN — reads + validates + prints a summary, no DB writes.
 *   --apply    Writes to DB via batched createMany.
 */
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

const FILES: Array<{ path: string; sumberFile: 'GARDU_MP' | 'GARDU_HUBUNG' }> = [
  { path: 'D:/VoltReport/Laporan Har Gardu NEW1.xlsx', sumberFile: 'GARDU_MP' },
  { path: 'D:/VoltReport/Laporan Har Gardu Hubung NEW1.xlsx', sumberFile: 'GARDU_HUBUNG' },
];

const BATCH_SIZE = 300;

// ── Cell helpers ─────────────────────────────────────────────────────────────

/** Unwrap exceljs cell values: header row carries {formula,result}; data rows are plain. */
function rawValue(v: unknown): unknown {
  if (v instanceof Date) return v;
  if (v && typeof v === 'object') {
    if ('result' in (v as any)) return (v as any).result;
    if ('richText' in (v as any)) return (v as any).richText.map((t: any) => t.text).join('');
  }
  return v;
}

function cleanStr(v: unknown): string | null {
  const raw = rawValue(v);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '' || s.toUpperCase() === 'NAN') return null;
  return s;
}

function cleanFloat(v: unknown): number | null {
  const raw = rawValue(v);
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function cleanInt(v: unknown): number | null {
  const f = cleanFloat(v);
  return f === null ? null : Math.trunc(f);
}

/** Handles native Date cells, "dd/mm/yyyy HH.MM.SS" strings, and JS Date.toString() strings. */
function parseDateLoose(v: unknown): Date | null {
  const raw = rawValue(v);
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    // Excel serial date (days since 1899-12-30)
    return new Date(Math.round((raw - 25569) * 86400 * 1000));
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2})[.:](\d{1,2})[.:](\d{1,2})$/);
  if (m) {
    const [, d, mo, y, h, mi, se] = m;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Maps a header name -> every column index it appears at (cubicle headers repeat). */
class HeaderIndex {
  private map = new Map<string, number[]>();

  constructor(headerRow: ExcelJS.Row) {
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const text = rawValue(cell.value);
      if (text === null || text === undefined) return;
      const key = String(text).trim();
      if (!key) return;
      const arr = this.map.get(key) ?? [];
      arr.push(colNumber);
      this.map.set(key, arr);
    });
  }

  /** First (or nth) column index for a header name, or undefined if absent. */
  col(name: string, occurrence = 0): number | undefined {
    return this.map.get(name)?.[occurrence];
  }

  cell(row: ExcelJS.Row, name: string, occurrence = 0): unknown {
    const idx = this.col(name, occurrence);
    return idx === undefined ? null : row.getCell(idx).value;
  }
}

// ── Row -> record mapping ───────────────────────────────────────────────────

interface ParsedRow {
  data: Record<string, unknown>;
  kodeGardu: string | null;
  hasTanggal: boolean;
}

/** INSCAN/OOP proxy from STATUS GARDU SESUDAH; other values are not a SCADA connectivity state. */
function deriveStatusScada(statusSesudah: string | null): string | null {
  if (!statusSesudah) return null;
  const s = statusSesudah.toUpperCase();
  return s === 'INSCAN' || s === 'OOP' ? s : null;
}

function mapRow(row: ExcelJS.Row, H: HeaderIndex, sumberFile: 'GARDU_MP' | 'GARDU_HUBUNG'): ParsedRow {
  const kodeGarduCol = sumberFile === 'GARDU_MP' ? 'GARDU' : 'GARDU HUBUNG';
  const kodeGardu = cleanStr(H.cell(row, kodeGarduCol));
  const penyulang =
    sumberFile === 'GARDU_MP' ? cleanStr(H.cell(row, 'PENYULANG')) : cleanStr(H.cell(row, 'NAMA PENYULANG', 0));

  const tanggalPekerjaan = parseDateLoose(H.cell(row, 'TANGGAL PEKERJAAN'));
  const statusGarduSesudah = cleanStr(H.cell(row, 'STATUS GARDU SESUDAH'));

  // Clean verdicts live in KONDISI <X> (see file-header comment). Baterai: GH
  // keeps its verdict in KETERANGAN BATTERY; MP has none.
  const kondisiRectifier = cleanStr(H.cell(row, 'KONDISI RECTIFIER'));
  const kondisiRtu = cleanStr(H.cell(row, 'KONDISI RTU'));
  const kondisiMedia = cleanStr(H.cell(row, 'KONDISI MEDIA'));
  const kesimpulanBaterai =
    sumberFile === 'GARDU_HUBUNG' ? cleanStr(H.cell(row, 'KETERANGAN BATTERY')) : null;

  const data: Record<string, unknown> = {
    sumberFile,
    tanggalPekerjaan,
    userEmail: cleanStr(H.cell(row, 'USER')),
    jenisPekerjaan: cleanStr(H.cell(row, 'JENIS PEKERJAAN')),
    up3: cleanStr(H.cell(row, 'UP3')),
    kodeGardu,
    penyulang,
    sumberListrik220: cleanStr(H.cell(row, 'SUMBER 220V')),
    supplyTr: cleanStr(H.cell(row, 'SUPPLY TR')),

    // Rectifier
    mcbSumberRectifier: cleanStr(H.cell(row, 'MCB SUMBER RECTIFIER')),
    merkRectifier: cleanStr(H.cell(row, 'MERK RECTIFIER')),
    typeRectifier: cleanStr(H.cell(row, 'TYPE RECTIFIER')),
    serialRectifier: cleanStr(H.cell(row, 'SERIAL NUMBER RECTIFIER')),
    kondisiRectifier,
    hasilUkurMcb220: cleanFloat(H.cell(row, 'HASIL UKUR MCB 220  RECTIFIER')),
    hasilUkurMcbBat48: cleanFloat(H.cell(row, 'HASIL UKUR MCB BATERAI 48 VDC  RECTIFIER')),
    hasilUkurMcbLoad48: cleanFloat(H.cell(row, 'HASIL UKUR MCB LOAD 48 VDC  RECTIFIER')),
    keteranganRectifier: cleanStr(H.cell(row, 'KESIMPULAN KODISI RECTIFIER')),
    kesimpulanRectifier: kondisiRectifier,
    kategoriRectifier: cleanStr(H.cell(row, 'KATEGORI RECTIFIER')),

    // Baterai
    jenisBaterai: cleanStr(H.cell(row, 'JENIS BATERAI')),
    merkBaterai: cleanStr(H.cell(row, 'MERK BATTERY')),
    typeBaterai: cleanStr(H.cell(row, 'TYPE BATTERY')),
    jumlahCell: cleanInt(H.cell(row, 'JUMLAH BATTERY  (Cell)')),
    levelAirBaterai: cleanStr(H.cell(row, 'LEVEL AIR BATTERY')),
    backupBaterai: cleanStr(H.cell(row, 'Saat MCB sumber utama 220 di turunkan apakah battery bisa backup?')),
    keteranganBaterai: cleanStr(H.cell(row, 'KESIMPULAN KODISI BATTERY')),
    kesimpulanBaterai,
    kategoriBaterai: cleanStr(H.cell(row, 'KATEGORI BATERAI')),

    // RTU
    merkRtu: cleanStr(H.cell(row, 'MERK RTU')),
    typeRtu: cleanStr(H.cell(row, 'TYPE RTU')),
    serialRtu: cleanStr(H.cell(row, 'SERIAL NUMBER RTU')),
    kondisiRtu,
    kondisiDisplayRtu: cleanStr(H.cell(row, 'KONDISI DISPLAY RTU')),
    keteranganRtu: cleanStr(H.cell(row, 'KESIMPULAN KODISI RTU')),
    kesimpulanRtu: kondisiRtu,
    kategoriRtu: cleanStr(H.cell(row, 'KATEGORI RTU')),

    // Media (primary block only — MEDIA -2 block not imported)
    merkMedia: cleanStr(H.cell(row, 'MERK MEDIA')),
    typeMedia: cleanStr(H.cell(row, 'TYPE MEDIA')),
    serialMedia: cleanStr(H.cell(row, 'SERIAL NUMBER MEDIA')),
    kondisiMedia,
    kondisiAntena: cleanStr(H.cell(row, 'KONDISI ANTENA')),
    keteranganMedia: cleanStr(H.cell(row, 'KESIMPULAN KODISI MEDIA')),
    kesimpulanMedia: kondisiMedia,
    kategoriMedia: cleanStr(H.cell(row, 'KATEGORI MEDIA')),

    // HAR-specific: analisa & status pekerjaan
    penyebabGangguan: cleanStr(H.cell(row, 'PENYEBAB GANGGUAN')),
    analisaGangguan: cleanStr(H.cell(row, 'ANALISA GANGGUAN')),
    langkahPekerjaan: cleanStr(H.cell(row, 'LANGKAH PEKERJAAN')),
    statusGarduSebelum: cleanStr(H.cell(row, 'STATUS GARDU SEBELUM')),
    statusGarduSesudah,
    statusPekerjaan: cleanStr(H.cell(row, 'STATUS PEKERJAAN')),

    // Status SCADA (derived) & kubikel (first cubicle/feeder-direction block only)
    statusScada: deriveStatusScada(statusGarduSesudah),
    statusRc: cleanStr(H.cell(row, 'STATUS RC', 0)),
    keteranganKubikel: cleanStr(H.cell(row, 'CATATAN CUBICLE', 0)),

    // ACO
    adaAco: cleanStr(H.cell(row, 'ADA ACO')),
    jumlahAco: cleanInt(H.cell(row, 'JUMLAH ACO')),
    jumlahAcoIntegrasi: cleanInt(H.cell(row, 'JUMLAH ACO SUDAH INTEGRASI SCADA')),
    jumlahAcoTidak: cleanInt(H.cell(row, 'JUMLAH ACO TIDAK INTEGRASI SCADA')),
    catatanAcoTidak: cleanStr(H.cell(row, 'CATATAN ACO TIDAK INTEGRASI SCADA')),

    // Umum
    catatan: cleanStr(H.cell(row, 'CATATAN')),
    pelaksana: cleanStr(H.cell(row, 'PELAKSANA')),
    tanggalUpdate: parseDateLoose(H.cell(row, 'TANGGAL UPDATE (JANGAN EDIT)')),
  };

  return { data, kodeGardu, hasTanggal: tanggalPekerjaan !== null };
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface FileSummary {
  sumberFile: string;
  parsed: number;
  valid: number;
  skippedNoGardu: number;
  noTanggal: number;
  matchedLocation: number;
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  console.log(`Starting HAR Gardu import... [Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}]`);

  const locations = await prisma.location.findMany({ select: { id: true, code: true } });
  const locByCode = new Map(locations.map((l) => [l.code.trim().toUpperCase(), l.id]));

  const summaries: FileSummary[] = [];

  for (const file of FILES) {
    console.log(`\n=== ${file.sumberFile}: ${file.path} ===`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file.path);
    const ws = wb.worksheets[0];
    const H = new HeaderIndex(ws.getRow(1));
    console.log(`Sheet "${ws.name}", ${ws.rowCount - 1} data row(s)`);

    const rows: Record<string, unknown>[] = [];
    let parsed = 0;
    let skippedNoGardu = 0;
    let noTanggal = 0;
    let matchedLocation = 0;

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (row.cellCount === 0) continue;
      parsed++;
      const { data, kodeGardu, hasTanggal } = mapRow(row, H, file.sumberFile);

      // Baris tanpa kode gardu tidak bisa diatribusikan ke gardu manapun ->
      // skip (sama dengan importer inspeksi). Tanggal kosong TIDAK menggugurkan
      // baris — tanggalPekerjaan nullable, konsumen (dashboard/AI) toleran null.
      if (!kodeGardu) {
        skippedNoGardu++;
        continue;
      }
      if (!hasTanggal) noTanggal++;

      const locationId = locByCode.get(kodeGardu.toUpperCase()) ?? null;
      if (locationId) matchedLocation++;
      rows.push({ ...data, locationId });
    }

    console.log(`Parsed: ${parsed}, valid: ${rows.length}, skipped (no kode gardu): ${skippedNoGardu}, tanpa tanggal (tetap diimpor): ${noTanggal}`);
    console.log(`Matched to an existing Location: ${matchedLocation} / ${rows.length}`);

    const kesimpulanCounts: Record<string, number> = {};
    for (const r of rows) {
      for (const field of ['kesimpulanRectifier', 'kesimpulanBaterai', 'kesimpulanRtu', 'kesimpulanMedia']) {
        const v = (r[field] as string | null) ?? '(null)';
        const key = `${field}=${v}`;
        kesimpulanCounts[key] = (kesimpulanCounts[key] ?? 0) + 1;
      }
    }
    console.log('Kesimpulan breakdown:', JSON.stringify(kesimpulanCounts, null, 2));

    if (isApply) {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await prisma.harGarduRecord.createMany({ data: batch as any });
      }
      console.log(`Inserted ${rows.length} row(s) into har_gardu_records.`);
    } else {
      console.log(`[DRY-RUN] Would insert ${rows.length} row(s). Run with --apply to write.`);
    }

    summaries.push({
      sumberFile: file.sumberFile,
      parsed,
      valid: rows.length,
      skippedNoGardu,
      noTanggal,
      matchedLocation,
    });
  }

  const totalValid = summaries.reduce((a, s) => a + s.valid, 0);
  const totalMatched = summaries.reduce((a, s) => a + s.matchedLocation, 0);

  console.log(`\n=== ${isApply ? 'SUMMARY' : 'DRY RUN SUMMARY'} ===`);
  for (const s of summaries) {
    console.log(
      `${s.sumberFile.padEnd(12)}: ${s.parsed} rows parsed, ${s.valid} valid, ` +
        `${s.skippedNoGardu} skipped (no kode gardu), ${s.noTanggal} tanpa tanggal`,
    );
  }
  console.log(`locationId matched: ${totalMatched} / ${totalValid} rows`);
  console.log(`Total ${isApply ? 'imported' : 'to import'}: ${totalValid}`);
}

main()
  .catch((e) => {
    console.error('Import script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
