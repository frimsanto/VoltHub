/**
 * Populate `performance_daily` (the Performance page source) from the SCADA
 * availability registry `scada_gardu`, which already holds a per-day availability
 * series (`daily` JSON) imported from the Laporan Gardu RC/GH/GI workbooks.
 *
 * Rationale: the workbook has no separate "ASET MP / daily performance" sheet —
 * the only real daily availability lives in scada_gardu.daily. We project the most
 * recent N days per gardu into performance_daily so the Performance grid/detail
 * shows genuine data (no fabrication), matched to a `locations` row by code.
 *
 *   performanceStatus = value > 0 ? 1 (Berhasil) : 0 (Gagal)
 *   score             = round(value * 100)   // 0..100
 *
 * SAFETY
 *  - Additive & idempotent: createMany({ skipDuplicates }) on unique (locationId,
 *    performanceDate). Re-running inserts only missing (gardu, date) pairs.
 *
 * Run:  npm run seed:performance              (default: last 30 days/gardu)
 *       npm run seed:performance -- 60         (last 60 days/gardu)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const DAYS = Math.max(1, Number(process.argv[2]) || 30);

async function main() {
  const [gardus, locs] = await Promise.all([
    prisma.scadaGardu.findMany({ select: { code: true, daily: true } }),
    prisma.location.findMany({ select: { id: true, code: true } }),
  ]);

  const byCode = new Map(locs.map((l) => [norm(l.code ?? ''), l.id]));

  type Row = { locationId: string; performanceDate: Date; performanceStatus: number; score: number };
  const rows: Row[] = [];
  let matched = 0;
  let missed = 0;

  for (const g of gardus) {
    const locationId = byCode.get(norm(g.code));
    if (!locationId) {
      missed++;
      continue;
    }
    matched++;
    const daily = (g.daily ?? {}) as Record<string, number>;
    const entries = Object.entries(daily)
      .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
      .slice(0, DAYS);

    for (const [date, value] of entries) {
      const v = Number(value);
      if (!Number.isFinite(v)) continue;
      rows.push({
        locationId,
        performanceDate: new Date(`${date}T00:00:00`),
        performanceStatus: v > 0 ? 1 : 0,
        score: Math.max(0, Math.min(100, Math.round(v * 100))),
      });
    }
  }

  console.log(`scadaGardu=${gardus.length} matched=${matched} missed=${missed} → ${rows.length} performance rows (last ${DAYS} days/gardu)`);

  let inserted = 0;
  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await prisma.performanceDaily.createMany({ data: chunk, skipDuplicates: true });
    inserted += res.count;
    process.stdout.write(`\r  inserted ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');
  const total = await prisma.performanceDaily.count();
  console.log(`Done. performance_daily now has ${total} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
