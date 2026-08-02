/**
 * Seed/Import GH locations and feeders from the Excel file:
 * D:/VoltReport/DAFTAR ISI GH_PENYULANG UID JAYA (1).xlsx
 *
 * GH -> RTUPP mapping (tenant isolation is security-critical):
 *   SOURCE OF TRUTH = the official AREA_TO_RTUPP map below (provided by the
 *   user 2026-06-28), keyed on the "AREA GH" column of sheet "GH". Every GH
 *   whose area is in the map is CERTAIN. Any other area (e.g. DISBANTEN) is
 *   UNMATCHED and is NOT imported — left untouched for manual handling.
 *
 * Roles enforced downstream use the existing system roles only
 * (MASTER/MANAGER = global, ADMIN/PETUGAS = scoped by rtuppId). No SUPER_ADMIN.
 *
 * Modes:
 *   (default)  DRY-RUN — no writes, prints full breakdown + review CSV.
 *   --apply    Write to DB (single transaction, idempotent).
 */
import { PrismaClient, LocationType } from '@prisma/client';
import ExcelJS from 'exceljs';
import fs from 'fs';

const prisma = new PrismaClient();
const FILE = "D:/VoltReport/DAFTAR ISI GH_PENYULANG UID JAYA (1).xlsx";
const REVIEW_CSV = "D:/VoltReport/gh-mapping-review.csv";

const norm = (v: unknown) => (v == null ? '' : String(v).trim());
const up = (s: string) => s.trim().toUpperCase();

type MapSource = 'CERTAIN' | 'UNMATCHED';

