/**
 * Seed: Pekerjaan HAR & Pekerjaan Inspeksi
 * -----------------------------------------
 * Loads the field-work history workbooks under ../dataset_scada into the
 * normalised V2 tables:
 *   - PEKERJAAN HAR.xlsx        → har_reports + har_details
 *   - PEKERJAAN INSPEKSI.xlsx   → inspections + inspection_findings
 *
 * The source sheets are flat, one row per visit, referencing a gardu by code
 * (MP/GH) or gardu-induk name (GI). Each row is resolved to an existing
 * `locations` row; the report/inspection detail is attached to that location's
 * primary RTU asset (the de-facto device for the visit). Rows whose gardu does
 * not resolve, or whose location has no RTU asset, are skipped and counted.
 *
 * All inserted rows are tagged `createdBy = <system import user>` so a re-run
 * (or rollback) can purge exactly what this script created. Safe to re-run:
 * it deletes its own prior output first.
 *
 *   tsx prisma/seed-har-inspeksi.ts
 */
import { randomUUID } from 'crypto';
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient, HarStatus, InspectionStatus } from '@prisma/client';

const prisma = new PrismaClient();
const DATA_DIR = path.resolve(__dirname, '../../dataset_scada');
const IMPORT_USER_EMAIL = 'import-bot@voltreport.local';

// Google-Sheets exported cells arrive as { formula, result } or rich-text
// { text } objects; unwrap to the plain computed value.
const cv = (v: any): any =>
  v && typeof v === 'object'
    ? 'result' in v
      ? v.result
      : 'text' in v
        ? v.text
        : v.richText
          ? v.richText.map((r: any) => r.text).join('')
          : null
    : v;

const str = (v: any): string => {
  const x = cv(v);
  return x === null || x === undefined ? '' : String(x).trim();
};

