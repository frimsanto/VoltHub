/**
 * Load PENYULANG (feeders) from "DAFTAR ISI GH_PENYULANG UID JAYA.xlsx" → `feeders`.
 *
 * Source: sheet "GH" — one row per (GH, penyulang). Columns are resolved by
 * header label (robust to column shifts): GH, GARDU INDUK, PENYULANG.
 *
 * Mapping: each distinct (GH, penyulang) becomes a Feeder under the Gardu Hubung
 * location (matched by `locations.code`, e.g. GH0002 — an exact match, unlike
 * fuzzy GI names). `feederCode` = `feederName` = penyulang name. The Gardu Induk
 * is kept in the unused-for-now note via feederName only; the FK is the GH.
 *
 * SAFE & idempotent: createMany skipDuplicates on the unique (locationId,
 * feederCode). Re-running adds only new penyulang. Rows whose GH is not a known
 * location are skipped and counted.
 *
 * Run:  npm run seed:penyulang
 */
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FILE = path.resolve(__dirname, '../../dataset_scada/DAFTAR ISI GH_PENYULANG UID JAYA.xlsx');
const SHEET = 'GH';

const norm = (v: unknown) => (v == null ? '' : String(v).trim());
const upper = (s: string) => s.trim().toUpperCase();

/** Map normalized header label → 1-based column index (exact match wins). */
function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const m = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => {
    const h = norm(c.text).toLowerCase();
    if (h && !m.has(h)) m.set(h, col);
  });
  return m;
}

async function main() {
  // Location lookup: code → id (GH codes are exact), plus name → id as fallback.
  const locs = await prisma.location.findMany({ select: { id: true, code: true, name: true } });
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const l of locs) {
    if (l.code) byCode.set(upper(l.code), l.id);
    byName.set(upper(l.name), l.id);
  }
  console.log(`📍 ${locs.length} lokasi di lookup`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Sheet "${SHEET}" tidak ditemukan`);

  const H = headerIndex(ws);
  const cGh = H.get('gh');
  const cPyl = H.get('penyulang');
  const cGi = H.get('gardu induk');
  if (!cGh || !cPyl) throw new Error(`Kolom GH/PENYULANG tidak ditemukan (gh=${cGh}, penyulang=${cPyl})`);

  // Deduplicate (locationId, feederCode) in memory; collect rows to insert.
  const seen = new Set<string>();
  const rows: { locationId: string; feederCode: string; feederName: string }[] = [];
  let skippedNoGh = 0;
  let skippedNoPyl = 0;
  let parsed = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const gh = norm(row.getCell(cGh).text);
    const pyl = norm(row.getCell(cPyl).text);
    const gi = cGi ? norm(row.getCell(cGi).text) : '';
    if (!pyl) { skippedNoPyl++; continue; }
    parsed++;

    const locId = byCode.get(upper(gh)) ?? byName.get(upper(gh));
    if (!locId) { skippedNoGh++; continue; }

    const feederCode = pyl.slice(0, 50);
    const key = `${locId}::${upper(feederCode)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      locationId: locId,
      feederCode,
      feederName: gi ? `${pyl} (${gi})`.slice(0, 255) : pyl.slice(0, 255),
    });
  }

  console.log(`🧮 ${parsed} baris penyulang, ${skippedNoPyl} tanpa nama, ${skippedNoGh} GH tak cocok, ${rows.length} unik`);

  // Skip codes already present for the same location (idempotent re-run).
  const existing = await prisma.feeder.findMany({ select: { locationId: true, feederCode: true } });
  const existKey = new Set(existing.map((f) => `${f.locationId}::${upper(f.feederCode)}`));
  const toInsert = rows.filter((r) => !existKey.has(`${r.locationId}::${upper(r.feederCode)}`));

  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const res = await prisma.feeder.createMany({
      data: toInsert.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    inserted += res.count;
    console.log(`   …${Math.min(i + CHUNK, toInsert.length)}/${toInsert.length}`);
  }

  const total = await prisma.feeder.count();
  console.log(`\n✅ Selesai. ${inserted} penyulang baru ditambahkan. Total feeder sekarang: ${total}`);
}

main()
  .catch((e) => {
    console.error('❌ seed-penyulang gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
