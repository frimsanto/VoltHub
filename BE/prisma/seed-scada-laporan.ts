/**
 * Import the SCADA daily-availability reports into `scada_gardu` — the source of
 * truth for the real-time INS/OOP dashboard (Dashboard Inscan/OOP).
 *
 * Sources (dataset_scada/):
 *   • Laporan Gardu RC Aktif.xlsx → garduType RC  (drives the realtime dashboard)
 *   • Laporan GH Aktif.xlsx       → garduType GH
 *   • Laporan GI Aktif.xlsx       → garduType GI
 *   (GFD reserved — drop its file in and add an entry to FILES.)
 *
 * Layout (all three): row 1 = month names per daily column, row 2 = the day
 * (a real Date for RC/GH, a day-of-month number for GI), data rows below. Meta
 * columns (Gardu / UP3 / RTUPP / WILAYAH / %AVA YTD) sit before the first daily
 * column. We detect them by header text so a shifted layout still parses.
 *
 * Per gardu we store:
 *   • daily         — { "YYYY-MM-DD": value } for every non-null day (trend)
 *   • currentValue  — value at the latest dated day that has data ("realtime")
 *   • currentStatus — IN_SCAN when currentValue > 0, else OOP
 *   • avaYtd        — the report's %AVA YTD column, or the mean of daily values
 *
 * SAFETY: additive & idempotent. Upserts keyed on (garduType, code); re-running
 * refreshes figures and never touches any other table.
 *
 * Run:  npm run seed:scada:laporan
 */
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient, ScadaGarduType, ScadaStatus } from '@prisma/client';

const prisma = new PrismaClient();

const DIR = path.resolve(__dirname, '../../dataset_scada');
const FILES: { file: string; type: ScadaGarduType }[] = [
  { file: 'Laporan Gardu RC Aktif.xlsx', type: ScadaGarduType.RC },
  { file: 'Laporan GH Aktif.xlsx', type: ScadaGarduType.GH },
  { file: 'Laporan GI Aktif.xlsx', type: ScadaGarduType.GI },
  // { file: 'Laporan GFD Aktif.xlsx', type: ScadaGarduType.GFD }, // ← drop-in when ready
];

const MONTHS: Record<string, number> = {
  JANUARI: 0, FEBRUARI: 1, MARET: 2, APRIL: 3, MEI: 4, JUNI: 5,
  JULI: 6, AGUSTUS: 7, SEPTEMBER: 8, OKTOBER: 9, NOVEMBER: 10, DESEMBER: 11,
};

const norm = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Unwrap an exceljs cell value (handles {formula,result} and {result}). */
function cellVal(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
    return (v as { result: unknown }).result;
  }
  if (v && typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
    return (v as { text: unknown }).text; // rich text
  }
  return v;
}

/** Coerce a daily cell to a 0..1 number, or null when blank/non-numeric. */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

interface Parsed {
  code: string;
  up3: string | null;
  rtupp: string | null;
  wilayah: string | null;
  avaYtd: number | null;
  daily: Record<string, number>;
  currentValue: number | null;
  asOfDate: Date | null;
}

