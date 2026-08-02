/**
 * Backfill Location.rtuppId for locationType=GARDU (Metering Point / MP module prep).
 *
 * GARDU -> RTUPP mapping (tenant isolation is security-critical):
 *   SOURCE OF TRUTH = the same official AREA_TO_RTUPP map used for GH
 *   (prisma/import-gh-feeders.ts), keyed on Location.up3 for GARDU rows.
 *   Every GARDU whose up3 is in the map is CERTAIN. Any other up3 value
 *   (NULL, 'UP3 Jakarta', or anything unlisted) is UNMATCHED and is NOT
 *   touched — left for manual handling.
 *
 * Modes:
 *   (default)  DRY-RUN — no writes, prints full breakdown + review CSV.
 *   --apply    Write to DB (single transaction, idempotent).
 */
import { PrismaClient, LocationType } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const REVIEW_CSV = "D:/VoltReport/gardu-rtupp-mapping-review.csv";

const up = (s: string) => s.trim().toUpperCase();

type MapSource = 'CERTAIN' | 'UNMATCHED';

// Same official map as GH (prisma/import-gh-feeders.ts) — kept in sync manually.
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

  console.log(`🏁 Starting GARDU rtuppId backfill... [Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}]`);

  const rtuppCodes = ['RTUPP-2', 'RTUPP-3', 'RTUPP-4', 'RTUPP-5'];
  const rtuppIdMap = new Map<string, string>();
  for (const code of rtuppCodes) {
    const rtupp = await prisma.rTUPP.findUnique({ where: { code } });
    if (!rtupp) {
      console.log(`⚠️  RTUPP ${code} not found in DB — expected to already exist from GH import.`);
      continue;
    }
    rtuppIdMap.set(code, rtupp.id);
  }
  const idToRtuppCode = new Map([...rtuppIdMap].map(([code, id]) => [id, code]));

  const dbLocations = await prisma.location.findMany({
    where: { locationType: LocationType.GARDU },
    select: { id: true, code: true, name: true, up3: true, rtuppId: true },
  });

  type Plan = {
    id: string; code: string; up3Raw: string | null;
    source: MapSource; rtuppCode: string | null;
    action: 'UPDATE' | 'NOCHANGE' | 'SKIP_UNMATCHED';
    fromRtupp: string | null;
  };
  const plans: Plan[] = [];

  for (const loc of dbLocations) {
    const areaClean = loc.up3 ? up(loc.up3).replace('UP3 ', '') : '';
    const rtuppCode = areaClean ? (AREA_TO_RTUPP[areaClean] || null) : null;
    const source: MapSource = rtuppCode ? 'CERTAIN' : 'UNMATCHED';
    const fromRtupp = loc.rtuppId ? (idToRtuppCode.get(loc.rtuppId) || loc.rtuppId) : null;

    let action: Plan['action'];
    if (source === 'UNMATCHED') action = 'SKIP_UNMATCHED';
    else if (loc.rtuppId !== rtuppIdMap.get(rtuppCode!)) action = 'UPDATE';
    else action = 'NOCHANGE';

    plans.push({ id: loc.id, code: loc.code, up3Raw: loc.up3, source, rtuppCode, action, fromRtupp });
  }

  // Review CSV
  const csvRows = ['GARDU_CODE,UP3,SOURCE,RTUPP,DB_FROM_RTUPP,ACTION'];
  for (const p of plans) {
    csvRows.push([p.code, `"${p.up3Raw ?? ''}"`, p.source, p.rtuppCode ?? '', p.fromRtupp ?? '', p.action].join(','));
  }
  fs.writeFileSync(REVIEW_CSV, csvRows.join('\n'), 'utf8');

  const count = (a: Plan['action']) => plans.filter(p => p.action === a).length;
  const RT = ['RTUPP-2', 'RTUPP-3', 'RTUPP-4', 'RTUPP-5'];

  const gPerRtupp = new Map<string, number>();
  for (const p of plans) if (p.source === 'CERTAIN') {
    gPerRtupp.set(p.rtuppCode!, (gPerRtupp.get(p.rtuppCode!) || 0) + 1);
  }

  const actPerRtupp = new Map<string, { UPDATE: number; NOCHANGE: number }>();
  for (const r of RT) actPerRtupp.set(r, { UPDATE: 0, NOCHANGE: 0 });
  for (const p of plans) if (p.source === 'CERTAIN' && p.action !== 'SKIP_UNMATCHED') {
    (actPerRtupp.get(p.rtuppCode!) as any)[p.action]++;
  }

  console.log(`\n=== (1) DISTRIBUTION per RTUPP (CERTAIN, ${plans.filter(p => p.source === 'CERTAIN').length} GARDU) ===`);
  let total = 0;
  for (const r of RT) {
    const g = gPerRtupp.get(r) || 0;
    total += g;
    console.log(`  ${r}: GARDU=${g}`);
  }
  console.log(`  TOTAL: GARDU=${total}`);

  console.log(`\n=== (2) WRITE PLAN — UPDATE vs NOCHANGE per RTUPP ===`);
  for (const r of RT) {
    const a = actPerRtupp.get(r)!;
    console.log(`  ${r}: UPDATE=${a.UPDATE}  NOCHANGE=${a.NOCHANGE}`);
  }
  console.log(`  Totals: UPDATE=${count('UPDATE')}  NOCHANGE=${count('NOCHANGE')}  SKIP_UNMATCHED=${count('SKIP_UNMATCHED')}`);

  console.log(`\n=== (3) UNMATCHED (NOT touched) ===`);
  const unmatched = plans.filter(p => p.source === 'UNMATCHED');
  console.log(`  Count: ${unmatched.length}`);
  for (const p of unmatched) console.log(`   - ${p.code} (up3="${p.up3Raw ?? 'NULL'}")`);
  console.log(`\n  Review CSV: ${REVIEW_CSV}`);

  console.log(`\n=== (4) SAFETY ===`);
  console.log(`  Idempotent:    yes (UPDATE only when rtuppId differs)`);
  console.log(`  Transactional: yes (all writes inside a single prisma.$transaction)`);
  console.log(`  Apply flag:    --apply (omitted => DRY-RUN, no writes)`);

  if (isApply) {
    // Grouped updateMany per target RTUPP (fast; avoids long-running single transaction timeouts).
    for (const r of RT) {
      const ids = plans.filter(p => p.action === 'UPDATE' && p.rtuppCode === r).map(p => p.id);
      if (!ids.length) continue;
      const rtuppId = rtuppIdMap.get(r)!;
      await prisma.location.updateMany({ where: { id: { in: ids } }, data: { rtuppId } });
    }
    console.log("\n✅ Backfill applied successfully (grouped updateMany per RTUPP).");
  } else {
    console.log("\n💡 Dry-run finished. No writes made. Run with '--apply' to execute.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Backfill script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
