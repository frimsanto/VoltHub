/**
 * Load REAL telecom/SCADA assets into `assets`, linked to the gardu loaded by
 * seed-scada.ts.
 * 
 * Sources:
 *   1) Media telekomunikasi — workbook sheets GSM 4G / Radio Data / ICON+ GSM /
 *      ICON+ IPVPN / FO APD (Lokasi = kode gardu).
 *   2) RTU SCADA — csd_IFS-IFS_RTUs (RTU Name = kode gardu).
 *   3) TELKOM GI sheet — from TELEKOMUNIKASI SCADA 2026 V2 (3).xlsx.
 *   4) Aset GI sheet — from Laporan Harian OOP 2026.xlsx.
 *
 * Linking:
 *   - The name from the sheet is normalized canonically: converted to uppercase, 
 *     prefix "GI " (or "GI-") is removed, and all non-alphanumeric characters are stripped.
 *   - The same normalization is applied to GI locations in the DB.
 *   - Matches must be UNIQUE. If there are 0 or >1 matches, it's listed as UNMATCHED.
 *
 * SAFETY:
 *   - Additive & idempotent (assetCode is unique, preventing duplicates).
 *   - Runs in DRY-RUN mode by default.
 *   - Real execution requires the `--apply` flag.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient, AssetType, AssetStatus } from '@prisma/client';
import { slugifyCode } from '../src/utils/generateCode';

const prisma = new PrismaClient();
const datasetDir = path.resolve(__dirname, '../../dataset_scada');
const WB = path.join(datasetDir, 'TELEKOMUNIKASI SCADA 2026 V2 (3).xlsx');
const RTU = path.join(datasetDir, 'csd_IFS-IFS_RTUs10622026.xlsx');
const ASET_GI_WB = path.join(datasetDir, 'Laporan Harian OOP 2026.xlsx');

const MEDIA_SHEETS = ['GSM 4G', 'Radio Data', 'ICON+ GSM', 'ICON+ IPVPN', 'FO APD'];

const norm = (v: unknown) => (v == null ? '' : v.toString().trim());

/** Canonical normalizer for GI names */
function cleanGiName(name: string): string {
  let s = name.toUpperCase().trim();
  if (s.startsWith('GI ') || s.startsWith('GI-')) {
    s = s.substring(3).trim();
  } else if (s.startsWith('GI')) {
    s = s.substring(2).trim();
  }
  return s.replace(/[^A-Z0-9]/g, '');
}

type Row = {
  code: string;
  name: string;
  type: AssetType;
  status: AssetStatus;
  locationId: string;
  serialNumber: string | null;
  brand: string | null;
  model: string | null;
  protocol: string | null;
  asdu: string | null;
  pairChannel: string | null;
  linkAddress: string | null;
  masterIp1: string | null;
  masterIp2: string | null;
  notes: string | null;
};

interface UnmatchedRow {
  sheet: string;
  row: number;
  gardu: string;
  cleaned: string;
  reason: string;
}

/** Map header label → column index (1-based) for a sheet's first row. */
function headerMap(ws: ExcelJS.Worksheet, headerRowIndex = 1): Map<string, number> {
  const m = new Map<string, number>();
  ws.getRow(headerRowIndex).eachCell({ includeEmpty: false }, (c, col) => {
    const h = norm(c.text).toLowerCase();
    if (h && !m.has(h)) m.set(h, col);
  });
  return m;
}

/** First column whose header contains any of `needles`. */
function col(h: Map<string, number>, ...needles: string[]): number | undefined {
  for (const [label, idx] of h) if (needles.some((n) => label.includes(n))) return idx;
  return undefined;
}

function mediaType(sheet: string, tipe: string): AssetType {
  const t = `${sheet} ${tipe}`.toUpperCase();
  if (t.includes('RADIO')) return AssetType.RADIO;
  if (t.includes('IPVPN') || sheet === 'FO APD' || t.includes('FO ')) return AssetType.ROUTER;
  if (t.includes('GSM')) return AssetType.MODEM;
  return AssetType.MODEM;
}