const toDate = (v: any): Date | null => {
  const x = cv(v);
  if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
  if (typeof x === 'number') {
    // Excel serial date
    const d = new Date(Math.round((x - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof x === 'string' && x.trim()) {
    const d = new Date(x);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim();

/** Map header row (row 1) → { canonicalUpper: columnIndex }. */
function headerIndex(ws: ExcelJS.Worksheet): Record<string, number> {
  const idx: Record<string, number> = {};
  const row = ws.getRow(1);
  row.eachCell((cell, col) => {
    const key = norm(str(cell.value));
    if (key && !(key in idx)) idx[key] = col;
  });
  return idx;
}

interface LocInfo {
  id: string;
  type: string;
  rtuAssetId: string | null;
}

async function buildLocationMaps() {
  const locs = await prisma.location.findMany({
    select: { id: true, code: true, name: true, locationType: true },
  });
  const rtus = await prisma.asset.findMany({
    where: { assetType: 'RTU' },
    select: { id: true, locationId: true },
  });
  const rtuByLoc = new Map<string, string>();
  for (const a of rtus) if (!rtuByLoc.has(a.locationId)) rtuByLoc.set(a.locationId, a.id);

  const byCode = new Map<string, LocInfo>();
  const byName = new Map<string, LocInfo>();
  for (const l of locs) {
    const info: LocInfo = {
      id: l.id,
      type: l.locationType,
      rtuAssetId: rtuByLoc.get(l.id) ?? null,
    };
    if (l.code) byCode.set(norm(l.code), info);
    if (l.name) byName.set(norm(l.name), info);
  }
  return { byCode, byName };
}

type Maps = Awaited<ReturnType<typeof buildLocationMaps>>;

function resolveLocation(maps: Maps, gardu: string, isGI: boolean): LocInfo | null {
  const key = norm(gardu);
  if (!key) return null;
  let hit = maps.byCode.get(key) || maps.byName.get(key);
  if (!hit && isGI) {
    // GI sheets reference the gardu-induk by bare name ("MAMPANG BARU");
    // locations store it as "GI MAMPANG BARU" / code "GI-MAMPANG-BARU".
    hit =
      maps.byName.get(norm('GI ' + key)) ||
      maps.byCode.get(norm('GI-' + key.replace(/\s+/g, '-')));
  }
  return hit ?? null;
}

// ---- HAR status mapping ------------------------------------------------
function harStatus(statusPekerjaan: string, statusSesudah: string): HarStatus {
  const s = norm(statusPekerjaan);
  const after = norm(statusSesudah);
  if (after === 'OOP') return HarStatus.OFFLINE;
  if (s.includes('SELESAI')) return HarStatus.NORMAL;
  if (s.includes('GAGAL')) return HarStatus.CRITICAL;
  if (s) return HarStatus.WARNING;
  return HarStatus.NORMAL;
}

// ---- Inspection status mapping ----------------------------------------
function inspectionStatus(kesimpulan: string[]): InspectionStatus {
  const joined = norm(kesimpulan.join(' | '));
  if (
    joined.includes('PERLU PENGECEKAN') ||
    joined.includes('PROBLEM') ||
    joined.includes('RUSAK') ||
    joined.includes('GANTI')
  )
    return InspectionStatus.CRITICAL;
  if (joined.includes('SEDANG') || joined.includes('WARNING') || joined.includes('PERHATIAN'))
    return InspectionStatus.WARNING;
  return InspectionStatus.NORMAL;
}

const compose = (pairs: [string, string][]) =>
  pairs
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
    .slice(0, 60000) || null;

interface Stats {
  rows: number;
  noGardu: number;
  noLocation: number;
  noRtu: number;
  reports: number;
  details: number;
}
const newStats = (): Stats => ({ rows: 0, noGardu: 0, noLocation: 0, noRtu: 0, reports: 0, details: 0 });

async function chunkedCreateMany(model: any, data: any[], label: string) {
  const SIZE = 1000;
  for (let i = 0; i < data.length; i += SIZE) {
    await model.createMany({ data: data.slice(i, i + SIZE), skipDuplicates: true });
    process.stdout.write(`\r  ${label}: ${Math.min(i + SIZE, data.length)}/${data.length}   `);
  }
  if (data.length) process.stdout.write('\n');
}

async function seedHar(maps: Maps, systemUserId: string) {
  const file = path.join(DATA_DIR, 'PEKERJAAN HAR.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  // sheet → gardu-column header (varies between MP/GH/GI)
  const sheets: { name: string; garduHeader: string; isGI: boolean }[] = [
    { name: 'HAR MP', garduHeader: 'GARDU', isGI: false },
    { name: 'HAR GH', garduHeader: 'GARDU', isGI: false },
    { name: 'HAR GI', garduHeader: 'GARDU INDUK', isGI: true },
  ];

  const reports: any[] = [];
  const details: any[] = [];
  const stats = newStats();

  for (const cfg of sheets) {
    const ws = wb.getWorksheet(cfg.name);
    if (!ws) continue;
    const H = headerIndex(ws);
    const get = (row: ExcelJS.Row, header: string) => {
      const c = H[norm(header)];
      return c ? str(row.getCell(c).value) : '';
    };
    const getRaw = (row: ExcelJS.Row, header: string) => {
      const c = H[norm(header)];
      return c ? row.getCell(c).value : null;
    };

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const gardu = get(row, cfg.garduHeader);
      if (!gardu) continue;
      stats.rows++;

      const loc = resolveLocation(maps, gardu, cfg.isGI);
      if (!loc) {
        stats.noLocation++;
        continue;
      }
      const reportDate = toDate(getRaw(row, 'TGL. PEKERJAAN')) ?? new Date();
      const reportId = randomUUID();
      reports.push({
        id: reportId,
        locationId: loc.id,
        reportDate,
        createdBy: systemUserId,
      });
      stats.reports++;

      if (!loc.rtuAssetId) {
        stats.noRtu++;
        continue;
      }
      const notes = compose([
        ['KET. KUNJUNGAN', get(row, 'KET. KUNJUNGAN')],
        ['PENYEBAB GANGGUAN', get(row, 'PENYEBAB GANGGUAN')],
        ['LANGKAH PEKERJAAN', get(row, 'LANGKAH PEKERJAAN')],
        ['HASIL PEKERJAAN', get(row, 'HASIL PEKERJAAN')],
        ['STATUS PEKERJAAN', get(row, 'STATUS PEKERJAAN')],
        ['PELAKSANA', get(row, 'PELAKSANA')],
        ['PENGAWAS', get(row, 'PENGAWAS')],
        ['USER', get(row, 'USER')],
      ]);
      details.push({
        id: randomUUID(),
        harReportId: reportId,
        assetId: loc.rtuAssetId,
        status: harStatus(get(row, 'STATUS PEKERJAAN'), get(row, 'STATUS GARDU SESUDAH')),
        analysis: get(row, 'ANALISA PENYEBAB') || null,
        notes,
        createdBy: systemUserId,
      });
      stats.details++;
    }
  }

  console.log(`\n[HAR] inserting ${reports.length} reports, ${details.length} details ...`);
  await chunkedCreateMany(prisma.harReport, reports, 'har_reports');
  await chunkedCreateMany(prisma.harDetail, details, 'har_details');
  return stats;
}

async function seedInspeksi(maps: Maps, systemUserId: string) {
  const file = path.join(DATA_DIR, 'PEKERJAAN INSPEKSI.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const sheets: { name: string; garduHeader: string; isGI: boolean }[] = [
    { name: 'LAPORAN INSPEKSI MP', garduHeader: 'GARDU', isGI: false },
    { name: 'LAPORAN INSPEKSI GH', garduHeader: 'GARDU', isGI: false },
    { name: 'LAPORAN INSPEKSI GI', garduHeader: 'GARDU', isGI: true },
  ];

  const inspections: any[] = [];
  const findings: any[] = [];
  const stats = newStats();

  for (const cfg of sheets) {
    const ws = wb.getWorksheet(cfg.name);
    if (!ws) continue;
    const H = headerIndex(ws);
    // collect every column whose header starts with "KESIMPULAN" for status
    const kesimpulanCols = Object.entries(H)
      .filter(([k]) => k.startsWith('KESIMPULAN'))
      .map(([, c]) => c);
    const get = (row: ExcelJS.Row, header: string) => {
      const c = H[norm(header)];
      return c ? str(row.getCell(c).value) : '';
    };
    const getRaw = (row: ExcelJS.Row, header: string) => {
      const c = H[norm(header)];
      return c ? row.getCell(c).value : null;
    };

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const gardu = get(row, cfg.garduHeader);
      if (!gardu) continue;
      stats.rows++;

      const loc = resolveLocation(maps, gardu, cfg.isGI);
      if (!loc) {
        stats.noLocation++;
        continue;
      }
      if (!loc.rtuAssetId) {
        // Inspection findings require an asset FK; without an RTU asset we have
        // nothing to attach the finding to, so skip the whole inspection.
        stats.noRtu++;
        continue;
      }
      const inspectionDate = toDate(getRaw(row, 'TANGGAL PEKERJAAN')) ?? new Date();
      const inspectionId = randomUUID();
      const notes = compose([
        ['CATATAN', get(row, 'CATATAN')],
        ['SUPPLY TR', get(row, 'SUPPLY TR')],
        ['PELAKSANA', get(row, 'PELAKSANA')],
        ['USER', get(row, 'USER')],
      ]);
      inspections.push({
        id: inspectionId,
        locationId: loc.id,
        inspectionDate,
        inspectorId: systemUserId,
        notes,
        createdBy: systemUserId,
      });
      stats.reports++;

      const kesimpulan = kesimpulanCols.map((c) => str(row.getCell(c).value)).filter(Boolean);
      findings.push({
        id: randomUUID(),
        inspectionId,
        assetId: loc.rtuAssetId,
        status: inspectionStatus(kesimpulan),
        finding: compose([
          ['KONDISI RTU', get(row, 'KONDISI RTU')],
          ['KONDISI RECTIFIER', get(row, 'KONDISI RECTIFIER')],
          ['KONDISI MEDIA', get(row, 'KONDISI MEDIA')],
          ['KESIMPULAN', kesimpulan.join(' | ')],
        ]),
        recommendation: get(row, 'CATATAN') || null,
        createdBy: systemUserId,
      });
      stats.details++;
    }
  }

  console.log(`\n[INSPEKSI] inserting ${inspections.length} inspections, ${findings.length} findings ...`);
  await chunkedCreateMany(prisma.inspection, inspections, 'inspections');
  await chunkedCreateMany(prisma.inspectionFinding, findings, 'inspection_findings');
  return stats;
}

async function main() {
  console.log('== Seed Pekerjaan HAR & Inspeksi ==');

  // System import user (find-or-create); inspector/createdBy for all rows.
  let user = await prisma.user.findUnique({ where: { email: IMPORT_USER_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: IMPORT_USER_EMAIL,
        name: 'Data Import (SCADA)',
        password: '!imported-no-login',
        role: 'PETUGAS',
        isActive: false,
      },
    });
    console.log('Created system import user', user.id);
  }

  // Make the script re-runnable: purge any rows from a previous run of THIS seed.
  console.log('Clearing previous import output (createdBy = system user) ...');
  await prisma.harDetail.deleteMany({ where: { createdBy: user.id } });
  await prisma.harReport.deleteMany({ where: { createdBy: user.id } });
  await prisma.inspectionFinding.deleteMany({ where: { createdBy: user.id } });
  await prisma.inspection.deleteMany({ where: { createdBy: user.id } });

  console.log('Building location/asset maps ...');
  const maps = await buildLocationMaps();

  const har = await seedHar(maps, user.id);
  const insp = await seedInspeksi(maps, user.id);

  console.log('\n================ SUMMARY ================');
  console.table({
    HAR: { ...har },
    INSPEKSI: { ...insp },
  });
  const totalHar = await prisma.harReport.count();
  const totalDet = await prisma.harDetail.count();
  const totalInsp = await prisma.inspection.count();
  const totalFind = await prisma.inspectionFinding.count();
  console.log(`DB now: har_reports=${totalHar}, har_details=${totalDet}, inspections=${totalInsp}, inspection_findings=${totalFind}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