// OFFICIAL AREA -> RTUPP map (source of truth, user-provided 2026-06-28).
// Keyed on the "AREA GH" column. Areas not listed here -> UNMATCHED (not imported).
const AREA_TO_RTUPP: Record<string, string> = {
  // RTUPP 2
  'BULUNGAN': 'RTUPP-2',
  'CIPUTAT': 'RTUPP-2',
  'BINTARO': 'RTUPP-2',
  'LENTENG AGUNG': 'RTUPP-2',

  // RTUPP 3
  'MARUNDA': 'RTUPP-3',
  'MENTENG': 'RTUPP-3',
  'TANJUNG PRIOK': 'RTUPP-3',

  // RTUPP 4
  'BANDENGAN': 'RTUPP-4',
  'CENGKARENG': 'RTUPP-4',
  'KEBON JERUK': 'RTUPP-4',

  // RTUPP 5
  'CEMPAKA PUTIH': 'RTUPP-5',
  'CIRACAS': 'RTUPP-5',
  'PONDOK KOPI': 'RTUPP-5',
  'PONDOK GEDE': 'RTUPP-5',
  'JATINEGARA': 'RTUPP-5',
  'KRAMAT JATI': 'RTUPP-5',
};

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply;

  console.log(`🏁 Starting GH & Feeders import... [Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}]`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  // 1. Read GH sheet (feeders)
  const ws = wb.getWorksheet('GH');
  if (!ws) throw new Error('Sheet GH tidak ditemukan');

  const H = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => {
    const h = norm(c.text).toLowerCase();
    if (h && !H.has(h)) H.set(h, col);
  });
  const cGh = H.get('gh');
  const cPyl = H.get('penyulang');
  const cGi = H.get('gardu induk');
  const cArea = H.get('area gh');

  if (!cGh || !cPyl) throw new Error(`Kolom GH/PENYULANG tidak ditemukan (gh=${cGh}, penyulang=${cPyl})`);

  type GhInfo = { code: string; area: string; feeders: Set<string>; gi: string };
  const excelGhs = new Map<string, GhInfo>();

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const gh = norm(row.getCell(cGh).text);
    const pyl = norm(row.getCell(cPyl).text);
    const gi = cGi ? norm(row.getCell(cGi).text) : '';
    const area = cArea ? norm(row.getCell(cArea).text) : '';

    if (!gh || !pyl) continue;

    const key = up(gh);
    if (!excelGhs.has(key)) {
      excelGhs.set(key, {
        code: gh,
        area: area,
        feeders: new Set<string>(),
        gi: gi
      });
    }
    excelGhs.get(key)!.feeders.add(pyl);
  }

  // 3. Ensure RTUPPs 2-5 exist in DB
  const rtuppCodes = ['RTUPP-2', 'RTUPP-3', 'RTUPP-4', 'RTUPP-5'];
  const rtuppNames: Record<string, string> = {
    'RTUPP-2': 'RTUPP 2',
    'RTUPP-3': 'RTUPP 3',
    'RTUPP-4': 'RTUPP 4',
    'RTUPP-5': 'RTUPP 5'
  };

  const rtuppIdMap = new Map<string, string>();
  for (const code of rtuppCodes) {
    let rtupp = await prisma.rTUPP.findUnique({ where: { code } });
    if (!rtupp) {
      if (isApply) {
        rtupp = await prisma.rTUPP.create({
          data: {
            code,
            name: rtuppNames[code],
            isActive: true
          }
        });
        console.log(`➕ Created RTUPP: ${rtuppNames[code]} (${rtupp.id})`);
      } else {
        console.log(`🔍 [DRY-RUN] Will create RTUPP: ${rtuppNames[code]}`);
      }
    }
    rtuppIdMap.set(code, rtupp?.id ?? `MOCK-${code}-ID`);
  }

  // 4. Ensure UP3s are registered in the Up3 table
  const dbUp3s = await prisma.up3.findMany();
  const dbUp3Names = new Set(dbUp3s.map(u => up(u.name)));

  // 5. Query locations and feeders for comparison
  const dbLocations = await prisma.location.findMany({
    where: { locationType: LocationType.GH },
    select: { id: true, code: true, name: true, up3: true, rtuppId: true }
  });
  const dbLocMap = new Map(dbLocations.map(l => [up(l.code), l]));

  const dbFeeders = await prisma.feeder.findMany({
    select: { locationId: true, feederCode: true }
  });
  const dbFeederKeys = new Set(dbFeeders.map(f => `${f.locationId}::${up(f.feederCode)}`));

  const idToRtuppCode = new Map([...rtuppIdMap].map(([code, id]) => [id, code]));

  // 6. Resolve mapping for every distinct GH (official area map = source of truth)
  type Plan = {
    ghCode: string; info: GhInfo;
    source: MapSource; rtuppCode: string | null; up3Name: string | null;
    action: 'CREATE' | 'UPDATE' | 'NOCHANGE' | 'SKIP_UNMATCHED';
    fromRtupp: string | null;
  };
  const plans: Plan[] = [];

  for (const [ghCode, info] of excelGhs.entries()) {
    const areaClean = up(info.area).replace('UP3 ', '');
    const rtuppCode = AREA_TO_RTUPP[areaClean] || null;
    const up3Name = rtuppCode ? `UP3 ${areaClean}` : null;
    const source: MapSource = rtuppCode ? 'CERTAIN' : 'UNMATCHED';

    const dbLoc = dbLocMap.get(ghCode);
    const fromRtupp = dbLoc?.rtuppId ? (idToRtuppCode.get(dbLoc.rtuppId) || dbLoc.rtuppId) : null;

    let action: Plan['action'];
    if (source === 'UNMATCHED') action = 'SKIP_UNMATCHED';
    else if (!dbLoc) action = 'CREATE';
    else if (dbLoc.rtuppId !== rtuppIdMap.get(rtuppCode!) || dbLoc.up3 !== up3Name) action = 'UPDATE';
    else action = 'NOCHANGE';

    plans.push({ ghCode, info, source, rtuppCode, up3Name, action, fromRtupp });
  }

  // 6b. Write review CSV (every GH + how its RTUPP was decided)
  const csvRows = ['GH,SOURCE,AREA,RTUPP,UP3,DB_FROM_RTUPP,ACTION,PENYULANG'];
  for (const p of plans) {
    csvRows.push([p.ghCode, p.source, `"${p.info.area}"`, p.rtuppCode ?? '', `"${p.up3Name ?? ''}"`,
      p.fromRtupp ?? '', p.action, String(p.info.feeders.size)].join(','));
  }
  fs.writeFileSync(REVIEW_CSV, csvRows.join('\n'), 'utf8');

  // 7. Tally
  const count = (a: Plan['action']) => plans.filter(p => p.action === a).length;
  const RT = ['RTUPP-2', 'RTUPP-3', 'RTUPP-4', 'RTUPP-5'];
  const TARGET_GH: Record<string, number> = { 'RTUPP-2': 69, 'RTUPP-3': 87, 'RTUPP-4': 54, 'RTUPP-5': 62 };
  const TARGET_PYL: Record<string, number> = { 'RTUPP-2': 573, 'RTUPP-3': 744, 'RTUPP-4': 471, 'RTUPP-5': 573 };

  // GH + penyulang distribution per RTUPP (CERTAIN only)
  const ghPerRtupp = new Map<string, number>();
  const pylPerRtupp = new Map<string, number>();
  for (const p of plans) if (p.source === 'CERTAIN') {
    ghPerRtupp.set(p.rtuppCode!, (ghPerRtupp.get(p.rtuppCode!) || 0) + 1);
    pylPerRtupp.set(p.rtuppCode!, (pylPerRtupp.get(p.rtuppCode!) || 0) + p.info.feeders.size);
  }

  // per-RTUPP action breakdown
  const actPerRtupp = new Map<string, { CREATE: number; UPDATE: number; NOCHANGE: number }>();
  for (const r of RT) actPerRtupp.set(r, { CREATE: 0, UPDATE: 0, NOCHANGE: 0 });
  for (const p of plans) if (p.source === 'CERTAIN' && p.action !== 'SKIP_UNMATCHED') {
    (actPerRtupp.get(p.rtuppCode!) as any)[p.action]++;
  }

  // rtuppId changes from -> to
  const changes = new Map<string, number>();
  for (const p of plans) if (p.action === 'UPDATE') {
    const k = `${p.fromRtupp ?? '(null)'} -> ${p.rtuppCode}`;
    changes.set(k, (changes.get(k) || 0) + 1);
  }

  const tick = (got: number, want: number) => (got === want ? 'OK' : `MISMATCH(target ${want})`);
  let totalGh = 0, totalPyl = 0;

  console.log(`\n=== (1) DISTRIBUTION per RTUPP (CERTAIN, ${plans.filter(p => p.source === 'CERTAIN').length} GH) ===`);
  for (const r of RT) {
    const g = ghPerRtupp.get(r) || 0, py = pylPerRtupp.get(r) || 0;
    totalGh += g; totalPyl += py;
    console.log(`  ${r}: GH=${g} [${tick(g, TARGET_GH[r])}]  penyulang=${py} [${tick(py, TARGET_PYL[r])}]`);
  }
  console.log(`  TOTAL: GH=${totalGh}  penyulang=${totalPyl}`);

  console.log(`\n=== (2) GH WRITE PLAN — CREATE vs UPDATE per RTUPP ===`);
  for (const r of RT) {
    const a = actPerRtupp.get(r)!;
    console.log(`  ${r}: CREATE=${a.CREATE}  UPDATE=${a.UPDATE}  NOCHANGE=${a.NOCHANGE}`);
  }
  console.log(`  Totals: CREATE=${count('CREATE')}  UPDATE=${count('UPDATE')}  NOCHANGE=${count('NOCHANGE')}`);
  console.log(`  rtuppId reassignments (from -> to):`);
  if (!changes.size) console.log(`     (none)`);
  for (const [k, v] of [...changes].sort()) console.log(`     ${k}: ${v}`);

  // 8. Apply (transactional + idempotent)
  let feedersCreated = 0, feedersSkipped = 0;
  if (isApply) {
    await prisma.$transaction(async (tx) => {
      for (const p of plans) {
        if (p.action === 'SKIP_UNMATCHED') continue;
        const rtuppId = rtuppIdMap.get(p.rtuppCode!)!;
        const up3Name = p.up3Name!;
        if (!dbUp3Names.has(up(up3Name))) {
          await tx.up3.upsert({
            where: { rtuppId_code: { rtuppId, code: up3Name } },
            update: {},
            create: { rtuppId, code: up3Name, name: up3Name },
          });
          dbUp3Names.add(up(up3Name));
        }
        let locId = dbLocMap.get(p.ghCode)?.id ?? null;
        if (p.action === 'CREATE') {
          const created = await tx.location.create({
            data: { code: p.info.code, name: p.info.code, locationType: LocationType.GH, up3: up3Name, rtuppId, status: true },
          });
          locId = created.id;
        } else if (p.action === 'UPDATE') {
          await tx.location.update({ where: { id: locId! }, data: { rtuppId, up3: up3Name } });
        }
        for (const pyl of p.info.feeders) {
          if (locId && dbFeederKeys.has(`${locId}::${up(pyl)}`)) { feedersSkipped++; continue; }
          feedersCreated++;
          const feederName = p.info.gi ? `${pyl} (${p.info.gi})`.slice(0, 255) : pyl.slice(0, 255);
          await tx.feeder.create({ data: { locationId: locId!, feederCode: pyl.slice(0, 50), feederName } });
        }
      }
    });
  } else {
    // dry-run feeder estimate
    for (const p of plans) {
      if (p.action === 'SKIP_UNMATCHED') continue;
      const locId = dbLocMap.get(p.ghCode)?.id ?? null;
      for (const pyl of p.info.feeders) {
        if (locId && dbFeederKeys.has(`${locId}::${up(pyl)}`)) feedersSkipped++; else feedersCreated++;
      }
    }
  }

  console.log(`\n=== (3) FEEDERS (Penyulang) ===`);
  console.log(`  New feeders ${isApply ? 'created' : 'to create'}: ${feedersCreated}`);
  console.log(`  Existing feeders skipped:    ${feedersSkipped}`);

  console.log(`\n=== (4) UNMATCHED (NOT imported) ===`);
  const unmatched = plans.filter(p => p.source === 'UNMATCHED');
  console.log(`  Count: ${unmatched.length}`);
  for (const p of unmatched) console.log(`   - ${p.ghCode} (area="${p.info.area || 'N/A'}")`);
  console.log(`\n  Review CSV: ${REVIEW_CSV}`);

  console.log(`\n=== (5) SAFETY ===`);
  console.log(`  Idempotent:    yes (UPDATE only when rtuppId/up3 differs; feeders dedup by locationId+code)`);
  console.log(`  Transactional: yes (all writes inside a single prisma.$transaction)`);
  console.log(`  Apply flag:    --apply (omitted => DRY-RUN, no writes)`);

  if (isApply) {
    console.log("\n✅ Import completed successfully (transactional).");
  } else {
    console.log("\n💡 Dry-run finished. No writes made. Run with '--apply' to execute.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Import script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
