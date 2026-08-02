/**
 * VoltHub — remove ALL demo data created by seed-demo.ts.
 *
 * Deletes only rows tagged with the `DEMO-` business code/id (and their
 * children), in FK-safe order. Your real data and the production SQL template
 * are untouched. Run: npm run seed:demo:clean
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PFX = 'DEMO-';

async function main() {
  console.log('🧹 Menghapus data DEMO…');

  const demoLocs = await prisma.location.findMany({
    where: { code: { startsWith: PFX } },
    select: { id: true },
  });
  const locIds = demoLocs.map((l) => l.id);

  if (locIds.length) {
    // Children of locations (FK-safe order: grandchildren → children → parent).
    const insp = await prisma.inspection.findMany({ where: { locationId: { in: locIds } }, select: { id: true } });
    const inspIds = insp.map((i) => i.id);
    if (inspIds.length) {
      await prisma.inspectionPhoto.deleteMany({ where: { finding: { inspectionId: { in: inspIds } } } });
      await prisma.inspectionFinding.deleteMany({ where: { inspectionId: { in: inspIds } } });
      await prisma.inspection.deleteMany({ where: { id: { in: inspIds } } });
    }

    const har = await prisma.harReport.findMany({ where: { locationId: { in: locIds } }, select: { id: true } });
    const harIds = har.map((h) => h.id);
    if (harIds.length) {
      await prisma.harDetail.deleteMany({ where: { harReportId: { in: harIds } } });
      await prisma.harReport.deleteMany({ where: { id: { in: harIds } } });
    }

    await prisma.performanceDaily.deleteMany({ where: { locationId: { in: locIds } } });
    await prisma.ticket.deleteMany({ where: { locationId: { in: locIds } } });
    await prisma.asset.deleteMany({ where: { locationId: { in: locIds } } });
    await prisma.feeder.deleteMany({ where: { locationId: { in: locIds } } });
    await prisma.location.deleteMany({ where: { id: { in: locIds } } });
  }

  // Field reports (KPI). Attachments/validations cascade on delete.
  await prisma.laporanAkhir.deleteMany({ where: { reportId: { startsWith: PFX } } });
  await prisma.laporanAwal.deleteMany({ where: { reportId: { startsWith: PFX } } });

  // Generated reports + signatures (cascade) created off demo sources, if any.
  await prisma.ticket.deleteMany({ where: { ticketNumber: { startsWith: PFX } } });

  console.log(`✅ Selesai. ${locIds.length} Gardu DEMO beserta turunannya & laporan DEMO dihapus.`);
}

main()
  .catch((e) => {
    console.error('❌ Pembersihan DEMO gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
