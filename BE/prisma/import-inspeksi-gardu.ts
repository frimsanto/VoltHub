/**
 * Bulk-import historical equipment-condition inspection data from the field
 * team's external Google-Sheets-based inspection logs into `InspeksiGarduRecord`
 * (additive analytics table — see schema.prisma comment on the model).
 *
 * Sources (142-154 columns each, header row 1 = a Google Sheets IMPORTRANGE
 * export, so header cells carry a cached formula `.result` rather than a plain
 * string — data rows are plain values):
 *   - "Laporan Inspeksi Gardu NEW 1.xlsx"         -> sumberFile GARDU_MP
 *   - "Laporan Inspeksi Gardu Hubung NEW 1.xlsx"   -> sumberFile GARDU_HUBUNG
 *
 * Column-name quirks handled here (found by inspecting the actual files, not
 * assumed from the column list alone):
 *   - The kode-gardu column is named "GARDU" in the MP file but
 *     "GARDU HUBUNG" in the GH file.
 *   - The upstream feeder is a single top-level "PENYULANG" column in the MP
 *     file; the GH file has no such column — it instead has a per-cubicle
 *     "NAMA PENYULANG" (GH sites have multiple outgoing feeders). The GH sheet
 *     header row repeats an entire cubicle block twice (NAMA PENYULANG /
 *     STATUS SCADA / STATUS RC / CATATAN CUBICLE / ... for a 2nd feeder
 *     direction) — only the FIRST cubicle block is imported; the 2nd is not
 *     captured in this pass.
 *   - "KESIMPULAN KODISI <X>" holds the clean BAIK/RUSAK/PERLU PENGECEKAN
 *     LANJUT verdict; "KATEGORI <X>" holds a separate, more granular
 *     non-normal classification code (e.g. "SUMBER TEGANGAN TIDAK ADA") that
 *     is NOT a superset containing the word "RUSAK" — confirmed empirically,
 *     so "bermasalah" filtering must key off KESIMPULAN, not KATEGORI.
 *
 * Modes (matches prisma/import-gh-feeders.ts convention):
 *   (default)  DRY-RUN — reads + validates + prints a summary, no DB writes.
 *   --apply    Writes to DB via batched createMany.
 */
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';

const prisma = new PrismaClient();

const FILES: Array<{ path: string; sumberFile: 'GARDU_MP' | 'GARDU_HUBUNG' }> = [
  { path: 'D:/VoltReport/Laporan Inspeksi Gardu NEW 1.xlsx', sumberFile: 'GARDU_MP' },
  { path: 'D:/VoltReport/Laporan Inspeksi Gardu Hubung NEW 1.xlsx', sumberFile: 'GARDU_HUBUNG' },
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

/** Maps a header name -> every column index it appears at (GH repeats cubicle headers). */
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
}