function mediaStatus(statusOperasi: string, kondisi: string): AssetStatus {
  if (/tidak\s*baik/i.test(kondisi)) return AssetStatus.DAMAGED;
  if (statusOperasi && !/active|aktif/i.test(statusOperasi)) return AssetStatus.WARNING;
  return AssetStatus.ACTIVE;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`🚀 Starting SCADA assets seeder... [Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}]`);

  // Load GI locations scoped to RTUPP-1
  const rtupp1 = await prisma.rTUPP.findFirst({ where: { code: 'RTUPP-1' } });
  if (!rtupp1) {
    throw new Error('RTUPP-1 not found in database. Run seed-demo first.');
  }

  const giLocations = await prisma.location.findMany({
    where: {
      locationType: 'GI',
      rtuppId: rtupp1.id,
      deletedAt: null
    }
  });

  console.log(`📍 Loaded ${giLocations.length} GI locations belonging to RTUPP-1`);

  // Build canonical map of GI cleaned keys to locations
  const giMap = new Map<string, typeof giLocations>();
  for (const loc of giLocations) {
    const keys = new Set<string>();
    if (loc.name) keys.add(cleanGiName(loc.name));
    if (loc.code) keys.add(cleanGiName(loc.code));
    for (const k of keys) {
      if (!giMap.has(k)) {
        giMap.set(k, []);
      }
      giMap.get(k)!.push(loc);
    }
  }

  const usedSerials = new Set<string>();
  const dedupeSerial = (sn: string | null): string | null => {
    if (!sn) return null;
    const k = sn.toUpperCase();
    if (usedSerials.has(k)) return null;
    usedSerials.add(k);
    return sn;
  };

  const usedCodes = new Set<string>();
  const uniqueCode = (base: string) => {
    const root = slugifyCode(base, 'AST').slice(0, 100);
    if (!usedCodes.has(root)) {
      usedCodes.add(root);
      return root;
    }
    for (let i = 2; i < 1e6; i++) {
      const s = `-${i}`;
      const c = `${root.slice(0, 100 - s.length)}${s}`;
      if (!usedCodes.has(c)) {
        usedCodes.add(c);
        return c;
      }
    }
    return `${root.slice(0, 90)}-${Date.now().toString(36)}`;
  };

  const rows: Row[] = [];
  const unmatched: UnmatchedRow[] = [];

  // Hardcoded aliases map for verified GI RTUPP1 abbreviations
  const CANONICAL_ALIASES: Record<string, string> = {
    'ABADIGUNAPAPAN': 'AGP',
    'ABADIGUNAPAPANCIPUTRA': 'AGPCIPUTRA',
    'JAKARTAGARDENCITY': 'JGC',
    'PANTAIINDAHKAPUK': 'PIK',
  };

  const matchLocation = (garduName: string, sheet: string, rowNum: number): string | null => {
    let key = cleanGiName(garduName);
    if (CANONICAL_ALIASES[key]) {
      key = CANONICAL_ALIASES[key];
    }
    const matches = giMap.get(key) ?? [];
    if (matches.length === 1) {
      return matches[0].id;
    }
    const reason = matches.length === 0 ? 'No matching GI location' : `Ambiguous match (${matches.length} matches)`;
    unmatched.push({ sheet, row: rowNum, gardu: garduName, cleaned: key, reason });
    return null;
  };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WB);

  // 1) Media sheets.
  for (const sheet of MEDIA_SHEETS) {
    const ws = wb.getWorksheet(sheet);
    if (!ws) {
      console.log(`  [${sheet}] missing`);
      continue;
    }
    const h = headerMap(ws);
    const C = {
      code: col(h, 'serial number', 'service id', 'sid') ?? col(h, 'sn'),
      brand: col(h, 'brand', 'provider'),
      model: col(h, 'model', 'layanan'),
      tipe: col(h, 'tipe', 'type'),
      lokasi: col(h, 'lokasi'),
      statusOp: col(h, 'status operasi'),
      kondisi: col(h, 'kondisi'),
      pair: col(h, 'pair'),
      link: col(h, 'link add'),
      asdu: col(h, 'asdu'),
      mip1: col(h, 'master ip1'),
      mip2: col(h, 'master ip2'),
    };
    let added = 0;
    const get = (r: ExcelJS.Row, i?: number) => (i ? norm(r.getCell(i).text) : '');
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const lok = get(row, C.lokasi);
      const locId = lok ? matchLocation(lok, sheet, r) : null;
      const tipe = get(row, C.tipe) || sheet;
      if (!lok && !tipe) continue;
      if (!locId) continue;
      const sn = dedupeSerial(get(row, C.code) || null);
      const brand = get(row, C.brand) || null;
      const model = get(row, C.model) || null;
      const name = `${tipe} ${lok}`.trim();
      rows.push({
        code: uniqueCode(sn || name),
        name,
        type: mediaType(sheet, tipe),
        status: mediaStatus(get(row, C.statusOp), get(row, C.kondisi)),
        locationId: locId,
        serialNumber: sn,
        brand,
        model,
        protocol: null,
        asdu: get(row, C.asdu) || null,
        pairChannel: get(row, C.pair) || null,
        linkAddress: get(row, C.link) || null,
        masterIp1: get(row, C.mip1) || null,
        masterIp2: get(row, C.mip2) || null,
        notes: `Sumber: ${sheet}`,
      });
      added++;
    }
    console.log(`  [${sheet}] +${added} parsed`);
  }

  // 2) IFS RTUs.
  const rwb = new ExcelJS.Workbook();
  await rwb.xlsx.readFile(RTU);
  const rws = rwb.worksheets[0];
  let rtuAdded = 0;
  for (let r = 2; r <= rws.rowCount; r++) {
    const row = rws.getRow(r);
    const name = norm(row.getCell(1).text); // RTU Name
    if (!name) continue;
    const locId = matchLocation(name, 'IFS RTUs', r);
    if (!locId) continue;
    const oper = norm(row.getCell(11).text); // Oper State UP/DOWN
    rows.push({
      code: uniqueCode(name),
      name,
      type: AssetType.RTU,
      status: /up/i.test(oper) ? AssetStatus.ACTIVE : AssetStatus.WARNING,
      locationId: locId,
      serialNumber: null,
      brand: null,
      model: null,
      protocol: norm(row.getCell(6).text) || null, // Protocol
      asdu: norm(row.getCell(9).text) || null, // ASDU
      pairChannel: `${norm(row.getCell(2).text)}-${norm(row.getCell(3).text)}`, // PairNr-Channel
      linkAddress: norm(row.getCell(7).text) || null, // Address
      masterIp1: null,
      masterIp2: null,
      notes: 'Sumber: IFS RTUs',
    });
    rtuAdded++;
  }
  console.log(`  [IFS RTUs] +${rtuAdded} parsed`);

  // 3) TELKOM GI sheet (level-GI).
  const wsTelkomGi = wb.getWorksheet('TELKOM GI');
  let telkomGiAdded = 0;
  if (wsTelkomGi) {
    const C = {
      gardu: 2,         // Column B: GARDU
      protocol: 7,      // Column G: Protokol
      link: 8,          // Column H: Link OT
      brand: 9,         // Column I: Merk Router OT
      mip1: 10,         // Column J: IP GW OT 20KV
      b3: 14,           // Column N: B3 (RTU code/name)
      pairChannel: 15   // Column O: PAIR-CHANNEL MAIN
    };
    const get = (r: ExcelJS.Row, colIndex: number) => norm(r.getCell(colIndex).text);
    for (let r = 6; r <= wsTelkomGi.rowCount; r++) {
      const row = wsTelkomGi.getRow(r);
      const gardu = get(row, C.gardu);
      if (!gardu) continue;
      const locId = matchLocation(gardu, 'TELKOM GI', r);
      if (!locId) continue;

      const rtuName = get(row, C.b3) || gardu;
      const sn = null;
      const brand = get(row, C.brand) || null;
      const codeBase = `TELKOM-GI-${cleanGiName(gardu)}`;
      rows.push({
        code: uniqueCode(codeBase),
        name: rtuName,
        type: AssetType.RTU,
        status: AssetStatus.ACTIVE,
        locationId: locId,
        serialNumber: sn,
        brand,
        model: null,
        protocol: get(row, C.protocol) || null,
        asdu: null,
        pairChannel: get(row, C.pairChannel) || null,
        linkAddress: get(row, C.link) || null,
        masterIp1: get(row, C.mip1) || null,
        masterIp2: null,
        notes: 'Sumber: TELKOM GI',
      });
      telkomGiAdded++;
    }
    console.log(`  [TELKOM GI] +${telkomGiAdded} parsed`);
  } else {
    console.log('  [TELKOM GI] missing');
  }

  // 4) Aset GI sheet (level-GI) in Laporan Harian OOP 2026.xlsx.
  const wbAsetGi = new ExcelJS.Workbook();
  await wbAsetGi.xlsx.readFile(ASET_GI_WB);
  const wsAsetGi = wbAsetGi.getWorksheet('Aset GI');
  let asetGiAdded = 0;
  if (wsAsetGi) {
    for (let r = 4; r <= wsAsetGi.rowCount; r++) {
      const row = wsAsetGi.getRow(r);
      const gardu = norm(row.getCell(2).text); // Column B: Gardu
      if (!gardu) continue;
      const locId = matchLocation(gardu, 'Aset GI', r);
      if (!locId) continue;

      const name = `RTU ${gardu}`;
      const codeBase = `ASET-GI-${cleanGiName(gardu)}`;
      rows.push({
        code: uniqueCode(codeBase),
        name,
        type: AssetType.RTU,
        status: AssetStatus.ACTIVE,
        locationId: locId,
        serialNumber: null,
        brand: null,
        model: null,
        protocol: null,
        asdu: null,
        pairChannel: null,
        linkAddress: null,
        masterIp1: null,
        masterIp2: null,
        notes: 'Sumber: Aset GI',
      });
      asetGiAdded++;
    }
    console.log(`  [Aset GI] +${asetGiAdded} parsed`);
  } else {
    console.log('  [Aset GI] missing');
  }

  // 5) Filter out existing assets
  const existingAssets = await prisma.asset.findMany({ select: { assetCode: true } });
  const existingCodes = new Set(existingAssets.map((a) => a.assetCode));
  const toInsert = rows.filter((r) => !existingCodes.has(r.code));

  console.log(`\n📊 SUMMARY STATS:`);
  console.log(`  - Total rows parsed: ${rows.length}`);
  console.log(`  - Total unmatched rows: ${unmatched.length}`);
  console.log(`  - Total new assets to insert: ${toInsert.length}`);

  // Count by GI location
  const byLocation = new Map<string, number>();
  const locationNames = new Map(giLocations.map((l) => [l.id, l.name]));

  for (const r of toInsert) {
    const locName = locationNames.get(r.locationId) ?? 'Unknown GI';
    byLocation.set(locName, (byLocation.get(locName) ?? 0) + 1);
  }

  console.log(`\n🏢 Aset Baru yang akan dibuat per GI:`);
  if (byLocation.size === 0) {
    console.log('  (Tidak ada aset baru yang akan dibuat)');
  } else {
    for (const [giName, count] of byLocation.entries()) {
      console.log(`  * ${giName}: ${count} aset`);
    }
  }

  console.log(`\n❌ DAFTAR UNMATCHED ROWS (${unmatched.length} baris):`);
  if (unmatched.length === 0) {
    console.log('  (Tidak ada baris unmatched)');
  } else {
    unmatched.forEach((u) => {
      console.log(`  [${u.sheet}] Row ${u.row}: "${u.gardu}" (clean: "${u.cleaned}") - Reason: ${u.reason}`);
    });
  }

  if (isApply) {
    const beforeCount = await prisma.asset.count();
    console.log(`\n💾 Inserting ${toInsert.length} assets into the database in a transaction...`);

    const result = await prisma.$transaction(async (tx) => {
      let count = 0;
      const CHUNK = 1000;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const batch = toInsert.slice(i, i + CHUNK);
        const res = await tx.asset.createMany({
          data: batch.map((r) => ({
            assetCode: r.code,
            assetName: r.name,
            assetType: r.type,
            status: r.status,
            locationId: r.locationId,
            serialNumber: r.serialNumber,
            brand: r.brand,
            model: r.model,
            protocol: r.protocol,
            asdu: r.asdu,
            pairChannel: r.pairChannel,
            linkAddress: r.linkAddress,
            masterIp1: r.masterIp1,
            masterIp2: r.masterIp2,
            notes: r.notes,
          })),
          skipDuplicates: true,
        });
        count += res.count;
      }
      return count;
    });

    const afterCount = await prisma.asset.count();
    console.log(`✅ Transaction successful!`);
    console.log(`  - Assets in DB before: ${beforeCount}`);
    console.log(`  - Assets inserted: ${result}`);
    console.log(`  - Assets in DB after: ${afterCount}`);
  } else {
    console.log('\n💡 [DRY-RUN] No writes performed. Run with "--apply" to commit changes.');
  }
}

main()
  .catch((e) => {
    console.error('❌ seed-scada-assets failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
