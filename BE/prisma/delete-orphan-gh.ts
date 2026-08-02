/**
 * Hard-delete the 3 orphan GH that are NOT in the source workbook (legacy data
 * left on a JAKSEL RTUPP): GH0056, GH0127, GH0420.
 *
 * Safety contract:
 *   - Exact-code match ONLY (no LIKE / prefix) — cannot touch any other GH.
 *   - Single transaction. Idempotent: codes already gone => no-op.
 *   - Re-verifies each target is a GH and has ZERO child rows at delete time.
 *     If any child row appears (feeder/WO/laporan/asset/etc.), the WHOLE
 *     transaction ABORTS with a report — we never silently cascade live data.
 *   - DRY-RUN by default; --apply to execute.
 *
 * ADDITIVE: touches only these 3 location rows. GI / RTUPP1 domain untouched.
 */
import { PrismaClient, LocationType, Prisma } from '@prisma/client';
const prisma = new PrismaClient();
const TARGETS = ['GH0056', 'GH0127', 'GH0420'];

async function childCounts(tx: Prisma.TransactionClient, id: string) {
  const [
    feeders, assets, commMedia, inspections, harReports, documents, genReports,
    performance, tickets, siteGeom, bays, workOrders,
    laporanGi, laporanHarGi, laporanInspGh, laporanHarGh,
  ] = await Promise.all([
    tx.feeder.count({ where: { locationId: id } }),
    tx.asset.count({ where: { locationId: id } }),
    tx.communicationMedia.count({ where: { locationId: id } }),
    tx.inspection.count({ where: { locationId: id } }),
    tx.harReport.count({ where: { locationId: id } }),
    tx.document.count({ where: { locationId: id } }),
    tx.generatedReport.count({ where: { locationId: id } }),
    tx.performanceDaily.count({ where: { locationId: id } }),
    tx.ticket.count({ where: { locationId: id } }),
    tx.siteGeometry.count({ where: { locationId: id } }),
    tx.bay.count({ where: { locationId: id } }),
    tx.workOrder.count({ where: { locationId: id } }),
    tx.laporanGi.count({ where: { locationId: id } }),
    tx.laporanHarGi.count({ where: { locationId: id } }),
    tx.laporanInspeksiGh.count({ where: { locationId: id } }),
    tx.laporanHarGh.count({ where: { locationId: id } }),
  ]);
  const total = feeders + assets + commMedia + inspections + harReports + documents + genReports +
    performance + tickets + siteGeom + bays + workOrders +
    laporanGi + laporanHarGi + laporanInspGh + laporanHarGh;
  return { total };
}

async function main() {
  const isApply = process.argv.slice(2).includes('--apply');
  console.log(`🧹 Orphan-GH delete [Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}] targets: ${TARGETS.join(', ')}`);

  await prisma.$transaction(async (tx) => {
    const locs = await tx.location.findMany({ where: { code: { in: TARGETS } }, select: { id: true, code: true, locationType: true } });
    const found = new Map(locs.map(l => [l.code, l]));

    for (const code of TARGETS) {
      const l = found.get(code);
      if (!l) { console.log(`  ${code}: absent (no-op)`); continue; }
      if (l.locationType !== LocationType.GH) throw new Error(`ABORT: ${code} is ${l.locationType}, not GH`);
      const { total } = await childCounts(tx, l.id);
      if (total > 0) throw new Error(`ABORT: ${code} now has ${total} child rows — refusing to cascade live data. Re-run preview.`);
      console.log(`  ${code}: GH, 0 child rows -> ${isApply ? 'DELETING' : 'would delete'}`);
    }

    if (isApply) {
      // exact-code + type-guarded delete; returns count actually removed
      const res = await tx.location.deleteMany({ where: { code: { in: TARGETS }, locationType: LocationType.GH } });
      console.log(`  ✅ Deleted ${res.count} location row(s).`);
    } else {
      console.log('  💡 DRY-RUN — no rows deleted. Re-run with --apply.');
    }
  });
}
main().catch(e => { console.error('❌', e.message); process.exit(1); }).finally(() => prisma.$disconnect());