function mapRow(row: ExcelJS.Row, H: HeaderIndex, sumberFile: 'GARDU_MP' | 'GARDU_HUBUNG'): ParsedRow {
  const kodeGarduCol = sumberFile === 'GARDU_MP' ? 'GARDU' : 'GARDU HUBUNG';
  const kodeGardu = cleanStr(H.cell(row, kodeGarduCol));
  const penyulang =
    sumberFile === 'GARDU_MP' ? cleanStr(H.cell(row, 'PENYULANG')) : cleanStr(H.cell(row, 'NAMA PENYULANG', 0));

  const data: Record<string, unknown> = {
    sumberFile,
    tanggalPekerjaan: parseDateLoose(H.cell(row, 'TANGGAL PEKERJAAN')),
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
    kondisiRectifier: cleanStr(H.cell(row, 'KONDISI RECTIFIER')),
    hasilUkurMcb220: cleanFloat(H.cell(row, 'HASIL UKUR MCB 220  RECTIFIER')),
    hasilUkurMcbBat48: cleanFloat(H.cell(row, 'HASIL UKUR MCB BATERAI 48 VDC  RECTIFIER')),
    hasilUkurMcbLoad48: cleanFloat(H.cell(row, 'HASIL UKUR MCB LOAD 48 VDC  RECTIFIER')),
    keteranganRectifier: cleanStr(H.cell(row, 'KETERANGAN RECTIFIER')),
    kesimpulanRectifier: cleanStr(H.cell(row, 'KESIMPULAN KODISI RECTIFIER')),
    kategoriRectifier: cleanStr(H.cell(row, 'KATEGORI RECTIFIER')),

    // Baterai
    jenisBaterai: cleanStr(H.cell(row, 'JENIS BATERAI')),
    merkBaterai: cleanStr(H.cell(row, 'MERK BATTERY')),
    typeBaterai: cleanStr(H.cell(row, 'TYPE BATTERY')),
    jumlahCell: cleanInt(H.cell(row, 'JUMLAH BATTERY  (Cell)')),
    levelAirBaterai: cleanStr(H.cell(row, 'LEVEL AIR BATTERY')),
    backupBaterai: cleanStr(H.cell(row, 'Saat MCB sumber utama 220 di turunkan apakah battery bisa backup?')),
    keteranganBaterai: cleanStr(H.cell(row, 'KETERANGAN BATTERY')),
    kesimpulanBaterai: cleanStr(H.cell(row, 'KESIMPULAN KODISI BATTERY')),
    kategoriBaterai: cleanStr(H.cell(row, 'KATEGORI BATERAI')),

    // RTU
    merkRtu: cleanStr(H.cell(row, 'MERK RTU')),
    typeRtu: cleanStr(H.cell(row, 'TYPE RTU')),
    serialRtu: cleanStr(H.cell(row, 'SERIAL NUMBER RTU')),
    kondisiRtu: cleanStr(H.cell(row, 'KONDISI RTU')),
    kondisiDisplayRtu: cleanStr(H.cell(row, 'KONDISI DISPLAY RTU')),
    keteranganRtu: cleanStr(H.cell(row, 'KETERANGAN RTU')),
    kesimpulanRtu: cleanStr(H.cell(row, 'KESIMPULAN KODISI RTU')),
    kategoriRtu: cleanStr(H.cell(row, 'KATEGORI RTU')),

    // Media (modem/router) — primary block only (MEDIA -2 block not imported)
    merkMedia: cleanStr(H.cell(row, 'MERK MEDIA')),
    typeMedia: cleanStr(H.cell(row, 'TYPE MEDIA')),
    serialMedia: cleanStr(H.cell(row, 'SERIAL NUMBER MEDIA')),
    kondisiMedia: cleanStr(H.cell(row, 'KONDISI MEDIA')),
    kondisiAntena: cleanStr(H.cell(row, 'KONDISI ANTENA')),
    keteranganMedia: cleanStr(H.cell(row, 'KETERANGAN MEDIA')),
    kesimpulanMedia: cleanStr(H.cell(row, 'KESIMPULAN KODISI MEDIA')),
    kategoriMedia: cleanStr(H.cell(row, 'KATEGORI MEDIA')),

    // Status SCADA & kubikel (first cubicle/feeder-direction block only)
    statusScada: cleanStr(H.cell(row, 'STATUS SCADA', 0)),
    statusRc: cleanStr(H.cell(row, 'STATUS RC', 0)),
    keteranganKubikel: cleanStr(H.cell(row, 'CATATAN CUBICLE', 0)),

    // Umum
    catatan: cleanStr(H.cell(row, 'CATATAN')),
    pelaksana: cleanStr(H.cell(row, 'PELAKSANA')),
    tanggalUpdate: parseDateLoose(H.cell(row, 'TANGGAL UPDATE (JANGAN EDIT)')),
  };

  return { data, kodeGardu };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');

  console.log(`Starting Inspeksi Gardu import... [Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}]`);

  const locations = await prisma.location.findMany({ select: { id: true, code: true } });
  const locByCode = new Map(locations.map((l) => [l.code.trim().toUpperCase(), l.id]));

  let totalImported = 0;
  let totalSkipped = 0;

  for (const file of FILES) {
    console.log(`\n=== ${file.sumberFile}: ${file.path} ===`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file.path);
    const ws = wb.worksheets[0];
    const H = new HeaderIndex(ws.getRow(1));
    console.log(`Sheet "${ws.name}", ${ws.rowCount - 1} data row(s)`);

    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    let matchedLocation = 0;

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (row.cellCount === 0) continue;
      const { data, kodeGardu } = mapRow(row, H, file.sumberFile);

      if (!kodeGardu) {
        skipped++;
        continue;
      }

      const locationId = locByCode.get(kodeGardu.toUpperCase()) ?? null;
      if (locationId) matchedLocation++;
      rows.push({ ...data, locationId });
    }

    console.log(`Parsed: ${rows.length}, skipped (no kode gardu): ${skipped}`);
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
        await prisma.inspeksiGarduRecord.createMany({ data: batch as any });
      }
      console.log(`Inserted ${rows.length} row(s) into inspeksi_gardu_records.`);
    } else {
      console.log(`[DRY-RUN] Would insert ${rows.length} row(s). Run with --apply to write.`);
    }

    totalImported += rows.length;
    totalSkipped += skipped;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total ${isApply ? 'imported' : 'to import'}: ${totalImported}`);
  console.log(`Total skipped (no kode gardu): ${totalSkipped}`);
}

main()
  .catch((e) => {
    console.error('Import script failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