async function parseFile(file: string): Promise<Parsed[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DIR, file));
  const ws = wb.worksheets[0];

  const r1 = ws.getRow(1);
  const r2 = ws.getRow(2);

  // ── Locate columns by header text (row 1 / row 2) ──
  let colGardu = 0, colUp3 = 0, colRtupp = 0, colWilayah = 0, colAva = 0, firstDaily = 0;
  for (let c = 1; c <= ws.columnCount; c++) {
    const h = norm(cellVal(r1.getCell(c))).toUpperCase();
    const h2 = norm(cellVal(r2.getCell(c))).toUpperCase();
    if (!colGardu && (h === 'GARDU' || h2 === 'GARDU')) colGardu = c;
    else if (!colUp3 && (h === 'UP3' || h2 === 'UP3')) colUp3 = c;
    else if (!colRtupp && (h === 'RTUPP' || h2 === 'RTUPP')) colRtupp = c;
    else if (!colWilayah && (h === 'WILAYAH' || h2 === 'WILAYAH')) colWilayah = c;
    else if (!colAva && (h.includes('AVA') || h2.includes('AVA'))) colAva = c;
    if (!firstDaily && h in MONTHS) firstDaily = c; // first month-named column
  }
  if (!colGardu || !firstDaily) {
    throw new Error(`${file}: could not locate Gardu/daily columns (gardu=${colGardu}, firstDaily=${firstDaily})`);
  }

  // ── Map each daily column → its date ──
  // RC/GH: row 2 holds a real Date. GI: row 2 holds a day number; the month comes
  // from row 1 (which repeats the month name across that month's columns).
  const colDate: Record<number, Date> = {};
  let curMonth = -1;
  for (let c = firstDaily; c <= ws.columnCount; c++) {
    const h1 = norm(cellVal(r1.getCell(c))).toUpperCase();
    if (h1 in MONTHS) curMonth = MONTHS[h1];
    const raw = cellVal(r2.getCell(c));
    if (raw instanceof Date) {
      // Normalise to the calendar date in UTC (exceljs gives midnight UTC).
      colDate[c] = new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
    } else {
      const day = toNum(raw);
      if (day != null && day >= 1 && day <= 31 && curMonth >= 0) {
        colDate[c] = new Date(Date.UTC(2026, curMonth, day));
      }
    }
  }

  const out: Parsed[] = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = norm(cellVal(row.getCell(colGardu)));
    if (!code) continue;

    const daily: Record<string, number> = {};
    let currentValue: number | null = null;
    let asOfDate: Date | null = null;
    let sum = 0, count = 0;
    for (let c = firstDaily; c <= ws.columnCount; c++) {
      const d = colDate[c];
      if (!d) continue;
      const v = toNum(cellVal(row.getCell(c)));
      if (v == null) continue;
      const iso = d.toISOString().slice(0, 10);
      daily[iso] = v;
      sum += v; count += 1;
      // Latest dated day with data = "current".
      if (!asOfDate || d > asOfDate) { asOfDate = d; currentValue = v; }
    }

    const avaCell = colAva ? toNum(cellVal(row.getCell(colAva))) : null;
    out.push({
      code,
      up3: colUp3 ? norm(cellVal(row.getCell(colUp3))) || null : null,
      rtupp: colRtupp ? norm(cellVal(row.getCell(colRtupp))) || null : null,
      wilayah: colWilayah ? norm(cellVal(row.getCell(colWilayah))) || null : null,
      avaYtd: avaCell ?? (count > 0 ? sum / count : null),
      daily,
      currentValue,
      asOfDate,
    });
  }
  return out;
}

async function main() {
  for (const { file, type } of FILES) {
    process.stdout.write(`📖 ${file} (${type}) … `);
    let rows: Parsed[];
    try {
      rows = await parseFile(file);
    } catch (e) {
      console.log(`SKIP (${(e as Error).message})`);
      continue;
    }

    let ins = 0, oop = 0;
    for (const p of rows) {
      const status: ScadaStatus | null =
        p.currentValue == null ? null : p.currentValue > 0 ? ScadaStatus.IN_SCAN : ScadaStatus.OOP;
      if (status === ScadaStatus.IN_SCAN) ins++;
      else if (status === ScadaStatus.OOP) oop++;

      await prisma.scadaGardu.upsert({
        where: { garduType_code: { garduType: type, code: p.code } },
        create: {
          garduType: type,
          code: p.code,
          up3: p.up3,
          rtupp: p.rtupp,
          wilayah: p.wilayah,
          avaYtd: p.avaYtd,
          currentValue: p.currentValue,
          currentStatus: status,
          asOfDate: p.asOfDate,
          daily: p.daily,
          sourceFile: file,
        },
        update: {
          up3: p.up3,
          rtupp: p.rtupp,
          wilayah: p.wilayah,
          avaYtd: p.avaYtd,
          currentValue: p.currentValue,
          currentStatus: status,
          asOfDate: p.asOfDate,
          daily: p.daily,
          sourceFile: file,
          importedAt: new Date(),
        },
      });
    }
    console.log(`${rows.length} gardu (IN_SCAN ${ins} / OOP ${oop})`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
